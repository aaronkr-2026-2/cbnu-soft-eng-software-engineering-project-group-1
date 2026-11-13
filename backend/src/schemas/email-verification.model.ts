// Native collections use explicit setup, never automatic application-startup DDL.
import type { Db, IndexDescription } from 'mongodb';
export const EMAIL_LIMITS = 'member_email_send_limits';
export const EMAIL_VERIFICATIONS = 'member_email_verifications';
const indexes: IndexDescription[] = [
  {
    key: { email: 1, requestId: 1 },
    unique: true,
    name: 'email_request_unique',
  },
  {
    key: { proofHash: 1 },
    unique: true,
    sparse: true,
    name: 'email_proof_unique',
  },
  { key: { cleanupAt: 1 }, expireAfterSeconds: 0, name: 'email_cleanup_ttl' },
];
export async function setupEmailVerificationStorage(db: Db) {
  for (const name of [EMAIL_LIMITS, EMAIL_VERIFICATIONS]) {
    if (!(await db.listCollections({ name }).hasNext())) {
      await db.createCollection(name, { collation: { locale: 'simple' } });
    }
  }
  await db.collection(EMAIL_VERIFICATIONS).createIndexes(indexes);
  await assertEmailVerificationStorage(db);
}
export async function assertEmailVerificationStorage(db: Db) {
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid')
    throw new Error('Replica set required');
  for (const name of [EMAIL_LIMITS, EMAIL_VERIFICATIONS]) {
    const info = await db.listCollections({ name }, { nameOnly: false }).next();
    if (
      !info ||
      (info.options?.collation && info.options.collation.locale !== 'simple')
    )
      throw new Error('Email verification storage requires simple collation');
  }
  const actual = await db
    .collection(EMAIL_VERIFICATIONS)
    .listIndexes()
    .toArray();
  for (const expected of indexes) {
    const found = actual.find((index) => index.name === expected.name);
    if (
      !found ||
      JSON.stringify(found.key) !== JSON.stringify(expected.key) ||
      Boolean(found.unique) !== Boolean(expected.unique) ||
      Boolean(found.sparse) !== Boolean(expected.sparse) ||
      found.expireAfterSeconds !== expected.expireAfterSeconds ||
      found.partialFilterExpression ||
      (found.collation && found.collation.locale !== 'simple')
    )
      throw new Error('Email verification indexes are not ready');
  }
}
