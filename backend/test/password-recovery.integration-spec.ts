import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createConnection, type Connection } from 'mongoose';
import { ObjectId } from 'mongodb';
import express from 'express';
import request from 'supertest';
import {
  setupPasswordRecoveryStorage,
  assertPasswordRecoveryStorage,
  RECOVERY_LIMITS,
  RECOVERY_REQUESTS,
  RECOVERY_TOKENS,
  RECOVERY_CONFIRMATIONS,
  RECOVERY_ADMISSION,
} from '../src/schemas/password-recovery.model.js';
import {
  RECOVERY_LIFETIME,
  RECOVERY_RETENTION,
  newRecoveryToken,
  recoveryTokenHash,
  recoveryRequestRateLimit,
  recoveryResetRateLimit,
} from '../src/components/auth/password-recovery-policy.js';
import type {
  RecoveryRequest,
  RecoveryToken,
  RecoverySendLimit,
  RecoveryConfirmation,
} from '../src/libs/types/password-recovery.types.js';

const timestamp = new Date('2035-01-01T00:00:00Z');
const makeRequest = (): RecoveryRequest => ({
  _id: newRecoveryToken(),
  email: 'patient@example.test',
  requestId: randomUUID(),
  state: 'QUEUED',
  attempts: 0,
  createdAt: timestamp,
  expiresAt: new Date(+timestamp + RECOVERY_LIFETIME),
  nextAttemptAt: timestamp,
  cleanupAt: new Date(+timestamp + RECOVERY_RETENTION),
});
const makeToken = (): RecoveryToken => ({
  _id: new ObjectId(),
  email: 'patient@example.test',
  jobId: newRecoveryToken(),
  generation: newRecoveryToken(),
  tokenHash: recoveryTokenHash(newRecoveryToken()),
  authVersion: 0,
  createdAt: timestamp,
  expiresAt: new Date(+timestamp + RECOVERY_LIFETIME),
  cleanupAt: new Date(+timestamp + RECOVERY_RETENTION),
});
const makeLimit = (): RecoverySendLimit => ({
  _id: 'patient@example.test',
  version: 0,
  initialSent: false,
  groupCount: 0,
  blockLevel: 0,
  blockedUntil: new Date(0),
  nextSendAt: new Date(0),
  lastSendAttemptAt: timestamp,
});
const makeConfirmation = (): RecoveryConfirmation => ({
  _id: newRecoveryToken(),
  memberId: new ObjectId(),
  email: 'patient@example.test',
  state: 'QUEUED',
  attempts: 0,
  createdAt: timestamp,
  nextAttemptAt: timestamp,
  expiresAt: new Date(+timestamp + RECOVERY_LIFETIME),
  cleanupAt: new Date(+timestamp + RECOVERY_RETENTION),
});

