type MongoEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, 'MONGO_URI' | 'MONGO_DEV' | 'MONGO_PROD' | 'NODE_ENV'>
>;

export function getMongoUri(env: MongoEnvironment = process.env) {
  return (
    env.MONGO_URI ??
    (env.NODE_ENV === 'production' ? env.MONGO_PROD : env.MONGO_DEV)
  )?.trim();
}

export function requireMongoUri(env: MongoEnvironment = process.env) {
  const uri = getMongoUri(env);
  if (!uri) {
    throw new Error(
      'Missing MongoDB configuration. Set MONGO_URI (or MONGO_DEV/MONGO_PROD).',
    );
  }
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error('Invalid MongoDB configuration');
  }
  if (env.NODE_ENV === 'production' && !uri.startsWith('mongodb+srv://')) {
    throw new Error(
      'Production MongoDB must use a TLS-enabled mongodb+srv:// connection string.',
    );
  }
  return uri;
}
