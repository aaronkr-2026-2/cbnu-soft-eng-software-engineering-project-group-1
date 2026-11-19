import { getMongoUri, requireMongoUri } from './database.config.js';

describe('MongoDB configuration selection', () => {
  it('uses MONGO_URI consistently when aliases are also present', () => {
    const env = {
      MONGO_URI: 'mongodb://primary/test',
      MONGO_DEV: 'mongodb://dev/test',
      MONGO_PROD: 'mongodb+srv://prod/test',
    };
    expect(getMongoUri(env)).toBe(env.MONGO_URI);
    expect(requireMongoUri(env)).toBe(env.MONGO_URI);
  });

  it('never selects development credentials in production', () => {
    expect(
      requireMongoUri({
        NODE_ENV: 'production',
        MONGO_DEV: 'mongodb://dev/test',
        MONGO_PROD: 'mongodb+srv://prod/test',
      }),
    ).toBe('mongodb+srv://prod/test');
    expect(() =>
      requireMongoUri({
        NODE_ENV: 'production',
        MONGO_DEV: 'mongodb://dev/test',
      }),
    ).toThrow('Missing MongoDB configuration');
  });

  it('allows an unconfigured test module but refuses an unconfigured startup', () => {
    expect(getMongoUri({})).toBeUndefined();
    expect(() => requireMongoUri({})).toThrow('Missing MongoDB configuration');
    expect(requireMongoUri({ MONGO_DEV: ' mongodb://localhost/test ' })).toBe(
      'mongodb://localhost/test',
    );
  });

  it('does not silently fall back from an explicit invalid override or expose it', () => {
    expect(() =>
      requireMongoUri({ MONGO_URI: '', MONGO_DEV: 'mongodb://dev/test' }),
    ).toThrow('Missing MongoDB configuration');
    expect(() =>
      requireMongoUri({ MONGO_URI: 'private-invalid-value' }),
    ).toThrow('Invalid MongoDB configuration');
    expect(() =>
      requireMongoUri({
        NODE_ENV: 'production',
        MONGO_URI: 'mongodb://localhost/test',
      }),
    ).toThrow('Production MongoDB must use');
  });
});
