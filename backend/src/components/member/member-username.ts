import { ValidateBy, type ValidationOptions } from 'class-validator';

export const USERNAME_MIN_LENGTH = 6;
export const USERNAME_MAX_LENGTH = 40;
export const USERNAME_PATTERN = /^[A-Za-z0-9_#$%!&?]+$/;
export const USERNAME_VALIDATION_MESSAGE =
  'Username must contain 6–40 English letters, numbers, or these symbols: _ # $ % ! & ?.';

// DTOs trim surrounding whitespace before storing the display spelling.
export function isValidUsername(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(value)
  );
}

// Comparison key only; never replace the display spelling with this value.
// Database storage/index enforcement is introduced with the Step 2 migration.
export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function IsUsername(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUsername',
      validator: {
        validate: isValidUsername,
        defaultMessage: () => USERNAME_VALIDATION_MESSAGE,
      },
    },
    options,
  );
}
