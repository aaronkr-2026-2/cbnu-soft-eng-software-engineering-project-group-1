import { BookingCoordinationService } from '../src/components/booking/booking-coordination.service.js';
import { BOOKING_GATE, BookingGateSchema } from '../src/schemas/booking-gate.model.js';
import { BOOKING_COMMITMENT, BookingCommitmentSchema } from '../src/schemas/booking-commitment.model.js';
import { Test } from '@nestjs/testing';
import {
  ValidationPipe,
  BadRequestException,
  type INestApplication,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { createConnection, type Connection } from 'mongoose';
import crypto from 'node:crypto';
import type { MemberEntity } from '../src/libs/types/member.types.js';
import { hashPassword } from '../src/components/auth/member-password.js';
import { MemberType } from '../src/libs/enum/member.enum.js';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import {
  MEMBER_SESSION,
  MemberSessionSchema,
} from '../src/schemas/member-session.model.js';
import {
  EMAIL_LIMITS,
  EMAIL_VERIFICATIONS,
  setupEmailVerificationStorage,
  assertEmailVerificationStorage,
} from '../src/schemas/email-verification.model.js';
import { EmailVerificationService } from '../src/components/auth/email-verification.service.js';
import {
  EmailDeliveryException,
  EmailDeliveryService,
} from '../src/components/auth/email-delivery.service.js';
import { emailVerificationRateLimit } from '../src/components/auth/email-verification-rate-limit.js';
import { MemberService } from '../src/components/member/member.service.js';
import { MemberController } from '../src/components/member/member.controller.js';
import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import { migrateUsernames } from '../src/components/member/member-username-migration.js';
import {
  DAY,
  HOUR,
  LIFETIME,
  MINUTE,
  LEASE,
} from '../src/components/auth/email-verification-policy.js';
import type {
  EmailSendLimit,
  EmailVerification,
} from '../src/libs/types/email-verification.types.js';

const secret = 'email-verification-disposable-secret-at-least-32-bytes';
const email = 'alice@example.test';
const signup = {
  memberEmail: email,
  memberPassword: 'test-only-password',
  memberPhone: '+821012345678',
  memberNick: 'Alice_1',
};
const sha = (token: string) => createHash('sha256').update(token).digest('hex');
describe('Email verification with real replica-set transactions (EV-01–10)', () => {
  let connection: Connection;
  let app: INestApplication;
  let service: EmailVerificationService;
  let now: Date;
  let sent: Map<string, string>;
  const mail = { sendVerificationCode: jest.fn() };
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  const db = () => connection.db!;
  const limits = () => db().collection<EmailSendLimit>(EMAIL_LIMITS);
  const challenges = () =>
    db().collection<EmailVerification>(EMAIL_VERIFICATIONS);
  const send = (memberEmail = email, requestId = randomUUID()) =>
    service.request({ memberEmail, requestId });
  const confirm = (
    challengeId: string,
    memberEmail = email,
    code = sent.get(memberEmail)!,
  ) => service.verify({ memberEmail, challengeId, code });
  async function proof(memberEmail = email) {
    const challenge = await send(memberEmail);
    return (await confirm(challenge.challengeId, memberEmail))
      .emailVerificationToken;
  }
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post('/member/' + path)
      .send(body);
  async function expectReason(promise: Promise<unknown>, reason: string) {
    await expect(promise).rejects.toMatchObject({ response: { reason } });
  }
  beforeAll(async () => {
    if (process.env.BOOKING_TEST_DISPOSABLE !== '1')
      throw new Error('Use the disposable runner');
    process.env.JWT_ACCESS_SECRET = secret;
    connection = await createConnection(process.env.BOOKING_TEST_URI!, {
      dbName: 'email_' + randomUUID(),
      autoIndex: false,
      autoCreate: false,
    }).asPromise();
    await migrateUsernames(connection, [], true);
    await setupEmailVerificationStorage(db());
    const members = connection.model(MEMBER, MemberSchema);
    // Existing unique contact indexes remain the final concurrent constraint.
    await members.createIndexes();
    const sessions = connection.model(MEMBER_SESSION, MemberSessionSchema);
    await sessions.createCollection();
    const fixture = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret,
          signOptions: {
            algorithm: 'HS256',
            issuer: 'medconnect',
            audience: 'medconnect-api',
            expiresIn: 900,
          },
        }),
      ],
      controllers: [MemberController],
      providers: [
        MemberService,
        { provide: BookingCoordinationService, useValue: new BookingCoordinationService(
          connection,
          connection.model(BOOKING_GATE, BookingGateSchema),
          connection.model(BOOKING_COMMITMENT, BookingCommitmentSchema),
        ) },
        GoogleAuthService,
        EmailVerificationService,
        { provide: EmailDeliveryService, useValue: mail },
        { provide: getModelToken(MEMBER), useValue: members },
        { provide: getModelToken(MEMBER_SESSION), useValue: sessions },
      ],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    // Same global validation settings as production, including its generic factory.
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BadRequestException('Invalid request data'),
      }),
    );
    await app.init();
    service = app.get(EmailVerificationService);
  });
  beforeEach(async () => {
    now = new Date('2035-01-01T00:00:00Z');
    sent = new Map();
    jest.spyOn(service, 'now').mockImplementation(() => new Date(now));
    mail.sendVerificationCode
      .mockReset()
      .mockImplementation(async (email: string, code: string) => {
        sent.set(email, code);
      });
    for (const name of [
      'members',
      'member_sessions',
      EMAIL_LIMITS,
      EMAIL_VERIFICATIONS,
    ])
      await db().collection(name).deleteMany({});
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    await db().dropDatabase();
    await connection?.close();
    if (originalSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalSecret;
  });

  it('normalizes email, preserves plus/dots, returns exact no-store shapes, and creates no account/session until signup', async () => {
    const result = await post('email-verification/request', {
      memberEmail: ' Alice.Name+Tag@EXAMPLE.test ',
      requestId: randomUUID(),
    }).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toEqual({
      challengeId: expect.stringMatching(/^[\w-]{43}$/),
      expiresInSeconds: 600,
      retryAfterSeconds: 60,
    });
    expect(sent.has('alice.name+tag@example.test')).toBe(true);
    const verified = await post('email-verification/verify', {
      memberEmail: 'ALICE.NAME+TAG@example.test',
      challengeId: result.body.challengeId,
      code: sent.get('alice.name+tag@example.test'),
    }).expect(200);
    expect(verified.headers['cache-control']).toBe('no-store');
    expect(verified.body).toEqual({
      emailVerificationToken: expect.stringMatching(/^[\w-]{43}$/),
      expiresInSeconds: 600,
    });
    expect(await db().collection('members').countDocuments()).toBe(0);
    expect(await db().collection('member_sessions').countDocuments()).toBe(0);
    const row = await challenges().findOne({ _id: result.body.challengeId });
    expect(row!.proofHash).toBe(sha(verified.body.emailVerificationToken));
    expect(row).not.toHaveProperty('code');
    expect(row!.codeHash).not.toBe(
      sha(sent.get('alice.name+tag@example.test')!),
    );
  });
  it.each([
    [
      'email-verification/request',
      { memberEmail: 'bad', requestId: randomUUID() },
    ],
    ['email-verification/request', { memberEmail: email, requestId: 'bad' }],
    [
      'email-verification/request',
      { memberEmail: email, requestId: randomUUID(), memberId: 'injected' },
    ],
    [
      'email-verification/verify',
      { memberEmail: email, challengeId: 'x'.repeat(43), code: 123456 },
    ],
    [
      'email-verification/verify',
      { memberEmail: email, challengeId: 'x'.repeat(43), code: '１２３４５６' },
    ],
    [
      'email-verification/verify',
      { memberEmail: email, challengeId: 'short', code: '123456' },
    ],
  ])(
    'rejects malformed/extra input with scoped safe markers: %s %#',
    async (path, body) => {
      const result = await post(path, body).expect(400);
      expect(result.body.reason).toBe('INVALID_REQUEST');
      expect(result.headers['cache-control']).toBe('no-store');
      expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    },
  );
  it.each(['USER', 'DOCTOR', 'CLINIC'])(
    'requires proof for %s without writes',
    async (memberType) => {
      const result = await post('signup', {
        ...signup,
        memberType,
        ...(memberType === 'DOCTOR'
          ? {
              clinicId: 'a'.repeat(24),
              professionalLicenseNumber: 'license',
              doctorSpecializations: ['CARDIOLOGIST'],
            }
          : {}),
        ...(memberType === 'CLINIC'
          ? { clinicName: 'Clinic', location: 'SEOUL' }
          : {}),
      }).expect(400);
      expect(result.body.reason).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(result.headers['cache-control']).toBe('no-store');
      expect(await db().collection('members').countDocuments()).toBe(0);
    },
  );
  it('preserves leading-zero code strings through HTTP', async () => {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(7 as never);
    const challenge = await send();
    expect(sent.get(email)).toBe('000007');
    await post('email-verification/verify', {
      memberEmail: email,
      challengeId: challenge.challengeId,
      code: '000007',
    }).expect(200);
  });
  it('gives existing and new addresses identical delivery behavior', async () => {
    await db().collection('members').insertOne({
      memberNick: 'Existing_1',
      memberNickNormalized: 'existing_1',
      memberEmail: email,
    });
    expect(Object.keys(await send())).toEqual(
      Object.keys(await send('new@example.test')),
    );
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(2);
  });
  it('retries the same request without sending, extending expiry, or counting a resend', async () => {
    const requestId = randomUUID();
    const first = await send(email, requestId);
    now = new Date(+now + 59_001);
    expect(await send(email.toUpperCase(), requestId)).toEqual({
      challengeId: first.challengeId,
      expiresInSeconds: 541,
      retryAfterSeconds: 1,
    });
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect((await limits().findOne({ _id: email }))!.groupCount).toBe(0);
    now = new Date(+now + LIFETIME);
    await expectReason(send(email, requestId), 'EMAIL_VERIFICATION_INVALID');
  });
  it('enforces the exact 60-second boundary; blocked calls update activity only', async () => {
    await send();
    now = new Date(+now + MINUTE - 1);
    const blocked = await post('email-verification/request', {
      memberEmail: email,
      requestId: randomUUID(),
    }).expect(429);
    expect(blocked.body.retryAfterSeconds).toBe(1);
    expect(blocked.headers['retry-after']).toBe('1');
    expect((await limits().findOne({ _id: email }))!.lastSendAttemptAt).toEqual(
      now,
    );
    now = new Date(+now + 1);
    await send();
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(2);
  });
  it('counts initial send separately and applies every 1/3/5/24-hour block, group reset and cap exactly', async () => {
    await send();
    for (const [group, hours] of [1, 3, 5, 24, 24].entries()) {
      for (let i = 0; i < 3; i++) {
        if (group === 0 || i > 0) now = new Date(+now + MINUTE);
        const response = await send();
        expect(response.retryAfterSeconds).toBe(i === 2 ? hours * 3600 : 60);
        expect((await limits().findOne({ _id: email }))!.groupCount).toBe(
          i === 2 ? 0 : i + 1,
        );
      }
      const blocked = (await limits().findOne({ _id: email }))!.blockedUntil;
      now = new Date(+blocked - 1);
      await expectReason(send(), 'EMAIL_VERIFICATION_THROTTLED');
      expect((await limits().findOne({ _id: email }))!.blockedUntil).toEqual(
        blocked,
      );
      // The next group's first send runs at exact equality, including 24h tiers.
      now = blocked;
    }
    expect((await limits().findOne({ _id: email }))!.blockLevel).toBe(3);
  });
  it('resets at exact 24-hour inactivity but never during an active block/pending send', async () => {
    await send();
    const last = now;
    await limits().updateOne(
      { _id: email },
      { $set: { initialSent: true, groupCount: 2, blockLevel: 3 } },
    );
    now = new Date(+last + DAY);
    await send();
    expect(await limits().findOne({ _id: email })).toMatchObject({
      initialSent: true,
      groupCount: 0,
      blockLevel: 0,
    });
    await limits().updateOne(
      { _id: email },
      {
        $set: {
          lastSendAttemptAt: new Date(+now - DAY),
          blockedUntil: new Date(+now + HOUR),
          blockLevel: 3,
        },
      },
    );
    await expectReason(send(), 'EMAIL_VERIFICATION_THROTTLED');
    expect((await limits().findOne({ _id: email }))!.blockLevel).toBe(3);
  });
  it('begins a fresh initial-send cycle at the exact end of an uninterrupted 24h block', async () => {
    await send();
    await limits().updateOne(
      { _id: email },
      {
        $set: {
          initialSent: true,
          groupCount: 0,
          blockLevel: 3,
          blockedUntil: new Date(+now + DAY),
        },
      },
    );
    now = new Date(+now + DAY);
    await send();
    expect(await limits().findOne({ _id: email })).toMatchObject({
      initialSent: true,
      groupCount: 0,
      blockLevel: 0,
    });
  });
  it('keeps prior proof valid until one millisecond before expiry', async () => {
    const token = await proof();
    now = new Date(+now + LIFETIME - 1);
    await post('signup', { ...signup, emailVerificationToken: token }).expect(
      201,
    );
  });
  it('rotating the code key invalidates outstanding codes', async () => {
    const challenge = await send();
    process.env.JWT_ACCESS_SECRET =
      'rotated-disposable-secret-at-least-32-bytes';
    try {
      await expectReason(
        confirm(challenge.challengeId),
        'EMAIL_VERIFICATION_INVALID',
      );
    } finally {
      process.env.JWT_ACCESS_SECRET = secret;
    }
  });
  it('releases no challenge, reservation or email when the code key is unavailable', async () => {
    delete process.env.JWT_ACCESS_SECRET;
    try {
      await expectReason(send(), 'EMAIL_VERIFICATION_UNAVAILABLE');
    } finally {
      process.env.JWT_ACCESS_SECRET = secret;
    }
    expect(await limits().countDocuments()).toBe(0);
    expect(await challenges().countDocuments()).toBe(0);
    expect(mail.sendVerificationCode).not.toHaveBeenCalled();
  });
  it('persists limits across independent service instances, casing, expired challenges and delayed cleanup', async () => {
    await send();
    const restarted = new EmailVerificationService(
      mail as unknown as EmailDeliveryService,
      connection.model<MemberEntity>(MEMBER),
    );
    jest.spyOn(restarted, 'now').mockImplementation(() => now);
    await expectReason(
      restarted.request({
        memberEmail: email.toUpperCase(),
        requestId: randomUUID(),
      }),
      'EMAIL_VERIFICATION_THROTTLED',
    );
    await challenges().deleteMany({});
    await expectReason(send(), 'EMAIL_VERIFICATION_THROTTLED');
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
  });
  it('serializes concurrent sends and same-ID retries across instances', async () => {
    const restarted = new EmailVerificationService(
      mail as unknown as EmailDeliveryService,
      connection.model<MemberEntity>(MEMBER),
    );
    jest.spyOn(restarted, 'now').mockImplementation(() => now);
    const requestId = randomUUID();
    const results = await Promise.allSettled([
      send(email, requestId),
      restarted.request({ memberEmail: email, requestId }),
    ]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(await challenges().countDocuments()).toBe(1);
    expect((await limits().findOne({ _id: email }))!.groupCount).toBe(0);
  });
  it('reserves only one of two different concurrent send actions', async () => {
    const outcomes = await Promise.allSettled([send(), send()]);
    expect(
      outcomes.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(await challenges().countDocuments()).toBe(1);
  });
  it('creates a verified clinic with the normal approval and location rules', async () => {
    const token = await proof();
    const result = await post('signup', {
      ...signup,
      emailVerificationToken: token,
      memberType: 'CLINIC',
      clinicName: 'Test Clinic',
      location: 'SEOUL',
    }).expect(201);
    expect(result.body.member.memberType).toBe('CLINIC');
    expect(result.body.member.location).toBe('SEOUL');
    expect(
      (await db().collection('members').findOne({ memberEmail: email }))!
        .emailVerifiedAt,
    ).toEqual(now);
  });
  it('keeps proof usable when transactional doctor affiliation validation fails', async () => {
    const token = await proof();
    await post('signup', {
      ...signup,
      emailVerificationToken: token,
      memberType: 'DOCTOR',
      clinicId: 'a'.repeat(24),
      professionalLicenseNumber: 'test-license',
      doctorSpecializations: ['CARDIOLOGIST'],
    }).expect(400);
    expect(
      (await challenges().findOne({ proofHash: sha(token) }))!.consumedAt,
    ).toBeUndefined();
    await post('signup', { ...signup, emailVerificationToken: token }).expect(
      201,
    );
  });
  it('preserves historical account login and refresh without verification storage or backfill', async () => {
    await connection
      .model(MEMBER)
      .create({
        ...signup,
        memberPassword: await hashPassword(signup.memberPassword),
      });
    await challenges().dropIndex('email_request_unique');
    try {
      const login = await post('login', {
        memberEmail: email,
        memberPassword: signup.memberPassword,
      }).expect(200);
      await post('refresh', { refreshToken: login.body.refreshToken }).expect(
        200,
      );
      expect(
        (await db().collection('members').findOne({ memberEmail: email }))!
          .emailVerifiedAt,
      ).toBeUndefined();
    } finally {
      await setupEmailVerificationStorage(db());
    }
  });
  it.each(['REJECTED', 'NOT_SENT'] as const)(
    'definitive %s preserves prior code, releases allowance, keeps spacing, and repeats same-ID failure',
    async (outcome) => {
      const old = await send();
      const oldCode = sent.get(email)!;
      now = new Date(+now + MINUTE);
      mail.sendVerificationCode.mockRejectedValueOnce(
        new EmailDeliveryException(outcome),
      );
      const requestId = randomUUID();
      await expectReason(
        send(email, requestId),
        'EMAIL_VERIFICATION_UNAVAILABLE',
      );
      await expectReason(
        send(email, requestId),
        'EMAIL_VERIFICATION_UNAVAILABLE',
      );
      expect(mail.sendVerificationCode).toHaveBeenCalledTimes(2);
      expect(await limits().findOne({ _id: email })).toMatchObject({
        activeChallengeId: old.challengeId,
        groupCount: 0,
      });
      await expectReason(send(), 'EMAIL_VERIFICATION_THROTTLED');
      await confirm(old.challengeId, email, oldCode);
    },
  );
  it('ambiguous delivery consumes one allowance, supersedes old code, and permits same-ID recovery', async () => {
    const old = await send();
    now = new Date(+now + MINUTE);
    mail.sendVerificationCode.mockImplementationOnce(
      async (email: string, code: string) => {
        sent.set(email, code);
        throw new EmailDeliveryException('UNKNOWN');
      },
    );
    const requestId = randomUUID();
    await expectReason(
      send(email, requestId),
      'EMAIL_VERIFICATION_UNAVAILABLE',
    );
    const recovered = await send(email, requestId);
    expect((await limits().findOne({ _id: email }))!.groupCount).toBe(1);
    await expectReason(confirm(old.challengeId), 'EMAIL_VERIFICATION_INVALID');
    await confirm(recovered.challengeId);
    expect(mail.sendVerificationCode).toHaveBeenCalledTimes(2);
  });
  it('recovers a crashed lease exactly once and fences a late rejection from a newer send', async () => {
    let release!: () => void;
    mail.sendVerificationCode.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          release = () => reject(new EmailDeliveryException('REJECTED'));
        }),
    );
    const requestId = randomUUID();
    const pending = send(email, requestId);
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    await expectReason(
      send(email, requestId),
      'EMAIL_VERIFICATION_UNAVAILABLE',
    );
    now = new Date(+now + LEASE);
    const recovered = await send(email, requestId);
    expect(
      (await challenges().findOne({ _id: recovered.challengeId }))!.delivery,
    ).toBe('AMBIGUOUS');
    await send(email, requestId);
    expect((await limits().findOne({ _id: email }))!.initialSent).toBe(true);
    now = new Date(+now + MINUTE);
    const newer = await send();
    release();
    await expectReason(pending, 'EMAIL_VERIFICATION_UNAVAILABLE');
    expect((await limits().findOne({ _id: email }))!.activeChallengeId).toBe(
      newer.challengeId,
    );
    expect((await limits().findOne({ _id: email }))!.groupCount).toBe(1);
  });
  it('allows exactly five failed guesses and preserves exhaustion across calls', async () => {
    const challenge = await send();
    const wrong = sent.get(email) === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++)
      await expectReason(
        confirm(challenge.challengeId, email, wrong),
        i === 4
          ? 'EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED'
          : 'EMAIL_VERIFICATION_INVALID',
      );
    await expectReason(
      confirm(challenge.challengeId),
      'EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED',
    );
    expect(
      (await challenges().findOne({ _id: challenge.challengeId }))!.attempts,
    ).toBe(5);
  });
  it('permits only one concurrent correct confirmation and serializes fifth failure versus success', async () => {
    const challenge = await send();
    const responses = await Promise.allSettled([
      confirm(challenge.challengeId),
      confirm(challenge.challengeId),
    ]);
    expect(responses.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    now = new Date(+now + MINUTE);
    const next = await send();
    await challenges().updateOne(
      { _id: next.challengeId },
      { $set: { attempts: 4 } },
    );
    await Promise.allSettled([
      confirm(
        next.challengeId,
        email,
        sent.get(email) === '000000' ? '000001' : '000000',
      ),
      confirm(next.challengeId),
    ]);
    const row = (await challenges().findOne({ _id: next.challengeId }))!;
    expect(
      row.attempts === 5
        ? row.proofHash === undefined
        : row.attempts === 4 && !!row.proofHash,
    ).toBe(true);
  });
  it('serializes verification against resend promotion', async () => {
    const old = await send();
    const oldCode = sent.get(email)!;
    now = new Date(+now + MINUTE);
    const responses = await Promise.allSettled([
      confirm(old.challengeId, email, oldCode),
      send(),
    ]);
    expect(responses[1].status).toBe('fulfilled');
    await expectReason(
      confirm(old.challengeId, email, oldCode),
      'EMAIL_VERIFICATION_INVALID',
    );
    // A proof issued before supersession remains usable.
    if (responses[0].status === 'fulfilled')
      await app.get(MemberService).signup({
        ...signup,
        memberType: MemberType.USER,
        emailVerificationToken: responses[0].value.emailVerificationToken,
      });
  });
  it('rejects exact code expiry, mismatch, superseded and reused confirmation credentials', async () => {
    const old = await send();
    await expectReason(
      confirm(old.challengeId, 'other@example.test'),
      'EMAIL_VERIFICATION_INVALID',
    );
    now = new Date(+now + MINUTE);
    const newer = await send();
    await expectReason(confirm(old.challengeId), 'EMAIL_VERIFICATION_INVALID');
    now = new Date(+now + LIFETIME);
    await expectReason(
      confirm(newer.challengeId),
      'EMAIL_VERIFICATION_INVALID',
    );
  });
  it('rejects wrong, email-mismatched, expired and replayed signup proofs without extra accounts/sessions', async () => {
    const token = await proof();
    await post('signup', {
      ...signup,
      emailVerificationToken: 'x'.repeat(43),
    }).expect(400);
    await post('signup', {
      ...signup,
      memberEmail: 'other@example.test',
      emailVerificationToken: token,
    }).expect(400);
    now = new Date(+now + LIFETIME);
    await post('signup', { ...signup, emailVerificationToken: token }).expect(
      400,
    );
    expect(await db().collection('members').countDocuments()).toBe(0);
    expect(await db().collection('member_sessions').countDocuments()).toBe(0);
  });
  it('allows proof/code during long send blocks and leaves send-activity timestamps unchanged', async () => {
    await send();
    let latest!: Awaited<ReturnType<typeof send>>;
    for (let i = 0; i < 3; i++) {
      now = new Date(+now + MINUTE);
      latest = await send();
    }
    const activity = (await limits().findOne({ _id: email }))!
      .lastSendAttemptAt;
    now = new Date(+now + 1000);
    const verified = await confirm(latest.challengeId);
    const result = await post('signup', {
      ...signup,
      emailVerificationToken: verified.emailVerificationToken,
    }).expect(201);
    expect(result.body.member).not.toHaveProperty('emailVerifiedAt');
    expect(result.body.member).not.toHaveProperty('emailVerificationToken');
    expect((await limits().findOne({ _id: email }))!.lastSendAttemptAt).toEqual(
      activity,
    );
    expect(
      (await db().collection('members').findOne({ memberEmail: email }))!
        .emailVerifiedAt,
    ).toEqual(now);
    await post('signup', {
      ...signup,
      emailVerificationToken: verified.emailVerificationToken,
    }).expect(400);
    expect(await db().collection('members').countDocuments()).toBe(1);
  });
  it('keeps issued proof usable after resend and permits only one concurrent signup', async () => {
    const token = await proof();
    now = new Date(+now + MINUTE);
    await send();
    const results = await Promise.all([
      post('signup', { ...signup, emailVerificationToken: token }),
      post('signup', {
        ...signup,
        memberNick: 'Other_1',
        emailVerificationToken: token,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await db().collection('members').countDocuments()).toBe(1);
    expect(await db().collection('member_sessions').countDocuments()).toBe(1);
  });
  it.each(['memberNick', 'memberPhone', 'professionalLicenseNumber'])(
    'rolls back proof on duplicate %s then allows corrected retry',
    async (field) => {
      const clinicId = (
        await db().collection('members').insertOne({
          memberNick: 'Clinic_1',
          memberNickNormalized: 'clinic_1',
          memberType: 'CLINIC',
          memberStatus: 'ACTIVE',
        })
      ).insertedId;
      await db().collection('members').insertOne({
        memberNick: 'Taken_1',
        memberNickNormalized: 'taken_1',
        memberPhone: '+821099999999',
        professionalLicenseNumber: 'taken-license',
      });
      const token = await proof();
      const extra =
        field === 'professionalLicenseNumber'
          ? {
              memberType: 'DOCTOR',
              clinicId: String(clinicId),
              doctorSpecializations: ['CARDIOLOGIST'],
              professionalLicenseNumber: 'taken-license',
            }
          : {};
      const body = {
        ...signup,
        ...extra,
        emailVerificationToken: token,
        ...(field === 'memberNick'
          ? { memberNick: 'TAKEN_1' }
          : field === 'memberPhone'
            ? { memberPhone: '+821099999999' }
            : {}),
      };
      const conflict = await post('signup', body).expect(409);
      if (field === 'memberNick')
        expect(conflict.body.reason).toBe('USERNAME_TAKEN');
      const row = (await challenges().findOne({ proofHash: sha(token) }))!;
      expect(row.consumedAt).toBeUndefined();
      await post('signup', {
        ...body,
        [field]:
          field === 'memberPhone'
            ? signup.memberPhone
            : field === 'memberNick'
              ? signup.memberNick
              : 'new-license',
      }).expect(201);
    },
  );
  it('aborts both insertion and consumption on a database-side failure', async () => {
    const token = await proof();
    await expectReason(
      service.createVerifiedMember(email, token, async (session) => {
        await db()
          .collection('members')
          .insertOne(
            { memberNick: 'Aborted_1', memberNickNormalized: 'aborted_1' },
            { session },
          );
        throw new Error('simulated DB failure');
      }),
      'EMAIL_VERIFICATION_UNAVAILABLE',
    );
    expect(await db().collection('members').countDocuments()).toBe(0);
    expect(
      (await challenges().findOne({ proofHash: sha(token) }))!.consumedAt,
    ).toBeUndefined();
    await post('signup', { ...signup, emailVerificationToken: token }).expect(
      201,
    );
  });
  it('supports login after committed signup loses its credential response; retry cannot create again', async () => {
    const token = await proof();
    const sessionModel = connection.model(MEMBER_SESSION);
    const failure = jest
      .spyOn(sessionModel, 'create')
      .mockRejectedValueOnce(new Error('injected session-store failure'));
    await post('signup', { ...signup, emailVerificationToken: token }).expect(
      500,
    );
    failure.mockRestore();
    expect(await db().collection('members').countDocuments()).toBe(1);
    await post('signup', { ...signup, emailVerificationToken: token }).expect(
      400,
    );
    const login = await post('login', {
      memberEmail: email,
      memberPassword: signup.memberPassword,
    }).expect(200);
    await post('refresh', { refreshToken: login.body.refreshToken }).expect(
      200,
    );
  });
  it('rejects unready indexes safely and does not create them at request time', async () => {
    await challenges().dropIndex('email_request_unique');
    try {
      const result = await post('email-verification/request', {
        memberEmail: email,
        requestId: randomUUID(),
      }).expect(503);
      expect(result.body.reason).toBe('EMAIL_VERIFICATION_UNAVAILABLE');
      expect(result.headers['retry-after']).toBe('30');
      expect(mail.sendVerificationCode).not.toHaveBeenCalled();
    } finally {
      await setupEmailVerificationStorage(db());
    }
  });
  it('rejects standalone transaction storage and checks the compiled setup CLI on disposable data', async () => {
    const standalone = await createConnection(
      process.env.BOOKING_TEST_STANDALONE_URI!,
      { dbName: 'standalone_email', autoIndex: false, autoCreate: false },
    ).asPromise();
    try {
      await expect(
        setupEmailVerificationStorage(standalone.db!),
      ).rejects.toThrow('Replica set required');
    } finally {
      await standalone.db!.dropDatabase();
      await standalone.close();
    }
    await assertEmailVerificationStorage(db());
    const result = await promisify(execFile)(
      process.execPath,
      ['dist/tools/email-verification-storage.js', '--check'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MONGO_URI: process.env.BOOKING_TEST_URI!.replace(
            '/?',
            '/' + db().databaseName + '?',
          ),
        },
      },
    );
    expect(result.stdout).toContain('storage is ready');
  });
});

describe('Separate verification IP budgets', () => {
  it.each([10, 30])(
    'counts all calls including invalid DTOs in the %i/minute budget',
    async (limit) => {
      const app = (
        await Test.createTestingModule({}).compile()
      ).createNestApplication();
      app.use(emailVerificationRateLimit(limit));
      await app.init();
      try {
        for (let i = 0; i < limit; i++)
          await request(app.getHttpServer()).post('/').expect(404);
        const result = await request(app.getHttpServer()).post('/').expect(429);
        expect(result.body.reason).toBe('EMAIL_VERIFICATION_THROTTLED');
        expect(result.headers['cache-control']).toBe('no-store');
        expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    },
  );
});
