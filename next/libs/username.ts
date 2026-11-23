export const USERNAME_HELP =
  '6–40 characters: English letters, numbers, _ # $ % ! & ?. Usernames ignore letter case. Enter the text without @.';
export const USERNAME_ERROR =
  'Use 6–40 English letters, numbers, or _ # $ % ! & ?; do not include @ or spaces.';

// Match the API rule without changing the spelling sent to the server.
export function usernameError(value: string): string | undefined {
  const username = value.trim();
  if (
    username.length < 6 ||
    username.length > 40 ||
    !/^[A-Za-z0-9_#$%!&?]+$/.test(username)
  )
    return USERNAME_ERROR;
  return undefined;
}

// Presentation only. Never use this value in drafts or API requests.
export function displayUsername(value: string): string {
  return `@${value.trim()}`;
}

// Only this exact pair is safe to expose through the authentication bridge.
export function isUsernameTaken(value: unknown): boolean {
  const marker = value as { reason?: unknown; field?: unknown } | null;
  return marker?.reason === 'USERNAME_TAKEN' && marker.field === 'memberNick';
}
