import { ConflictException } from '@nestjs/common';

export class UsernameTakenException extends ConflictException {
  readonly reason = 'USERNAME_TAKEN';
  readonly field = 'memberNick';

  constructor() {
    super({
      statusCode: 409,
      message: 'Username is already in use',
      reason: 'USERNAME_TAKEN',
      field: 'memberNick',
    });
  }
}

export function isUsernameDuplicate(error: unknown): boolean {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 11000 ||
    !('keyPattern' in error)
  )
    return false;
  const key = error.keyPattern;
  return (
    !!key &&
    typeof key === 'object' &&
    !Array.isArray(key) &&
    (Object.hasOwn(key, 'memberNickNormalized') ||
      Object.hasOwn(key, 'memberNick'))
  );
}
