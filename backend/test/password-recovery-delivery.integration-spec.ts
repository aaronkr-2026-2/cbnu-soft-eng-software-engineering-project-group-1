import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { createConnection, type Connection, type Model } from 'mongoose';
import request from 'supertest';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import type { MemberEntity } from '../src/libs/types/member.types.js';
import {
  AuthProvider,
  MemberStatus,
  MemberType,
} from '../src/libs/enum/member.enum.js';
import {
  setupPasswordRecoveryStorage,
  RECOVERY_LIMITS,
  RECOVERY_REQUESTS,
  RECOVERY_TOKENS,
} from '../src/schemas/password-recovery.model.js';
import type {
  RecoveryRequest,
  RecoverySendLimit,
  RecoveryToken,
} from '../src/libs/types/password-recovery.types.js';
import { PasswordRecoveryService } from '../src/components/auth/password-recovery.service.js';
import {
  EmailDeliveryService,
  EmailDeliveryException,
} from '../src/components/auth/email-delivery.service.js';
import { MemberController } from '../src/components/member/member.controller.js';
import { MemberService } from '../src/components/member/member.service.js';
import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import {
  MINUTE,
  HOUR,
  DAY,
  LEASE,
  RECOVERY_LIFETIME,
  recoveryTokenHash,
  recoveryRequestRateLimit,
} from '../src/components/auth/password-recovery-policy.js';

