import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Types, type Connection, type Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import { ClientSession } from 'mongodb';
import request from 'supertest';
import { MemberService } from '../src/components/member/member.service.js';
import { PasswordRecoveryService } from '../src/components/auth/password-recovery.service.js';
import {
  EmailDeliveryService,
  EmailDeliveryException,
} from '../src/components/auth/email-delivery.service.js';
import {
  hashPassword,
  verifyPassword,
} from '../src/components/auth/member-password.js';
import { MEMBER } from '../src/schemas/member.model.js';
import type {
  MemberEntity,
  MemberAuthResponse,
} from '../src/libs/types/member.types.js';
import type { MemberUpdateInput } from '../src/libs/dto/member/member-update.input.js';
import { migrateUsernames } from '../src/components/member/member-username-migration.js';
import { BookingMigrationService } from '../src/components/booking/booking-migration.service.js';
import {
  setupPasswordRecoveryStorage,
  RECOVERY_LIMITS,
  RECOVERY_REQUESTS,
  RECOVERY_TOKENS,
  RECOVERY_CONFIRMATIONS,
} from '../src/schemas/password-recovery.model.js';
import {
  RECOVERY_LIFETIME,
  MINUTE,
  DAY,
  LEASE,
  newRecoveryToken,
} from '../src/components/auth/password-recovery-policy.js';
import type {
  RecoveryToken,
  RecoveryConfirmation,
} from '../src/libs/types/password-recovery.types.js';

