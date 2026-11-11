import { isUsernameTaken } from '../username';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'node:crypto';

type TokenResult = {
  member: {
    _id: string;
    memberNick: string;
    memberType: string;
    memberFullName?: string;
  };
  accessToken: string;
  refreshToken: string;
};
const refreshes = new Map<
  string,
  { until: number; result: Promise<TokenResult> }
>();
const secure = () => process.env.NODE_ENV === 'production';
const refreshName = () =>
  secure() ? '__Secure-medconnect_refresh' : 'medconnect_refresh';
const nonceName = () =>
  secure() ? '__Secure-medconnect_nonce' : 'medconnect_nonce';
function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/api/session; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure() ? '; Secure' : ''}`;
}
function baseUrl() {
  const raw =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim().replace(/\/graphql\/?$/, '');
  if (!raw) throw new Error('API unavailable');
  const url = new URL(raw);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid API configuration');
  return url.href.replace(/\/$/, '');
}
class AuthFailure extends Error {
  constructor(
    readonly status: number,
    readonly usernameTaken = false,
  ) {
    super('Authentication unavailable');
  }
}
async function upstream(path: string, input: object, cookieHeader?: string) {
  const response = await fetch(`${baseUrl()}/member/${path}`, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const detail =
      response.status === 409 ? await response.json().catch(() => null) : null;
    throw new AuthFailure(
      [400, 401, 403, 409, 429].includes(response.status)
        ? response.status
        : 503,
      path === 'signup' && isUsernameTaken(detail),
    );
  }
  return response;
}
async function tokenResult(response: Response): Promise<TokenResult> {
  const value = await response.json();
  if (
    typeof value?.accessToken !== 'string' ||
    typeof value?.refreshToken !== 'string' ||
    !/^[A-Za-z0-9_-]{32,512}$/.test(value.refreshToken) ||
    !/^[a-f\d]{24}$/i.test(value.member?._id) ||
    typeof value.member?.memberNick !== 'string' ||
    !['USER', 'DOCTOR', 'CLINIC', 'ADMIN'].includes(value.member?.memberType)
  )
    throw new AuthFailure(503);
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    member: {
      _id: value.member._id,
      memberNick: value.member.memberNick,
      memberType: value.member.memberType,
      ...(typeof value.member.memberFullName === 'string'
        ? { memberFullName: value.member.memberFullName }
        : {}),
    },
  };
}
async function refresh(token: string) {
  const key = createHash('sha256').update(token).digest('hex');
  const now = Date.now();
  for (const [id, entry] of refreshes)
    if (entry.until < now) refreshes.delete(id);
  const existing = refreshes.get(key);
  if (existing) return existing.result;
  if (refreshes.size >= 128) refreshes.delete(refreshes.keys().next().value!);
  const result = upstream('refresh', { refreshToken: token }).then(tokenResult);
  const entry = { until: now + 15000, result };
  refreshes.set(key, entry);
  try {
    const value = await result;
    entry.until = Date.now() + 2000;
    const cleanup = setTimeout(() => {
      if (refreshes.get(key) === entry) refreshes.delete(key);
    }, 2000);
    cleanup.unref();
    return value;
  } catch (error) {
    refreshes.delete(key);
    throw error;
  }
}
export async function sessionProxy(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }
  // No cross-origin session writes, forwarding of arbitrary cookies, or URL tokens.
  let sameOrigin = false;
  try {
    const origin = new URL(req.headers.origin || '');
    sameOrigin =
      origin.host === req.headers.host &&
      ['http:', 'https:'].includes(origin.protocol);
  } catch {
    /* reject */
  }
  if (
    !sameOrigin ||
    req.headers['x-medconnect-session'] !== '1' ||
    !req.headers['content-type']?.startsWith('application/json')
  ) {
    res.status(403).json({ error: 'Invalid session request' });
    return;
  }
  const action = req.query.action;
  const body = req.body ?? {};
  if (action === 'logout') {
    res.setHeader('Set-Cookie', [
      cookie(refreshName(), '', 0),
      cookie(nonceName(), '', 0),
    ]);
    res.status(200).json({ signedOut: true });
    return;
  }
  if (
    !['login', 'signup', 'google', 'nonce', 'refresh'].includes(String(action))
  ) {
    res.status(404).end();
    return;
  }
  try {
    if (action === 'nonce') {
      const response = await upstream('google/nonce', {});
      const value = await response.json();
      const set = response.headers.get('set-cookie') || '';
      const match =
        /(?:^|,\s*)(__Host-medconnect_google_nonce|medconnect_google_nonce)=([A-Za-z0-9._-]+)/.exec(
          set,
        );
      if (
        !match ||
        typeof value?.nonce !== 'string' ||
        !value.nonce ||
        value.nonce.length > 4096
      )
        throw new AuthFailure(503);
      res.setHeader(
        'Set-Cookie',
        cookie(nonceName(), `${match[1]}:${match[2]}`, 300),
      );
      res.status(200).json({ nonce: value.nonce });
      return;
    }
    let result: TokenResult;
    if (action === 'refresh') {
      const token = req.cookies[refreshName()];
      if (!token || !/^[A-Za-z0-9_-]{32,512}$/.test(token))
        throw new AuthFailure(401);
      result = await refresh(token);
    } else if (action === 'google') {
      const nonce = req.cookies[nonceName()] || '';
      const match =
        /^(__Host-medconnect_google_nonce|medconnect_google_nonce):([A-Za-z0-9._-]+)$/.exec(
          nonce,
        );
      if (
        !match ||
        typeof body.idToken !== 'string' ||
        body.idToken.length > 8192
      )
        throw new AuthFailure(401);
      result = await tokenResult(
        await upstream(
          'google/login',
          { idToken: body.idToken },
          `${match[1]}=${match[2]}`,
        ),
      );
    } else {
      const input =
        action === 'signup'
          ? {
              memberEmail: body.memberEmail,
              memberPassword: body.memberPassword,
              memberNick: body.memberNick,
              memberPhone: body.memberPhone,
              memberFullName: body.memberFullName,
              memberType: 'USER',
            }
          : {
              memberEmail: body.memberEmail,
              memberPassword: body.memberPassword,
            };
      result = await tokenResult(await upstream(String(action), input));
    }
    res.setHeader('Set-Cookie', [
      cookie(refreshName(), result.refreshToken, 7 * 86400),
      ...(action === 'google' ? [cookie(nonceName(), '', 0)] : []),
    ]);
    // Refresh tokens are never returned to JavaScript or serialized page props.
    res
      .status(200)
      .json({ member: result.member, accessToken: result.accessToken });
  } catch (error) {
    const status = error instanceof AuthFailure ? error.status : 503;
    if (action === 'refresh' && [401, 403].includes(status))
      res.setHeader('Set-Cookie', cookie(refreshName(), '', 0));
    if (action === 'google')
      res.setHeader('Set-Cookie', cookie(nonceName(), '', 0));
    res.status(status).json({
      error: 'Session request could not be completed',
      ...(action === 'signup' &&
      error instanceof AuthFailure &&
      error.usernameTaken
        ? { reason: 'USERNAME_TAKEN', field: 'memberNick' }
        : {}),
    });
  }
}
