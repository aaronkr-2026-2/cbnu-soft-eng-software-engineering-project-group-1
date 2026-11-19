import { isValidUsername, normalizeUsername } from './member-username.js';

describe('Username policy', () => {
  it.each([
    'Alex_1',
    'a'.repeat(40),
    '123456',
    'google_user12345678',
    'Aa1_#$%!&?',
  ])('accepts a valid username: %s', (value) =>
    expect(isValidUsername(value)).toBe(true),
  );

  it.each([
    undefined,
    null,
    123456,
    { $ne: null },
    ['Alex_1'],
    '',
    'Alex1',
    'a'.repeat(41),
    'Alex 1',
    'Alex-1',
    'Alex.1',
    'Alex@1',
    'Alex/1',
    'Aléx_1',
    'Ａlex_1',
    'Alex\n1',
    'Alex_1\n',
    'Alex\u00001',
    'Alex\u200b1',
    ' Alex_1 ',
  ])('rejects invalid or untrimmed input: %j', (value) => {
    expect(isValidUsername(value)).toBe(false);
  });

  it('maps case variants and surrounding whitespace to the same comparison key', () => {
    const keys = ['Alex_1', 'alex_1', 'aLEX_1', ' ALEX_1 '].map(
      normalizeUsername,
    );
    expect(new Set(keys)).toEqual(new Set(['alex_1']));
    expect(normalizeUsername('Other_1')).not.toBe(keys[0]);
    expect(normalizeUsername(' Alex#$%!&?_1 ')).toBe('alex#$%!&?_1');
    expect(normalizeUsername('Alex#1')).not.toBe(normalizeUsername('Alex?1'));
  });
});
