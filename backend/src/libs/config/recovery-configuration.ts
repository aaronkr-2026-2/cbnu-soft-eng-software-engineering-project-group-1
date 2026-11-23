export function recoveryWebOrigin(env: {
  PASSWORD_RESET_WEB_ORIGIN?: string;
  NODE_ENV?: string;
}): string {
  const raw = env.PASSWORD_RESET_WEB_ORIGIN?.trim();
  if (!raw) throw new Error('Password recovery origin is unavailable');
  try {
    const url = new URL(raw);
    const local =
      env.NODE_ENV === 'development' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      raw !== url.origin
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error('Password recovery origin is unavailable');
  }
}
