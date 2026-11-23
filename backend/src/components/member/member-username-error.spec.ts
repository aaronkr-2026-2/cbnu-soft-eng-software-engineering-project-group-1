import {
  isUsernameDuplicate,
  UsernameTakenException,
} from './member-username-error.js';

describe('Username write conflicts', () => {
  it.each(['memberNick', 'memberNickNormalized'])(
    'recognizes the database username key %s',
    (key) => {
      expect(
        isUsernameDuplicate({ code: 11000, keyPattern: { [key]: 1 } }),
      ).toBe(true);
    },
  );
  it.each([
    undefined,
    null,
    {},
    { code: 11000 },
    { code: 121, keyPattern: { memberNick: 1 } },
    { code: 11000, keyPattern: { memberPhone: 1 } },
    { code: 11000, keyPattern: { memberEmail: 1 } },
    { code: 11000, keyPattern: null },
  ])('does not mislabel another failure: %j', (error) => {
    expect(isUsernameDuplicate(error)).toBe(false);
  });
  it('returns a safe field-specific conflict without database details', () => {
    const failure = new UsernameTakenException();
    expect(failure.getStatus()).toBe(409);
    expect(failure.getResponse()).toEqual({
      statusCode: 409,
      message: 'Username is already in use',
      reason: 'USERNAME_TAKEN',
      field: 'memberNick',
    });
  });
});