const baseline = new Date('2035-01-01T00:00:00Z');
const email = 'patient@example.test';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('Recovery request and delivery lifecycle on disposable MongoDB', () => {
  let connection: Connection;
  let members: Model<MemberEntity>;
  let service: PasswordRecoveryService;
  let now: Date;
  const mail = { assertConfigured: jest.fn(), sendRecoveryLink: jest.fn() };
  const envKeys = [
    'PASSWORD_RECOVERY_ENABLED',
    'PASSWORD_RESET_WEB_ORIGIN',
  ] as const;
  const original = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
  const sent: { email: string; token: string }[] = [];
  const db = () => connection.db!;
  const jobs = () => db().collection<RecoveryRequest>(RECOVERY_REQUESTS);
  const limits = () => db().collection<RecoverySendLimit>(RECOVERY_LIMITS);
  const tokens = () => db().collection<RecoveryToken>(RECOVERY_TOKENS);
  const input = (memberEmail = email, requestId = randomUUID()) => ({
    memberEmail,
    requestId,
  });
  const advance = (milliseconds: number) => {
    now = new Date(+now + milliseconds);
  };
  const makeService = () => {
    const instance = new PasswordRecoveryService(
      mail as unknown as EmailDeliveryService,
      connection.model<MemberEntity>(MEMBER),
    );
    jest.spyOn(instance, 'now').mockImplementation(() => new Date(now));
    return instance;
  };
  const seed = async (memberEmail = email, fields: object = {}) =>
    db()
      .collection('members')
      .insertOne({
        memberEmail,
        authProvider: AuthProvider.EMAIL,
        memberStatus: MemberStatus.ACTIVE,
        memberType: MemberType.USER,
        memberPassword: 'synthetic-hash-unchanged',
        authVersion: 0,
        ...fields,
      });

  beforeAll(async () => {
    if (process.env.BOOKING_TEST_DISPOSABLE !== '1')
      throw new Error('Use the disposable runner');
    connection = await createConnection(process.env.BOOKING_TEST_URI!, {
      dbName: 'recovery_delivery_' + randomUUID(),
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    members = connection.model<MemberEntity>(MEMBER, MemberSchema);
    await members.createCollection();
    await setupPasswordRecoveryStorage(db());
  });
  beforeEach(async () => {
    now = new Date(baseline);
    process.env.PASSWORD_RECOVERY_ENABLED = 'true';
    process.env.PASSWORD_RESET_WEB_ORIGIN = 'https://medconnect.example';
    sent.length = 0;
    mail.assertConfigured.mockReset();
    mail.sendRecoveryLink
      .mockReset()
      .mockImplementation(async (recipient: string, token: string) => {
        sent.push({ email: recipient, token });
      });
    for (const name of [
      'members',
      RECOVERY_LIMITS,
      RECOVERY_REQUESTS,
      RECOVERY_TOKENS,
    ])
      await db().collection(name).deleteMany({});
    service = makeService();
  });
  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    for (const key of envKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    if (connection) {
      await db().dropDatabase();
      await connection.close();
    }
  });

  it('returns the same HTTP acceptance before eligibility lookup or SMTP for all account types', async () => {
    await seed();
    await seed('google@example.test', { authProvider: AuthProvider.GOOGLE });
    await seed('deleted@example.test', {
      deletedAt: baseline,
      memberStatus: MemberStatus.DELETED,
    });
    const lookup = jest.spyOn(members, 'findOne');
    const fixture = await Test.createTestingModule({
      controllers: [MemberController],
      providers: [
        { provide: MemberService, useValue: {} },
        { provide: GoogleAuthService, useValue: {} },
        {
          provide: PasswordRecoveryService,
          useValue: {
            request: (body: ReturnType<typeof input>) => service.request(body),
          },
        },
      ],
    }).compile();
    const app: INestApplication = fixture.createNestApplication();
    app.use('/member/password-recovery/request', recoveryRequestRateLimit());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    try {
      const durations: number[] = [];
      for (const recipient of [
        email,
        'google@example.test',
        'deleted@example.test',
        'unknown@example.test',
      ]) {
        const start = performance.now();
        const response = await request(app.getHttpServer())
          .post('/member/password-recovery/request')
          .send(input(recipient))
          .expect(202);
        durations.push(performance.now() - start);
        expect(response.body).toEqual({ accepted: true });
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      // A broad regression bound, not a claim of constant-time responses.
      expect(Math.max(...durations) - Math.min(...durations)).toBeLessThan(
        2_000,
      );
      expect(lookup).not.toHaveBeenCalled();
      expect(mail.sendRecoveryLink).not.toHaveBeenCalled();
      await request(app.getHttpServer())
        .post('/member/password-recovery/request')
        .send({ ...input(), redirect: 'https://evil.example' })
        .expect(400);
      for (let i = 0; i < 5; i++)
        await request(app.getHttpServer())
          .post('/member/password-recovery/request')
          .send({})
          .expect(400);
      await request(app.getHttpServer())
        .post('/member/password-recovery/request')
        .send(input())
        .expect(429);
    } finally {
      await app.close();
    }
    for (let i = 0; i < 4; i++) await service.runOnce();
    expect(sent.map((row) => row.email)).toEqual([email]);
  });

  it.each([MemberType.USER, MemberType.DOCTOR, MemberType.CLINIC])(
    'sends to an active EMAIL %s without requiring historical email verification',
    async (memberType) => {
      const member = await seed(email, { memberType });
      await service.request(input());
      await service.runOnce();
      expect(sent).toHaveLength(1);
      const token = await tokens().findOne({ _id: member.insertedId });
      expect(token?.tokenHash).toBe(recoveryTokenHash(sent[0].token));
      expect(token?.expiresAt).toEqual(new Date(+baseline + RECOVERY_LIFETIME));
      expect(JSON.stringify(await jobs().find().toArray())).not.toContain(
        sent[0].token,
      );
      expect(token).not.toHaveProperty('token');
      expect(
        await db().collection('members').findOne({ _id: member.insertedId }),
      ).toMatchObject({
        memberPassword: 'synthetic-hash-unchanged',
        authVersion: 0,
      });
    },
  );

  it('deduplicates simultaneous requests and enforces separate durable spacing across instances', async () => {
    await seed();
    const other = makeService();
    const body = input();
    const replies = await Promise.all([
      service.request(body),
      other.request(body),
      service.request({
        ...body,
        memberEmail: email.toUpperCase(),
        requestId: body.requestId.toUpperCase(),
      }),
    ]);
    expect(replies).toEqual([
      { accepted: true },
      { accepted: true },
      { accepted: true },
    ]);
    expect(await jobs().countDocuments({})).toBe(1);
    await Promise.all([service.runOnce(), other.runOnce()]);
    expect(sent).toHaveLength(1);
    const expiry = (await tokens().findOne({}))!.expiresAt;
    advance(MINUTE - 1);
    await other.request(input());
    await other.runOnce();
    expect(sent).toHaveLength(1);
    advance(1);
    await other.request(input());
    await other.runOnce();
    expect(sent).toHaveLength(2);
    expect((await tokens().findOne({}))!.expiresAt).not.toEqual(expiry);
    await other.onApplicationShutdown();
  });

  it('escalates after groups of three resends and keeps blocked activity separate from deadline extension', async () => {
    await seed();
    await service.request(input());
    await service.runOnce();
    for (const duration of [HOUR, 3 * HOUR, 5 * HOUR, DAY]) {
      for (let i = 0; i < 3; i++) {
        advance(MINUTE);
        await service.request(input());
        await service.runOnce();
      }
      const limit = (await limits().findOne({ _id: email }))!;
      expect(+limit.blockedUntil).toBe(+now + duration);
      advance(1);
      await service.request(input());
      expect((await limits().findOne({ _id: email }))!.blockedUntil).toEqual(
        limit.blockedUntil,
      );
      now = new Date(limit.blockedUntil);
    }
    const before = sent.length;
    await service.request(input());
    await service.runOnce();
    expect(sent).toHaveLength(before + 1);
  });

  it('bounds definitive delivery retries without spending resend allowance or extending expiry', async () => {
    await seed();
    mail.sendRecoveryLink.mockRejectedValue(
      new EmailDeliveryException('NOT_SENT'),
    );
    await service.request(input());
    for (let i = 0; i < 3; i++) {
      await service.runOnce();
      advance(MINUTE);
    }
    await service.runOnce();
    expect(mail.sendRecoveryLink).toHaveBeenCalledTimes(3);
    expect(await jobs().findOne({})).toMatchObject({
      state: 'REJECTED',
      attempts: 3,
      expiresAt: new Date(+baseline + RECOVERY_LIFETIME),
    });
    expect(await limits().findOne({ _id: email })).toMatchObject({
      initialSent: false,
    });
    expect(await tokens().countDocuments({})).toBe(0);
  });

  it('keeps uncertain SMTP delivery usable without automatic duplicate email', async () => {
    await seed();
    mail.sendRecoveryLink.mockRejectedValue(
      new EmailDeliveryException('UNKNOWN'),
    );
    await service.request(input());
    await service.runOnce();
    advance(MINUTE);
    await service.runOnce();
    expect(mail.sendRecoveryLink).toHaveBeenCalledTimes(1);
    expect(await jobs().findOne({})).toMatchObject({
      state: 'AMBIGUOUS',
      attempts: 1,
    });
    expect(await tokens().countDocuments({})).toBe(1);
    expect(await limits().findOne({ _id: email })).toMatchObject({
      initialSent: true,
    });
  });

  it('recovers an abandoned lease once and fences a late successful SMTP completion', async () => {
    await seed();
    const entered = deferred();
    const release = deferred();
    mail.sendRecoveryLink.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    await service.request(input());
    const first = service.runOnce();
    await entered.promise;
    advance(LEASE);
    const restarted = makeService();
    await restarted.runOnce();
    expect(await jobs().findOne({})).toMatchObject({ state: 'AMBIGUOUS' });
    release.resolve();
    await first;
    expect(await jobs().findOne({})).toMatchObject({
      state: 'AMBIGUOUS',
      attempts: 1,
    });
    expect((await limits().findOne({ _id: email }))!.groupCount).toBe(0);
    expect(service.getMetrics().accepted).toBe(0);
    expect(restarted.getMetrics().ambiguous).toBe(1);
    await restarted.onApplicationShutdown();
  });

  it('never reactivates an older digest after a new request supersedes an expired lease', async () => {
    await seed();
    const entered = deferred();
    const release = deferred();
    mail.sendRecoveryLink.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    await service.request(input());
    const first = service.runOnce();
    await entered.promise;
    const oldDigest = (await tokens().findOne({}))!.tokenHash;
    advance(MINUTE);
    await service.request(input());
    const other = makeService();
    await other.runOnce();
    const newDigest = (await tokens().findOne({}))!.tokenHash;
    expect(newDigest).not.toBe(oldDigest);
    release.resolve();
    await first;
    expect((await tokens().findOne({}))!.tokenHash).toBe(newDigest);
    expect(await jobs().countDocuments({ state: 'ACCEPTED' })).toBe(1);
    await other.onApplicationShutdown();
  });

  it('expires a queued request at exact equality without SMTP or extending idempotent retries', async () => {
    await seed();
    const body = input();
    await service.request(body);
    advance(RECOVERY_LIFETIME);
    await service.runOnce();
    await service.request(body);
    expect(mail.sendRecoveryLink).not.toHaveBeenCalled();
    expect(await jobs().findOne({})).toMatchObject({
      state: 'EXPIRED',
      attempts: 0,
    });
    expect(await jobs().countDocuments({})).toBe(1);
  });

  it('rechecks account eligibility after queueing and never sends to a deleted account', async () => {
    const member = await seed();
    await service.request(input());
    await db()
      .collection('members')
      .updateOne(
        { _id: member.insertedId },
        { $set: { deletedAt: now, memberStatus: MemberStatus.DELETED } },
      );
    await service.runOnce();
    expect(sent).toHaveLength(0);
    expect(await jobs().findOne({})).toMatchObject({ state: 'SUPPRESSED' });
  });

  it('applies a global capacity failure to all addresses and reclaims only inactive policy rows', async () => {
    jest
      .spyOn(service, 'admissionCapacity')
      .mockReturnValue({ limits: 2, requests: 2 });
    await service.request(input('one@example.test'));
    await service.runOnce();
    await service.request(input('two@example.test'));
    await service.runOnce();
    for (const recipient of ['one@example.test', 'three@example.test'])
      await expect(service.request(input(recipient))).rejects.toMatchObject({
        response: { reason: 'PASSWORD_RECOVERY_UNAVAILABLE' },
      });
    advance(DAY - 1);
    await service.runOnce();
    expect(await limits().countDocuments({})).toBe(2);
    advance(1);
    await service.runOnce();
    expect(await limits().countDocuments({})).toBe(1);
    expect(await jobs().countDocuments({})).toBe(2);
  });

  it('pauses on a disabled flag and fails closed for missing configuration without mail or queued work', async () => {
    process.env.PASSWORD_RECOVERY_ENABLED = 'false';
    await service.onModuleInit();
    await expect(service.request(input())).rejects.toMatchObject({
      response: { reason: 'PASSWORD_RECOVERY_UNAVAILABLE' },
    });
    process.env.PASSWORD_RECOVERY_ENABLED = 'true';
    delete process.env.PASSWORD_RESET_WEB_ORIGIN;
    await expect(service.request(input())).rejects.toMatchObject({
      response: { reason: 'PASSWORD_RECOVERY_UNAVAILABLE' },
    });
    expect(await jobs().countDocuments({})).toBe(0);
    expect(mail.sendRecoveryLink).not.toHaveBeenCalled();
  });

  it('serializes concurrent distinct-address admission at the global capacity boundary', async () => {
    const other = makeService();
    jest
      .spyOn(service, 'admissionCapacity')
      .mockReturnValue({ limits: 2, requests: 2 });
    jest
      .spyOn(other, 'admissionCapacity')
      .mockReturnValue({ limits: 2, requests: 2 });
    const replies = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        (index % 2 ? service : other).request(
          input(`guest${index}@example.test`),
        ),
      ),
    );
    expect(
      replies.filter((reply) => reply.status === 'fulfilled'),
    ).toHaveLength(2);
    expect(await jobs().countDocuments({})).toBe(2);
    expect(await limits().countDocuments({})).toBe(2);
    await other.onApplicationShutdown();
  });

  it('preserves no-database startup when disabled and rejects missing database/SMTP prerequisites when enabled', async () => {
    const noDatabase = new PasswordRecoveryService(
      mail as unknown as EmailDeliveryService,
    );
    process.env.PASSWORD_RECOVERY_ENABLED = 'false';
    await noDatabase.onModuleInit();
    process.env.PASSWORD_RECOVERY_ENABLED = 'true';
    await expect(noDatabase.request(input())).rejects.toMatchObject({
      response: { reason: 'PASSWORD_RECOVERY_UNAVAILABLE' },
    });
    mail.assertConfigured.mockImplementation(() => {
      throw new EmailDeliveryException('NOT_SENT');
    });
    await expect(service.request(input())).rejects.toMatchObject({
      response: { reason: 'PASSWORD_RECOVERY_UNAVAILABLE' },
    });
    expect(await jobs().countDocuments({})).toBe(0);
    await noDatabase.onApplicationShutdown();
  });

  it('runs its actual timer loop and waits for an owned send during shutdown', async () => {
    await seed();
    await service.request(input());
    const entered = deferred();
    const release = deferred();
    mail.sendRecoveryLink.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    await service.onModuleInit();
    await entered.promise;
    let stopped = false;
    const stopping = service.onApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release.resolve();
    await stopping;
    expect(await jobs().findOne({})).toMatchObject({ state: 'ACCEPTED' });
    await service.runOnce();
    expect(mail.sendRecoveryLink).toHaveBeenCalledTimes(1);
    expect(
      Object.values(service.getMetrics()).every(
        (value) => typeof value === 'number',
      ),
    ).toBe(true);
  });
});
