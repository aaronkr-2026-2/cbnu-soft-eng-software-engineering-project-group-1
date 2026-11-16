// Native collections: DDL is explicit; no startup creation or TTL-based validity.
import type { Db, Document, IndexDescription } from 'mongodb';
import { isDeepStrictEqual } from 'node:util';

export const RECOVERY_LIMITS = 'member_recovery_send_limits';
export const RECOVERY_REQUESTS = 'member_recovery_requests';
export const RECOVERY_TOKENS = 'member_recovery_tokens';
export const RECOVERY_CONFIRMATIONS = 'member_recovery_confirmations';

const date = { bsonType: 'date' };
const opaque = { bsonType: 'string', pattern: '^[A-Za-z0-9_-]{43}$' };
const email = {
  bsonType: 'string',
  maxLength: 254,
  pattern: '^[^A-Z\\s@]+@[^A-Z\\s@]+$',
};
const integer = (maximum?: number) => ({
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  multipleOf: 1,
  ...(maximum === undefined ? {} : { maximum }),
});
const object = (properties: Document, required = Object.keys(properties)) => ({
  bsonType: 'object',
  additionalProperties: false,
  required,
  properties,
});
const lease = object({ id: opaque, until: date });
const cleanup: IndexDescription = {
  key: { cleanupAt: 1 },
  expireAfterSeconds: 0,
  name: 'recovery_cleanup_ttl',
};
const jobIndexes: IndexDescription[] = [
  { key: { state: 1, nextAttemptAt: 1, _id: 1 }, name: 'recovery_due' },
  { key: { 'lease.until': 1 }, name: 'recovery_lease' },
  cleanup,
];
const jobProperties = {
  attempts: integer(3),
  createdAt: date,
  expiresAt: date,
  nextAttemptAt: date,
  cleanupAt: date,
  lease,
};
// A claim always has a lease; a terminal/queued record never retains one.
const jobValidator = (schema: Document) => ({
  $and: [
    { $jsonSchema: schema },
    {
      $or: [
        { state: 'LEASED', lease: { $exists: true } },
        { state: { $ne: 'LEASED' }, lease: { $exists: false } },
      ],
    },
  ],
});

const definitions: {
  name: string;
  validator: Document;
  indexes: IndexDescription[];
}[] = [
  {
    name: RECOVERY_LIMITS,
    validator: {
      $jsonSchema: object(
        {
          _id: email,
          version: integer(),
          initialSent: { bsonType: 'bool' },
          groupCount: integer(2),
          blockLevel: integer(3),
          blockedUntil: date,
          nextSendAt: date,
          lastSendAttemptAt: date,
          pending: lease,
        },
        [
          '_id',
          'version',
          'initialSent',
          'groupCount',
          'blockLevel',
          'blockedUntil',
          'nextSendAt',
          'lastSendAttemptAt',
        ],
      ),
    },
    // Escalation must survive cleanup of requests/tokens. No rate-state TTL.
    indexes: [],
  },
  {
    name: RECOVERY_REQUESTS,
    validator: jobValidator(
      object(
        {
          _id: opaque,
          email,
          requestId: {
            bsonType: 'string',
            pattern:
              '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
          },
          state: {
            enum: [
              'QUEUED',
              'LEASED',
              'ACCEPTED',
              'AMBIGUOUS',
              'REJECTED',
              'SUPPRESSED',
              'EXPIRED',
              'CANCELED',
            ],
          },
          ...jobProperties,
        },
        [
          '_id',
          'email',
          'requestId',
          'state',
          'attempts',
          'createdAt',
          'expiresAt',
          'nextAttemptAt',
          'cleanupAt',
        ],
      ),
    ),
    indexes: [
      {
        key: { email: 1, requestId: 1 },
        unique: true,
        name: 'recovery_request_unique',
      },
      ...jobIndexes,
    ],
  },
  {
    name: RECOVERY_TOKENS,
    validator: {
      $jsonSchema: object(
        {
          _id: { bsonType: 'objectId' },
          email,
          jobId: opaque,
          generation: opaque,
          tokenHash: { bsonType: 'string', pattern: '^[a-f0-9]{64}$' },
          authVersion: integer(),
          createdAt: date,
          expiresAt: date,
          cleanupAt: date,
          consumedAt: date,
        },
        [
          '_id',
          'email',
          'jobId',
          'generation',
          'tokenHash',
          'authVersion',
          'createdAt',
          'expiresAt',
          'cleanupAt',
        ],
      ),
    },
    indexes: [
      {
        key: { tokenHash: 1 },
        unique: true,
        name: 'recovery_token_hash_unique',
      },
      cleanup,
    ],
  },
  {
    name: RECOVERY_CONFIRMATIONS,
    validator: jobValidator(
      object(
        {
          _id: opaque,
          memberId: { bsonType: 'objectId' },
          email,
          state: { enum: ['QUEUED', 'LEASED', 'SENT', 'FAILED'] },
          ...jobProperties,
        },
        [
          '_id',
          'memberId',
          'email',
          'state',
          'attempts',
          'createdAt',
          'expiresAt',
          'nextAttemptAt',
          'cleanupAt',
        ],
      ),
    ),
    indexes: jobIndexes,
  },
];

async function assertReplicaSet(db: Db) {
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid')
    throw new Error('Password recovery requires replica-set transactions');
}

export async function setupPasswordRecoveryStorage(db: Db) {
  // Reject standalone before making any changes.
  await assertReplicaSet(db);
  for (const definition of definitions) {
    const options = {
      validator: definition.validator,
      validationLevel: 'strict' as const,
      validationAction: 'error' as const,
    };
    if (!(await db.listCollections({ name: definition.name }).hasNext())) {
      await db.createCollection(definition.name, {
        collation: { locale: 'simple' },
        ...options,
      });
    } else {
      const info = await db
        .listCollections({ name: definition.name }, { nameOnly: false })
        .next();
      if (
        info?.options?.collation &&
        info.options.collation.locale !== 'simple'
      )
        throw new Error('Password recovery storage requires simple collation');
      await db.command({ collMod: definition.name, ...options });
    }
    if (definition.indexes.length)
      await db.collection(definition.name).createIndexes(definition.indexes);
  }
  await assertPasswordRecoveryStorage(db);
}

export async function assertPasswordRecoveryStorage(db: Db) {
  await assertReplicaSet(db);
  for (const definition of definitions) {
    const info = await db
      .listCollections({ name: definition.name }, { nameOnly: false })
      .next();
    if (
      !info ||
      info.type !== 'collection' ||
      (info.options?.collation && info.options.collation.locale !== 'simple') ||
      info.options?.validationLevel !== 'strict' ||
      info.options?.validationAction !== 'error' ||
      !isDeepStrictEqual(info.options?.validator, definition.validator)
    )
      throw new Error('Password recovery validators are not ready');

    const actual = await db.collection(definition.name).listIndexes().toArray();
    for (const expected of definition.indexes) {
      const found = actual.find((index) => index.name === expected.name);
      if (
        !found ||
        !isDeepStrictEqual(found.key, expected.key) ||
        Boolean(found.unique) !== Boolean(expected.unique) ||
        Boolean(found.sparse) !== Boolean(expected.sparse) ||
        found.expireAfterSeconds !== expected.expireAfterSeconds ||
        found.partialFilterExpression ||
        found.hidden ||
        (found.collation && found.collation.locale !== 'simple')
      )
        throw new Error('Password recovery indexes are not ready');
    }
  }
}
