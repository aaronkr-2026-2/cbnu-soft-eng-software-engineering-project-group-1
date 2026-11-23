import {
  configurationFor,
  type ApplicationEnvironment,
} from '../libs/config/application-config.service.js';
type MongoEnvironment = Pick<
  ApplicationEnvironment,
  'MONGO_URI' | 'MONGO_DEV' | 'MONGO_PROD' | 'NODE_ENV'
>;
export function getMongoUri(env?: MongoEnvironment) {
  return configurationFor(env).mongoUri;
}
export function requireMongoUri(env?: MongoEnvironment) {
  return configurationFor(env).requireMongoUri();
}