const id = new Types.ObjectId();
const email = 'reset@example.test';
const oldPassword = 'disposable-old-password';
const newPassword = 'disposable-new-password';
const baseline = new Date('2035-01-01T00:00:00Z');
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('Atomic recovery through the real app and disposable MongoDB', () => {
  let app: INestApplication;
  let connection: Connection;
  let members: MemberService;
  let recovery: PasswordRecoveryService;
  let model: Model<MemberEntity>;
  let now: Date;
  let oldHash: string;
  let delivered: string;
  const mail = {
    assertConfigured: jest.fn(),
    sendRecoveryLink: jest.fn(),
    sendPasswordChanged: jest.fn(),
  };
  const envKeys = [
    'MONGO_URI',
    'NODE_ENV',
    'JWT_ACCESS_SECRET',
    'PASSWORD_RECOVERY_ENABLED',
    'PASSWORD_RESET_WEB_ORIGIN',
    'BOOKING_POLICY_V2_ENABLED',
    'WAITLIST_ENROLLMENT_ENABLED',
    'WAITLIST_PROMOTION_ENABLED',
    'COMMITMENT_REPLACEMENT_ENABLED',
    'WAITLIST_NOTIFICATIONS_ENABLED',
    'WAITLIST_LIFECYCLE_ENABLED',
    'APPOINTMENT_REMINDERS_ENABLED',
  ] as const;
  const original = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
  const db = () => connection.db!;
  const tokens = () => db().collection<RecoveryToken>(RECOVERY_TOKENS);
  const confirmations = () =>
    db().collection<RecoveryConfirmation>(RECOVERY_CONFIRMATIONS);
  const resetInput = (token = delivered, password = newPassword) => ({
    token,
    newPassword: password,
    confirmPassword: password,
  });
  const advance = (milliseconds: number) => {
    now = new Date(+now + milliseconds);
  };
  const login = () =>
    members.login({ memberEmail: email, memberPassword: oldPassword });
  const issue = async () => {
    await recovery.request({ memberEmail: email, requestId: randomUUID() });
    await recovery.runOnce();
    expect(delivered).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return delivered;
  };

  beforeAll(async () => {
    if (process.env.BOOKING_TEST_DISPOSABLE !== '1')
      throw new Error('Use the disposable runner');
    process.env.MONGO_URI = process.env.BOOKING_TEST_URI!.replace(
      '/?',
      `/reset_${randomUUID().replaceAll('-', '')}?`,
    );
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      'disposable-recovery-reset-secret-at-least-32-bytes';
    process.env.PASSWORD_RESET_WEB_ORIGIN = 'https://medconnect.example';
    for (const key of envKeys.filter((key) => key.endsWith('_ENABLED')))
      process.env[key] = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailDeliveryService)
      .useValue(mail)
      .compile();
    app = fixture.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BadRequestException('Invalid request data'),
      }),
    );
    connection = app.get<Connection>(getConnectionToken());
    await migrateUsernames(connection, [], true);
    await app.get(BookingMigrationService).apply();
    await setupPasswordRecoveryStorage(db());
    await app.init(); // Recovery is off here, so fixtures own deterministic worker calls.
    members = app.get(MemberService);
    recovery = app.get(PasswordRecoveryService);
    model = app.get<Model<MemberEntity>>(getModelToken(MEMBER));
    oldHash = await hashPassword(oldPassword);
  });
  beforeEach(async () => {
    now = new Date(baseline);
    delivered = '';
    process.env.PASSWORD_RECOVERY_ENABLED = 'true';
    jest.spyOn(recovery, 'now').mockImplementation(() => new Date(now));
    mail.assertConfigured.mockReset();
    mail.sendRecoveryLink
      .mockReset()
      .mockImplementation(async (_email: string, token: string) => {
        delivered = token;
      });
    mail.sendPasswordChanged.mockReset().mockResolvedValue(undefined);
    for (const name of [
      'members',
      'member_sessions',
      'booking_gates',
      'booking_commitments',
      RECOVERY_LIMITS,
      RECOVERY_REQUESTS,
      RECOVERY_TOKENS,
      RECOVERY_CONFIRMATIONS,
    ])
      await db().collection(name).deleteMany({});
    await db().collection('members').insertOne({
      _id: id,
      memberNick: 'reset_user',
      memberNickNormalized: 'reset_user',
      memberEmail: email,
      memberPassword: oldHash,
      memberPhone: '+821099990001',
      memberType: 'USER',
      memberStatus: 'ACTIVE',
      authProvider: 'EMAIL',
      authVersion: 0,
      __v: 0,
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    if (connection) await db().dropDatabase();
    if (app) await app.close();
    for (const key of envKeys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it('resets through the real controller without issuing a session and revokes every old credential', async () => {
    const first = await login();
    const second = await login();
    await issue();
    const response = await request(app.getHttpServer())
      .post('/member/password-recovery/reset')
      .send(resetInput())
      .expect(200);
    expect(response.body).toEqual({ passwordChanged: true });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(
      await db().collection('member_sessions').countDocuments({ memberId: id }),
    ).toBe(0);
    for (const old of [first, second]) {
      await expect(
        members.authenticateAccessToken(old.accessToken),
      ).rejects.toThrow('Invalid access token');
      await expect(members.refresh(old.refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    }
    await expect(login()).rejects.toThrow('Invalid email or password');
    const next = await members.login({
      memberEmail: email,
      memberPassword: newPassword,
    });
    expect(
      (await members.authenticateAccessToken(next.accessToken)).authVersion,
    ).toBe(1);
    expect((await tokens().findOne({ _id: id }))?.consumedAt).toEqual(now);
    expect(await confirmations().countDocuments({})).toBe(1);
    expect(mail.sendPasswordChanged).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/member/password-recovery/reset')
      .send(resetInput())
      .expect(400);
  });

  it('permits only one concurrent reset and creates exactly one confirmation intent', async () => {
    await issue();
    const outcomes = await Promise.allSettled([
      members.resetPassword(resetInput()),
      members.resetPassword(resetInput(delivered, 'another-new-password')),
    ]);
    expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(outcomes.find((row) => row.status === 'rejected')).toMatchObject({
      reason: { response: { reason: 'PASSWORD_RECOVERY_INVALID' } },
    });
    expect(await confirmations().countDocuments({})).toBe(1);
    expect(await db().collection('members').findOne({ _id: id })).toMatchObject(
      { authVersion: 1 },
    );
  });

  it.each([
    'missing',
    'expired',
    'consumed',
    'wrongVersion',
    'changedEmail',
    'deleted',
    'inactive',
    'google',
  ])(
    'rejects %s credentials before password hashing with the same public reason',
    async (kind) => {
      await issue();
      let token = delivered;
      if (kind === 'missing') token = newRecoveryToken();
      if (kind === 'expired') advance(RECOVERY_LIFETIME);
      if (kind === 'consumed')
        await tokens().updateOne({ _id: id }, { $set: { consumedAt: now } });
      if (kind === 'wrongVersion')
        await db()
          .collection('members')
          .updateOne({ _id: id }, { $set: { authVersion: 1 } });
      if (kind === 'changedEmail')
        await db()
          .collection('members')
          .updateOne(
            { _id: id },
            { $set: { memberEmail: 'other@example.test' } },
          );
      if (kind === 'deleted')
        await db()
          .collection('members')
          .updateOne({ _id: id }, { $set: { deletedAt: now } });
      if (kind === 'inactive')
        await db()
          .collection('members')
          .updateOne({ _id: id }, { $set: { memberStatus: 'DELETED' } });
      if (kind === 'google')
        await db()
          .collection('members')
          .updateOne({ _id: id }, { $set: { authProvider: 'GOOGLE' } });
      const scrypt = jest.spyOn(crypto, 'scrypt');
      await expect(
        members.resetPassword(resetInput(token)),
      ).rejects.toMatchObject({
        response: { reason: 'PASSWORD_RECOVERY_INVALID' },
      });
      expect(scrypt).not.toHaveBeenCalled();
      expect(await confirmations().countDocuments({})).toBe(0);
    },
  );

  it('rejects superseded links without hashing, and preserves the new current link', async () => {
    const old = await issue();
    advance(MINUTE);
    await issue();
    const scrypt = jest.spyOn(crypto, 'scrypt');
    await expect(members.resetPassword(resetInput(old))).rejects.toMatchObject({
      response: { reason: 'PASSWORD_RECOVERY_INVALID' },
    });
    expect(scrypt).not.toHaveBeenCalled();
    await members.resetPassword(resetInput());
  });

  it('rechecks expiry after password preparation without consuming the link', async () => {
    await issue();
    const replace = jest.fn();
    await expect(
      recovery.consumeReset(
        delivered,
        async () => {
          advance(RECOVERY_LIFETIME);
          return oldHash;
        },
        replace,
      ),
    ).rejects.toMatchObject({
      response: { reason: 'PASSWORD_RECOVERY_INVALID' },
    });
    expect(replace).not.toHaveBeenCalled();
    expect(await tokens().findOne({ _id: id })).not.toHaveProperty(
      'consumedAt',
    );
  });

  it('rolls back credentials, consumption, sessions and queued cancellations if confirmation persistence fails', async () => {
    await login();
    await issue();
    advance(MINUTE);
    await recovery.request({ memberEmail: email, requestId: randomUUID() });
    await db().command({
      collMod: RECOVERY_CONFIRMATIONS,
      validator: { email: { $eq: 'blocked@example.test' } },
    });
    try {
      const response = await request(app.getHttpServer())
        .post('/member/password-recovery/reset')
        .send(resetInput())
        .expect(503);
      expect(response.body.reason).toBe('PASSWORD_RECOVERY_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain(delivered);
      expect(await tokens().findOne({ _id: id })).not.toHaveProperty(
        'consumedAt',
      );
      expect(
        await db().collection('members').findOne({ _id: id }),
      ).toMatchObject({ memberPassword: oldHash, authVersion: 0 });
      expect(
        await db()
          .collection('member_sessions')
          .countDocuments({ memberId: id }),
      ).toBe(1);
      expect(
        await db()
          .collection(RECOVERY_REQUESTS)
          .countDocuments({ state: 'QUEUED' }),
      ).toBe(1);
    } finally {
      await setupPasswordRecoveryStorage(db());
    }
  });

  it('cancels a newer queued resend atomically and prevents it from producing a fresh link', async () => {
    await issue();
    advance(MINUTE);
    await recovery.request({ memberEmail: email, requestId: randomUUID() });
    await members.resetPassword(resetInput());
    await recovery.runOnce();
    expect(mail.sendRecoveryLink).toHaveBeenCalledTimes(1);
    expect(
      await db()
        .collection(RECOVERY_REQUESTS)
        .countDocuments({ state: { $in: ['QUEUED', 'LEASED'] } }),
    ).toBe(0);
    expect(
      await db()
        .collection<{ _id: string }>(RECOVERY_LIMITS)
        .findOne({ _id: email }),
    ).not.toHaveProperty('pending');
  });

  it('counts an in-flight accepted link once and fences its late recovery callback', async () => {
    const entered = deferred();
    const release = deferred();
    mail.sendRecoveryLink.mockImplementationOnce(
      async (_email: string, token: string) => {
        delivered = token;
        entered.resolve();
        await release.promise;
      },
    );
    await recovery.request({ memberEmail: email, requestId: randomUUID() });
    const sending = recovery.runOnce();
    await entered.promise;
    try {
      await members.resetPassword(resetInput());
      expect(
        await db()
          .collection<{ _id: string }>(RECOVERY_LIMITS)
          .findOne({ _id: email }),
      ).toMatchObject({ initialSent: true, groupCount: 0 });
    } finally {
      release.resolve();
      await sending;
    }
    expect(
      await db()
        .collection(RECOVERY_REQUESTS)
        .countDocuments({ state: 'LEASED' }),
    ).toBe(0);
    expect(await tokens().findOne({ _id: id })).toHaveProperty('consumedAt');
  });

  it.each(['missing', 'null'] as const)(
    'supports legacy %s authVersion without changing email verification history',
    async (legacy) => {
      if (legacy === 'missing')
        await db()
          .collection('members')
          .updateOne({ _id: id }, { $unset: { authVersion: '' } });
      else
        await db()
          .collection('members')
          .updateOne({ _id: id }, { $set: { authVersion: null } });
      await issue();
      await members.resetPassword(resetInput());
      const member = await db().collection('members').findOne({ _id: id });
      expect(member).toMatchObject({ authVersion: 1 });
      expect(member).not.toHaveProperty('emailVerifiedAt');
    },
  );

  it.each(['login', 'refresh', 'profile', 'password', 'delete'] as const)(
    'serializes reset against concurrent %s',
    async (operation) => {
      const session = await login();
      const principal = await members.authenticateAccessToken(
        session.accessToken,
      );
      await issue();
      const other =
        operation === 'login'
          ? login()
          : operation === 'refresh'
            ? members.refresh(session.refreshToken)
            : members.updateMember(
                principal,
                (operation === 'profile'
                  ? { memberFullName: 'Concurrent profile' }
                  : operation === 'password'
                    ? {
                        currentPassword: oldPassword,
                        newPassword: 'authenticated-new-password',
                        confirmPassword: 'authenticated-new-password',
                      }
                    : {
                        memberStatus: 'DELETED',
                        deletionAgreement: true,
                      }) as MemberUpdateInput,
              );
      const [reset, changed] = await Promise.allSettled([
        members.resetPassword(resetInput()),
        other,
      ]);
      const member = (await db().collection('members').findOne({ _id: id }))!;
      if (operation === 'password' || operation === 'delete') {
        expect(
          [reset, changed].filter((row) => row.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(member.authVersion).toBe(1);
      } else {
        expect(reset.status).toBe('fulfilled');
        expect(member.authVersion).toBe(1);
        if (operation === 'profile' && changed.status === 'fulfilled')
          expect(member.memberFullName).toBe('Concurrent profile');
      }
      await expect(
        members.authenticateAccessToken(session.accessToken),
      ).rejects.toThrow();
      await expect(members.refresh(session.refreshToken)).rejects.toThrow();
      if (
        (operation === 'login' || operation === 'refresh') &&
        changed.status === 'fulfilled'
      ) {
        const raced = changed.value as MemberAuthResponse;
        await expect(
          members.authenticateAccessToken(raced.accessToken),
        ).rejects.toThrow();
        await expect(members.refresh(raced.refreshToken)).rejects.toThrow();
      }
      if (operation === 'delete' && changed.status === 'fulfilled') {
        expect(member.memberStatus).toBe('DELETED');
        expect(await confirmations().countDocuments({})).toBe(0);
      }
      expect(await verifyPassword(oldPassword, member.memberPassword)).toBe(
        operation === 'delete' && changed.status === 'fulfilled',
      );
    },
  );

  it('keeps reset committed when confirmation SMTP fails and bounds confirmation retry', async () => {
    await issue();
    await members.resetPassword(resetInput());
    mail.sendPasswordChanged.mockRejectedValue(
      new EmailDeliveryException('NOT_SENT'),
    );
    for (let attempt = 1; attempt <= 3; attempt++) {
      await recovery.runOnce();
      advance(MINUTE * attempt);
    }
    await recovery.runOnce();
    expect(mail.sendPasswordChanged).toHaveBeenCalledTimes(3);
    expect(await confirmations().findOne({})).toMatchObject({
      state: 'FAILED',
      attempts: 3,
    });
    expect(
      await verifyPassword(
        newPassword,
        (await db().collection('members').findOne({ _id: id }))!.memberPassword,
      ),
    ).toBe(true);
  });

  it('deduplicates confirmation delivery across workers without credentials in its stored payload', async () => {
    await issue();
    await members.resetPassword(resetInput());
    const other = new PasswordRecoveryService(
      mail as unknown as EmailDeliveryService,
      model,
    );
    jest.spyOn(other, 'now').mockImplementation(() => new Date(now));
    try {
      await Promise.all([recovery.runOnce(), other.runOnce()]);
    } finally {
      await other.onApplicationShutdown();
    }
    expect(mail.sendPasswordChanged).toHaveBeenCalledTimes(1);
    expect(await confirmations().findOne({})).toMatchObject({
      state: 'SENT',
      attempts: 1,
    });
    const payload = JSON.stringify(await confirmations().findOne({}));
    expect(payload).not.toContain(delivered);
    expect(payload).not.toContain(newPassword);
  });

  it('does not automatically repeat uncertain confirmation delivery', async () => {
    await issue();
    await members.resetPassword(resetInput());
    mail.sendPasswordChanged.mockRejectedValue(
      new EmailDeliveryException('UNKNOWN'),
    );
    await recovery.runOnce();
    advance(MINUTE);
    await recovery.runOnce();
    expect(mail.sendPasswordChanged).toHaveBeenCalledTimes(1);
    expect(await confirmations().findOne({})).toMatchObject({
      state: 'FAILED',
      attempts: 1,
    });
  });

  it('recovers an abandoned confirmation lease without letting its late callback mark success', async () => {
    await issue();
    await members.resetPassword(resetInput());
    const entered = deferred();
    const release = deferred();
    mail.sendPasswordChanged.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const sending = recovery.runOnce();
    await entered.promise;
    advance(LEASE);
    const other = new PasswordRecoveryService(
      mail as unknown as EmailDeliveryService,
      model,
    );
    jest.spyOn(other, 'now').mockImplementation(() => new Date(now));
    try {
      await other.runOnce();
    } finally {
      release.resolve();
      await sending;
      await other.onApplicationShutdown();
    }
    expect(await confirmations().findOne({})).toMatchObject({
      state: 'FAILED',
      attempts: 1,
    });
  });

  it('returns an ambiguous failure after a lost committed response; retry cannot change credentials again', async () => {
    await issue();
    const commit = ClientSession.prototype.commitTransaction;
    jest
      .spyOn(ClientSession.prototype, 'commitTransaction')
      .mockImplementationOnce(async function (this: ClientSession) {
        await commit.call(this);
        throw new Error('synthetic unknown commit result');
      });
    const first = await request(app.getHttpServer())
      .post('/member/password-recovery/reset')
      .send(resetInput())
      .expect(503);
    expect(first.body.reason).toBe('PASSWORD_RECOVERY_UNAVAILABLE');
    await request(app.getHttpServer())
      .post('/member/password-recovery/reset')
      .send(resetInput())
      .expect(400);
    expect(await confirmations().countDocuments({})).toBe(1);
    expect(await db().collection('members').findOne({ _id: id })).toMatchObject(
      { authVersion: 1 },
    );
  });

  it('expires confirmation work at its explicit deadline before TTL cleanup', async () => {
    await issue();
    await members.resetPassword(resetInput());
    advance(DAY);
    await recovery.runOnce();
    expect(await confirmations().findOne({})).toMatchObject({
      state: 'FAILED',
      attempts: 0,
    });
    expect(mail.sendPasswordChanged).not.toHaveBeenCalled();
  });

  it('rejects mismatched/oversized/injected HTTP input and disabled recovery without hashing', async () => {
    const scrypt = jest.spyOn(crypto, 'scrypt');
    for (const body of [
      { ...resetInput(newRecoveryToken()), confirmPassword: 'mismatch' },
      resetInput(newRecoveryToken(), 'a'.repeat(101)),
      { ...resetInput(newRecoveryToken()), memberId: String(id) },
    ])
      await request(app.getHttpServer())
        .post('/member/password-recovery/reset')
        .send(body)
        .expect(400);
    process.env.PASSWORD_RECOVERY_ENABLED = 'false';
    await request(app.getHttpServer())
      .post('/member/password-recovery/reset')
      .send(resetInput(newRecoveryToken()))
      .expect(503);
    expect(scrypt).not.toHaveBeenCalled();
  });

  it('applies the real module reset IP limiter before hashing', async () => {
    const scrypt = jest.spyOn(crypto, 'scrypt');
    let blocked = false;
    for (let attempt = 0; attempt < 31; attempt++) {
      const response = await request(app.getHttpServer())
        .post('/member/password-recovery/reset')
        .send(resetInput(newRecoveryToken()));
      if (response.status === 429) {
        expect(response.body.reason).toBe('PASSWORD_RECOVERY_THROTTLED');
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
        expect(response.headers['cache-control']).toBe('no-store');
        blocked = true;
        break;
      }
      expect(response.status).toBe(400);
    }
    expect(blocked).toBe(true);
    expect(scrypt).not.toHaveBeenCalled();
  });
});