describe('Recovery storage foundations on disposable MongoDB', () => {
  let connection: Connection;
  const db = () => connection.db!;
  beforeAll(async () => {
    if (process.env.BOOKING_TEST_DISPOSABLE !== '1')
      throw new Error('Use the disposable runner');
    connection = await createConnection(process.env.BOOKING_TEST_URI!, {
      dbName: 'recovery_' + randomUUID(),
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await setupPasswordRecoveryStorage(db());
  });
  beforeEach(async () => {
    for (const name of [
      RECOVERY_LIMITS,
      RECOVERY_REQUESTS,
      RECOVERY_TOKENS,
      RECOVERY_CONFIRMATIONS,
    ])
      await db().collection(name).deleteMany({});
  });
  afterAll(async () => {
    if (connection) {
      await db().dropDatabase();
      await connection.close();
    }
  });

  it('supports idempotent explicit setup and read-only readiness checks', async () => {
    await setupPasswordRecoveryStorage(db());
    await assertPasswordRecoveryStorage(db());
    const indexes = await db().collection(RECOVERY_TOKENS).indexes();
    expect(
      indexes.find((row) => row.name === 'recovery_token_hash_unique')?.unique,
    ).toBe(true);
    expect(
      indexes.find((row) => row.name === 'recovery_cleanup_ttl')
        ?.expireAfterSeconds,
    ).toBe(0);
    expect(
      (await db().collection(RECOVERY_LIMITS).indexes()).map((row) => row.name),
    ).toEqual(['_id_', 'recovery_limit_activity']);
  });

  it('fails closed on a missing collection without recreating it during check', async () => {
    await db().collection(RECOVERY_CONFIRMATIONS).drop();
    await expect(assertPasswordRecoveryStorage(db())).rejects.toThrow(
      'validators are not ready',
    );
    expect(
      await db().listCollections({ name: RECOVERY_CONFIRMATIONS }).hasNext(),
    ).toBe(false);
    await setupPasswordRecoveryStorage(db());
  });

  it('rejects weakened native validators and repairs them only through explicit setup', async () => {
    await db().command({ collMod: RECOVERY_TOKENS, validationAction: 'warn' });
    await expect(assertPasswordRecoveryStorage(db())).rejects.toThrow(
      'validators are not ready',
    );
    await setupPasswordRecoveryStorage(db());
  });

  it('rejects missing uniqueness and a changed TTL deadline', async () => {
    await db()
      .collection(RECOVERY_TOKENS)
      .dropIndex('recovery_token_hash_unique');
    await expect(assertPasswordRecoveryStorage(db())).rejects.toThrow(
      'indexes are not ready',
    );
    await setupPasswordRecoveryStorage(db());
    await db().command({
      collMod: RECOVERY_TOKENS,
      index: { name: 'recovery_cleanup_ttl', expireAfterSeconds: 60 },
    });
    await expect(assertPasswordRecoveryStorage(db())).rejects.toThrow(
      'indexes are not ready',
    );
    await db().command({
      collMod: RECOVERY_TOKENS,
      index: { name: 'recovery_cleanup_ttl', expireAfterSeconds: 0 },
    });
    await assertPasswordRecoveryStorage(db());
  });

  it('requires the shared admission guard and restores it only through explicit setup', async () => {
    await db()
      .collection<{ _id: string }>(RECOVERY_ADMISSION)
      .deleteOne({ _id: 'global' });
    await expect(assertPasswordRecoveryStorage(db())).rejects.toThrow(
      'admission guard is not ready',
    );
    await setupPasswordRecoveryStorage(db());
    await assertPasswordRecoveryStorage(db());
  });

  it('allows only one concurrent email/request ID and one token slot per member', async () => {
    const first = makeRequest();
    const jobs = db().collection<RecoveryRequest>(RECOVERY_REQUESTS);
    const inserts = await Promise.allSettled([
      jobs.insertOne(first),
      jobs.insertOne({ ...first, _id: newRecoveryToken() }),
    ]);
    expect(inserts.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(await jobs.countDocuments({})).toBe(1);
    const token = makeToken();
    await db().collection<RecoveryToken>(RECOVERY_TOKENS).insertOne(token);
    await expect(
      db()
        .collection<RecoveryToken>(RECOVERY_TOKENS)
        .insertOne({
          ...token,
          tokenHash: recoveryTokenHash(newRecoveryToken()),
        }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(
      db()
        .collection<RecoveryToken>(RECOVERY_TOKENS)
        .insertOne({ ...token, _id: new ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('serializes rate-state creation and compare-and-swap updates across callers', async () => {
    const limits = db().collection<RecoverySendLimit>(RECOVERY_LIMITS);
    const initial = makeLimit();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        limits.updateOne(
          { _id: initial._id },
          { $setOnInsert: initial },
          { upsert: true },
        ),
      ),
    );
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 11000 });
    expect(await limits.countDocuments({})).toBe(1);
    const writes = await Promise.all(
      [1, 2].map(() =>
        limits.updateOne(
          { _id: initial._id, version: 0 },
          {
            $inc: { version: 1 },
            $set: { nextSendAt: new Date(+timestamp + 60_000) },
          },
        ),
      ),
    );
    expect(writes.reduce((total, row) => total + row.modifiedCount, 0)).toBe(1);
  });

  it('rolls back token consumption and rate-state changes together', async () => {
    const token = makeToken();
    await db().collection<RecoveryToken>(RECOVERY_TOKENS).insertOne(token);
    await db()
      .collection<RecoverySendLimit>(RECOVERY_LIMITS)
      .insertOne(makeLimit());
    const session = await connection.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await db()
            .collection(RECOVERY_TOKENS)
            .updateOne(
              { _id: token._id },
              { $set: { consumedAt: timestamp } },
              { session },
            );
          await db()
            .collection<RecoverySendLimit>(RECOVERY_LIMITS)
            .updateOne(
              { _id: token.email },
              { $inc: { version: 1 } },
              { session },
            );
          throw new Error('synthetic rollback');
        }),
      ).rejects.toThrow('synthetic rollback');
      expect(
        await db().collection(RECOVERY_TOKENS).findOne({ _id: token._id }),
      ).not.toHaveProperty('consumedAt');
      expect(
        await db()
          .collection<RecoverySendLimit>(RECOVERY_LIMITS)
          .findOne({ _id: token.email }),
      ).toMatchObject({ version: 0 });
    } finally {
      await session.endSession();
    }
  });

  it.each([
    [
      'plaintext token',
      RECOVERY_TOKENS,
      () => ({ ...makeToken(), token: newRecoveryToken() }),
    ],
    [
      'malformed digest',
      RECOVERY_TOKENS,
      () => ({ ...makeToken(), tokenHash: 'not-a-hash' }),
    ],
    [
      'negative version',
      RECOVERY_TOKENS,
      () => ({ ...makeToken(), authVersion: -1 }),
    ],
    [
      'raw password',
      RECOVERY_CONFIRMATIONS,
      () => ({ ...makeConfirmation(), password: 'not-allowed' }),
    ],
    [
      'unbounded attempts',
      RECOVERY_REQUESTS,
      () => ({ ...makeRequest(), attempts: 4 }),
    ],
    [
      'fractional attempts',
      RECOVERY_REQUESTS,
      () => ({ ...makeRequest(), attempts: 0.5 }),
    ],
    [
      'missing lease',
      RECOVERY_REQUESTS,
      () => ({ ...makeRequest(), state: 'LEASED' }),
    ],
    [
      'stale lease',
      RECOVERY_REQUESTS,
      () => ({
        ...makeRequest(),
        state: 'ACCEPTED',
        lease: { id: newRecoveryToken(), until: timestamp },
      }),
    ],
    [
      'noncanonical email',
      RECOVERY_REQUESTS,
      () => ({ ...makeRequest(), email: 'Patient@Example.test' }),
    ],
    [
      'invalid request ID',
      RECOVERY_REQUESTS,
      () => ({ ...makeRequest(), requestId: 'invalid' }),
    ],
    [
      'invalid block level',
      RECOVERY_LIMITS,
      () => ({ ...makeLimit(), blockLevel: 4 }),
    ],
    [
      'invalid group count',
      RECOVERY_LIMITS,
      () => ({ ...makeLimit(), groupCount: 3 }),
    ],
  ] as const)(
    'rejects %s at the native database boundary',
    async (_name, collection, row) => {
      await expect(
        db()
          .collection<{ _id: string | ObjectId }>(collection)
          .insertOne(row()),
      ).rejects.toMatchObject({ code: 121 });
    },
  );

  it('deduplicates token-free reset confirmation intents and accepts a valid lease', async () => {
    const intent = makeConfirmation();
    await db()
      .collection<RecoveryConfirmation>(RECOVERY_CONFIRMATIONS)
      .insertOne(intent);
    await expect(
      db()
        .collection<RecoveryConfirmation>(RECOVERY_CONFIRMATIONS)
        .insertOne(intent),
    ).rejects.toMatchObject({ code: 11000 });
    await db()
      .collection<RecoveryRequest>(RECOVERY_REQUESTS)
      .insertOne({
        ...makeRequest(),
        state: 'LEASED',
        lease: { id: newRecoveryToken(), until: new Date(+timestamp + 30_000) },
      });
  });

  it('rejects standalone setup without creating recovery collections', async () => {
    const standalone = await createConnection(
      process.env.BOOKING_TEST_STANDALONE_URI!,
      { dbName: 'recovery_standalone_' + randomUUID() },
    ).asPromise();
    try {
      await expect(
        setupPasswordRecoveryStorage(standalone.db!),
      ).rejects.toThrow('replica-set transactions');
      expect(await standalone.db!.listCollections().toArray()).toHaveLength(0);
    } finally {
      await standalone.db!.dropDatabase();
      await standalone.close();
    }
  });

  it('checks compiled CLI apply/check/default and sanitizes invalid argument failures', async () => {
    const name = 'recovery_cli_' + randomUUID();
    const other = connection.getClient().db(name);
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      MONGO_URI: process.env.BOOKING_TEST_URI!.replace('/?', '/' + name + '?'),
    };
    const run = (args: string[]) =>
      promisify(execFile)(
        process.execPath,
        ['dist/tools/password-recovery-storage.js', ...args],
        { cwd: process.cwd(), env },
      );
    try {
      await expect(run(['--check'])).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Password recovery storage is unavailable',
        ),
      });
      expect(await other.listCollections().toArray()).toHaveLength(0);
      expect((await run(['--apply'])).stdout).toContain('storage is ready');
      expect((await run(['--check'])).stdout).toContain('storage is ready');
      expect((await run([])).stdout).toContain('storage is ready');
      await expect(run(['--bad'])).rejects.toMatchObject({
        stderr: expect.stringContaining(
          'Password recovery storage is unavailable',
        ),
      });
    } finally {
      await other.dropDatabase();
    }
  });
});

describe('Recovery peer-IP limiters reuse verification budgets', () => {
  it('counts invalid requests, isolates request/reset budgets and sends only safe throttle metadata', async () => {
    const app = express();
    app.post('/request', recoveryRequestRateLimit(), (_req, res) =>
      res.status(400).json({ reason: 'INVALID_REQUEST' }),
    );
    app.post('/reset', recoveryResetRateLimit(), (_req, res) =>
      res.status(400).json({ reason: 'INVALID_REQUEST' }),
    );
    for (let i = 0; i < 10; i++)
      await request(app).post('/request').expect(400);
    const blocked = await request(app).post('/request').expect(429);
    expect(blocked.headers['cache-control']).toBe('no-store');
    expect(blocked.headers['referrer-policy']).toBe('no-referrer');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body).toEqual({
      statusCode: 429,
      reason: 'PASSWORD_RECOVERY_THROTTLED',
      message: 'Please wait before trying again',
      retryAfterSeconds: expect.any(Number),
    });
    for (let i = 0; i < 30; i++) await request(app).post('/reset').expect(400);
    await request(app).post('/reset').expect(429);
  });
});
