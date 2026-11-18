import type { NextApiRequest, NextApiResponse } from 'next';
export async function recoveryProxy(req: NextApiRequest, res: NextApiResponse, base: string) {
  const reset = req.query.action === 'password-reset';
  const body = req.body;
  const fields = reset ? ['token', 'newPassword', 'confirmPassword'] : ['memberEmail', 'requestId'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k)) ||
    fields.some(k => typeof body[k] !== 'string') || (reset ? !/^[A-Za-z0-9_-]{43}$/.test(body.token) ||
      [...body.newPassword].length < 8 || [...body.newPassword].length > 100 || body.newPassword !== body.confirmPassword
      : body.memberEmail.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(body.memberEmail.trim()) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId))) {
    res.status(400).json({ reason: 'INVALID_REQUEST' }); return;
  }
  try {
    const response = await fetch(`${base}/member/password-recovery/${reset ? 'reset' : 'request'}`, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(fields.map(k => [k, body[k]]))),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      const status = [400, 429].includes(response.status) ? response.status : 503;
      const reason = status === 429 ? 'PASSWORD_RECOVERY_THROTTLED' : status === 400 && value?.reason === 'PASSWORD_RECOVERY_INVALID' ? 'PASSWORD_RECOVERY_INVALID' : status === 400 ? 'INVALID_REQUEST' : 'PASSWORD_RECOVERY_UNAVAILABLE';
      const seconds = Number(value?.retryAfterSeconds);
      const retryAfterSeconds = status === 429 && Number.isInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : undefined;
      if (retryAfterSeconds) res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(status).json({ reason, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) }); return;
    }
    if (response.status !== (reset ? 200 : 202) || value?.[reset ? 'passwordChanged' : 'accepted'] !== true) throw new Error();
    if (reset) {
      const name = process.env.NODE_ENV === 'production' ? '__Secure-medconnect_refresh' : 'medconnect_refresh';
      res.setHeader('Set-Cookie', `${name}=; Path=/api/session; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    }
    res.status(reset ? 200 : 202).json(reset ? { passwordChanged: true } : { accepted: true });
  } catch { res.status(503).json({ reason: 'PASSWORD_RECOVERY_UNAVAILABLE' }); }
}
