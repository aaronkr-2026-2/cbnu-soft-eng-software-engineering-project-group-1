import type { Db, Document } from 'mongodb';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './member-username.js';

export const USERNAME_INDEX = 'member_username_normalized_unique';
export const USERNAME_VALIDATOR: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['memberNick', 'memberNickNormalized'],
    properties: {
      memberNick: {
        bsonType: 'string',
        minLength: USERNAME_MIN_LENGTH,
        maxLength: USERNAME_MAX_LENGTH,
        pattern: USERNAME_PATTERN.source,
      },
      memberNickNormalized: {
        bsonType: 'string',
        pattern: '^[a-z0-9_#$%!&?]+$',
      },
    },
  },
  $expr: {
    $cond: [
      { $eq: [{ $type: '$memberNick' }, 'string'] },
      {
        $and: [
          { $eq: ['$memberNick', { $trim: { input: '$memberNick' } }] },
          { $eq: ['$memberNickNormalized', { $toLower: '$memberNick' }] },
        ],
      },
      false,
    ],
  },
};

// Only conjunctions count: an $or containing our validator is not enforcement.
export function hasUsernameValidator(value: Document): boolean {
  return (
    JSON.stringify(value) === JSON.stringify(USERNAME_VALIDATOR) ||
    (Array.isArray(value.$and) && value.$and.some(hasUsernameValidator))
  );
}

export async function assertUsernameStorage(db: Db): Promise<void> {
  const info = await db
    .listCollections({ name: 'members' }, { nameOnly: false })
    .next();
  const options = info?.options;
  const indexes = info
    ? await db.collection('members').listIndexes().toArray()
    : [];
  const index = indexes.find((entry) => entry.name === USERNAME_INDEX);
  if (
    !index?.unique ||
    index.sparse ||
    index.partialFilterExpression ||
    Object.keys(index.key).length !== 1 ||
    index.key.memberNickNormalized !== 1 ||
    (index.collation && index.collation.locale !== 'simple') ||
    (options?.collation && options.collation.locale !== 'simple') ||
    !hasUsernameValidator(options?.validator ?? {}) ||
    options?.validationLevel !== 'strict' ||
    options?.validationAction !== 'error' ||
    (await db
      .collection('members')
      .findOne({ $nor: [USERNAME_VALIDATOR] }, { projection: { _id: 1 } }))
  ) {
    throw new Error(
      'Username storage is not ready. Stop writers and run member:username:migrate before starting the API.',
    );
  }
}
