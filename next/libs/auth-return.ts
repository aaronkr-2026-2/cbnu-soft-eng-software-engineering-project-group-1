export function authReturn(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.length > 1024
  )
    return '/';
  try {
    const url = new URL(value, 'https://medconnect.invalid');
    if (
      url.origin !== 'https://medconnect.invalid' ||
      !['/book', '/appointments', '/waitlist', '/workspace'].includes(
        url.pathname,
      )
    )
      return '/';
    return `${url.pathname}${url.search}`;
  } catch {
    return '/';
  }
}
