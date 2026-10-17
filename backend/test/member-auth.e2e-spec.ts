import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import type { Server } from 'node:http';
import { model } from 'mongoose';
import request from 'supertest';
import { MemberController } from '../src/components/member/member.controller.js';
import { memberRateLimit } from '../src/components/auth/member-rate-limit.js';
import { MemberService } from '../src/components/member/member.service.js';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import { MEMBER_SESSION } from '../src/schemas/member-session.model.js';
import type { MemberDocument } from '../src/libs/types/member.types.js';
import { AuthProvider, MemberStatus } from '../src/libs/enum/member.enum.js';

const Member = model('AuthTestMember', MemberSchema);
const secret = 'test-only-secret-that-is-at-least-32-bytes';

describe('Member REST authentication', () => {
  let app: INestApplication<Server>;
  const members: MemberDocument[] = [];
  const sessions = new Map<
    string,
    {
      _id: string;
      memberId: unknown;
      refreshTokenHash: string;
      expiresAt: Date;
    }
  >();
  const query = (value: unknown) => ({
    select: () => query(value),
    exec: async () => value,
  });
  const signup = {
    memberEmail: 'alice@example.com',
    memberPassword: 'a sufficiently long password',
    memberPhone: '+821012345678',
    memberNick: 'alice',
  };
  const googleClientId = 'test-google-client.apps.googleusercontent.com';
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const googleToken = (
    nonce: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: 'https://accounts.google.com',
      aud: googleClientId,
      sub: 'google-subject-1',
      iat: now,
      exp: now + 3600,
      nonce,
      email: 'google@example.com',
      email_verified: true,
      name: 'Google Person',
      ...overrides,
    };
    const encoded = [{ alg: 'RS256', kid: 'test-key' }, payload]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
      .join('.');
    return `${encoded}.${sign('RSA-SHA256', Buffer.from(encoded), keys.privateKey).toString('base64url')}`;
  };
  const beginGoogle = async () => {
    const response = await request(app.getHttpServer())
      .post('/member/google/nonce')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toContain('HttpOnly');
    return {
      nonce: response.body.nonce as string,
      cookie: cookies[0].split(';')[0],
    };
  };
  const googleLogin = async (overrides: Record<string, unknown> = {}) => {
    const { nonce, cookie } = await beginGoogle();
    return request(app.getHttpServer())
      .post('/member/google/login')
      .set('Cookie', cookie)
      .send({ idToken: googleToken(nonce, overrides) });
  };

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = googleClientId;
    // Keep real Google JWT verification; substitute only the network key lookup.
    jest
      .spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync')
      .mockResolvedValue({
        certs: {
          'test-key': keys.publicKey
            .export({ type: 'spki', format: 'pem' })
            .toString(),
        },
        format: 'PEM' as Awaited<
          ReturnType<OAuth2Client['getFederatedSignonCertsAsync']>
        >['format'],
      });
    const fixture = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: 900,
            issuer: 'medconnect',
            audience: 'medconnect-api',
          },
        }),
      ],
      controllers: [MemberController],
      providers: [
        MemberService,
        GoogleAuthService,
        {
          provide: getModelToken(MEMBER),
          useValue: {
            init: async () => {},
            create: async (data: object) => {
              const member = new Member(data);
              await member.validate();
              if (
                members.some((item) =>
                  (
                    [
                      'memberEmail',
                      'memberPhone',
                      'memberNick',
                      'googleId',
                    ] as const
                  ).some(
                    (key) => member[key] != null && item[key] === member[key],
                  ),
                )
              )
                throw { code: 11000 };
              members.push(member);
              return member;
            },
            findOne: (filter: Record<string, unknown>) =>
              query(
                members.find((item) =>
                  Object.entries(filter).every(
                    ([key, value]) => item.get(key) === value,
                  ),
                ) ?? null,
              ),
            findById: (id: unknown) =>
              query(
                members.find((item) => String(item._id) === String(id)) ?? null,
              ),
            exists: async (filter: Record<string, unknown>) =>
              members.find((item) =>
                Object.entries(filter).every(([key, value]) =>
                  key === '_id'
                    ? String(item._id) === String(value)
                    : value === null
                      ? item.get(key) == null
                      : item.get(key) === value,
                ),
              ) ?? null,
          },
        },
        {
          provide: getModelToken(MEMBER_SESSION),
          useValue: {
            create: async (data: {
              memberId: unknown;
              refreshTokenHash: string;
              expiresAt: Date;
            }) => {
              sessions.set(data.refreshTokenHash, {
                ...data,
                _id: data.refreshTokenHash,
              });
            },
            findOneAndUpdate: (
              filter: { refreshTokenHash: string; expiresAt: { $gt: Date } },
              update: { $set: { refreshTokenHash: string } },
            ) => ({
              exec: async () => {
                const session = sessions.get(filter.refreshTokenHash);
                if (!session || session.expiresAt <= filter.expiresAt.$gt)
                  return null;
                sessions.delete(filter.refreshTokenHash);
                session.refreshTokenHash = update.$set.refreshTokenHash;
                sessions.set(session.refreshTokenHash, session);
                return session;
              },
            }),
            deleteOne: async ({ _id }: { _id: string }) => {
              for (const [key, session] of sessions)
                if (session._id === _id) sessions.delete(key);
            },
          },
        },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () => new BadRequestException('Invalid request data'),
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = googleClientId;
    members.length = 0;
    sessions.clear();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
  });

  it('limits repeated authentication requests', async () => {
    const limiterApp = (
      await Test.createTestingModule({}).compile()
    ).createNestApplication();
    limiterApp.use(memberRateLimit());
    await limiterApp.init();
    try {
      for (let i = 0; i < 20; i++)
        await request(limiterApp.getHttpServer()).post('/').expect(404);
      await request(limiterApp.getHttpServer()).post('/').expect(429);
    } finally {
      await limiterApp.close();
    }
  });

  it('signs up, hashes passwords, allowlists response fields, and signs expiring access tokens', async () => {
    const result = await request(app.getHttpServer())
      .post('/member/signup')
      .send({ ...signup, memberEmail: ' ALICE@EXAMPLE.COM ' })
      .expect(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.member.memberEmail).toBe(signup.memberEmail);
    expect(result.body.member.memberType).toBe('USER');
    expect(result.body.member).not.toHaveProperty('memberPassword');
    expect(result.body.member).not.toHaveProperty('memberPhone');
    expect(members[0].memberPassword).toMatch(/^scrypt\$/);
    expect(members[0].memberPassword).not.toBe(signup.memberPassword);
    const claims = await app
      .get(JwtService)
      .verifyAsync(result.body.accessToken, {
        algorithms: ['HS256'],
        issuer: 'medconnect',
        audience: 'medconnect-api',
      });
    expect(claims.sub).toBe(String(members[0]._id));
    expect(claims.tokenType).toBe('access');
    expect(claims.exp - claims.iat).toBe(900);
    expect([...sessions.values()][0].refreshTokenHash).not.toBe(
      result.body.refreshToken,
    );
  });

  it('logs in using normalized email and rejects wrong, missing, and suspended accounts identically', async () => {
    await request(app.getHttpServer())
      .post('/member/signup')
      .send(signup)
      .expect(201);
    await request(app.getHttpServer())
      .post('/member/login')
      .send({
        memberEmail: 'ALICE@EXAMPLE.COM',
        memberPassword: signup.memberPassword,
      })
      .expect(200);
    const bad = await request(app.getHttpServer())
      .post('/member/login')
      .send({ memberEmail: signup.memberEmail, memberPassword: 'wrong' })
      .expect(401);
    const absent = await request(app.getHttpServer())
      .post('/member/login')
      .send({ memberEmail: 'absent@example.com', memberPassword: 'wrong' })
      .expect(401);
    members[0].memberStatus = MemberStatus.SUSPENDED;
    const blocked = await request(app.getHttpServer())
      .post('/member/login')
      .send({
        memberEmail: signup.memberEmail,
        memberPassword: signup.memberPassword,
      })
      .expect(401);
    expect(bad.body).toEqual(absent.body);
    expect(blocked.body).toEqual(bad.body);
  });

  it('rejects duplicate accounts with 409', async () => {
    await request(app.getHttpServer())
      .post('/member/signup')
      .send(signup)
      .expect(201);
    await request(app.getHttpServer())
      .post('/member/signup')
      .send(signup)
      .expect(409);
    expect(members).toHaveLength(1);
  });

  it.each([
    { memberType: 'ADMIN' },
    { memberStatus: 'ACTIVE' },
    { doctorClinicStatus: 'APPROVED' },
    { memberPassword: 'short' },
    { memberPassword: 'a'.repeat(7) },
    { memberPassword: 'a'.repeat(101) },
    { memberEmail: { $ne: null } },
    { memberPhone: '123' },
    { memberType: 'CLINIC' },
    { memberType: 'DOCTOR' },
    { clinicName: 'Wrong role' },
    { memberType: 'CLINIC', clinicName: 'Clinic', clinicTimezone: 'Not/AZone' },
  ])('rejects invalid or privileged signup input: %j', async (overrides) => {
    await request(app.getHttpServer())
      .post('/member/signup')
      .send({ ...signup, ...overrides })
      .expect(400);
    expect(members).toHaveLength(0);
  });

  it.each([8, 100])(
    'accepts signup passwords of %i characters',
    async (length) => {
      await request(app.getHttpServer())
        .post('/member/signup')
        .send({ ...signup, memberPassword: 'a'.repeat(length) })
        .expect(201);
    },
  );

  it('registers clinics and doctors with a pending affiliation to an active clinic', async () => {
    const clinic = await request(app.getHttpServer())
      .post('/member/signup')
      .send({
        ...signup,
        memberType: 'CLINIC',
        clinicName: 'Example Clinic',
        clinicTimezone: 'Asia/Seoul',
      })
      .expect(201);
    const doctor = {
      ...signup,
      memberEmail: 'doctor@example.com',
      memberPhone: '+821087654321',
      memberNick: 'doctor',
      memberType: 'DOCTOR',
      clinicId: clinic.body.member._id,
      doctorSpecializations: ['DENTIST'],
      professionalLicenseNumber: 'TEST-LICENSE',
    };
    const result = await request(app.getHttpServer())
      .post('/member/signup')
      .send(doctor)
      .expect(201);
    expect(result.body.member.doctorClinicStatus).toBe('PENDING');
    expect(result.body.member.clinicId).toBe(clinic.body.member._id);
    members[0].memberStatus = MemberStatus.SUSPENDED;
    await request(app.getHttpServer())
      .post('/member/signup')
      .send(doctor)
      .expect(400);
  });

  it('rotates refresh tokens atomically, rejects reuse and expiry, and blocks suspended members', async () => {
    const created = await request(app.getHttpServer())
      .post('/member/signup')
      .send(signup)
      .expect(201);
    const refreshToken = created.body.refreshToken;
    const results = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/member/refresh')
          .send({ refreshToken }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    const nextToken = results.find((result) => result.status === 200)!.body
      .refreshToken;
    expect(nextToken).not.toBe(refreshToken);
    const key = createHash('sha256').update(nextToken).digest('hex');
    sessions.get(key)!.expiresAt = new Date(0);
    await request(app.getHttpServer())
      .post('/member/refresh')
      .send({ refreshToken: nextToken })
      .expect(401);
    sessions.get(key)!.expiresAt = new Date(Date.now() + 60_000);
    members[0].memberStatus = MemberStatus.SUSPENDED;
    await request(app.getHttpServer())
      .post('/member/refresh')
      .send({ refreshToken: nextToken })
      .expect(401);
    expect(sessions.size).toBe(0);
  });

  it('creates a Google USER without phone/password and reuses the normal session contract', async () => {
    const result = await googleLogin();
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    expect(result.body.member.memberNick).toBe('Google Person');
    expect(result.body.member.memberType).toBe('USER');
    expect(members[0].authProvider).toBe(AuthProvider.GOOGLE);
    expect(members[0].memberPhone).toBeUndefined();
    expect(members[0].memberPassword).toBeUndefined();
    expect(result.body.member).not.toHaveProperty('googleId');
    const claims = await app
      .get(JwtService)
      .verifyAsync(result.body.accessToken);
    expect(claims.tokenType).toBe('access');
    expect(claims.sub).toBe(String(members[0]._id));
    const stored = [...sessions.values()][0];
    expect(stored.refreshTokenHash).not.toBe(result.body.refreshToken);
    const refreshed = await request(app.getHttpServer())
      .post('/member/refresh')
      .send({ refreshToken: result.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(result.body.refreshToken);
  });

  it('reuses the same Google subject and preserves an existing nickname', async () => {
    const first = await googleLogin();
    const second = await googleLogin({
      name: 'Changed Google Name',
      email: 'changed@example.com',
    });
    expect(second.status).toBe(200);
    expect(second.body.member._id).toBe(first.body.member._id);
    expect(second.body.member.memberNick).toBe('Google Person');
    expect(members).toHaveLength(1);
  });

  it.each([undefined, '', '  '])(
    'assigns a fallback nickname for unusable Google name %j',
    async (name) => {
      const result = await googleLogin({ name });
      expect(result.status).toBe(200);
      expect(result.body.member.memberNick).toMatch(/^google_user\d{6}$/);
    },
  );

  it('resolves duplicate names and permits multiple Google accounts with absent phones/emails', async () => {
    await googleLogin({ email: undefined });
    const second = await googleLogin({
      sub: 'google-subject-2',
      email: undefined,
    });
    expect(second.status).toBe(200);
    expect(second.body.member.memberNick).toMatch(/^google_user\d{6}$/);
    expect(members).toHaveLength(2);
  });

  it('handles concurrent first Google logins without creating duplicate identities', async () => {
    const results = await Promise.all([googleLogin(), googleLogin()]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results[0].body.member._id).toBe(results[1].body.member._id);
    expect(members).toHaveLength(1);
  });

  it('rejects email conflicts without linking or changing the password account', async () => {
    await request(app.getHttpServer())
      .post('/member/signup')
      .send(signup)
      .expect(201);
    const result = await googleLogin({ email: signup.memberEmail });
    expect(result.status).toBe(409);
    expect(members).toHaveLength(1);
    expect(members[0].authProvider).toBe(AuthProvider.EMAIL);
    expect(members[0].googleId).toBeUndefined();
  });

  it.each(['SUSPENDED', 'DELETED'])(
    'rejects inactive Google accounts: %s',
    async (status) => {
      await googleLogin();
      if (status === 'DELETED') members[0].deletedAt = new Date();
      else members[0].memberStatus = MemberStatus.SUSPENDED;
      sessions.clear();
      expect((await googleLogin()).status).toBe(401);
      expect(sessions.size).toBe(0);
    },
  );

  it.each([
    { aud: 'another-client' },
    { iss: 'https://attacker.example' },
    { exp: 1 },
    { sub: '' },
    { nonce: 'another-browser' },
  ])('rejects signed but invalid Google claims: %j', async (claims) => {
    const result = await googleLogin(claims);
    expect(result.status).toBe(401);
    expect(result.body.message).toBe('Invalid Google sign-in');
    expect(members).toHaveLength(0);
    expect(sessions.size).toBe(0);
  });

  it('rejects forged signatures and missing browser nonce cookies', async () => {
    const { nonce, cookie } = await beginGoogle();
    const forged =
      googleToken(nonce).split('.').slice(0, 2).join('.') + '.forged';
    await request(app.getHttpServer())
      .post('/member/google/login')
      .set('Cookie', cookie)
      .send({ idToken: forged })
      .expect(401);
    await request(app.getHttpServer())
      .post('/member/google/login')
      .send({ idToken: googleToken(nonce) })
      .expect(401);
    expect(members).toHaveLength(0);
  });

  it('rejects expired nonce challenges and access JWTs used as nonce challenges', async () => {
    for (const challenge of [
      { tokenType: 'google_nonce', expiresIn: -60 },
      { tokenType: 'access', expiresIn: 300 },
    ]) {
      const nonce = await app
        .get(JwtService)
        .signAsync(
          { nonce: 'random', tokenType: challenge.tokenType },
          { expiresIn: challenge.expiresIn },
        );
      await request(app.getHttpServer())
        .post('/member/google/login')
        .set('Cookie', `medconnect_google_nonce=${nonce}`)
        .send({ idToken: googleToken(nonce) })
        .expect(401);
    }
  });

  it('does not persist unverified Google email addresses', async () => {
    const result = await googleLogin({ email_verified: false });
    expect(result.status).toBe(200);
    expect(members[0].memberEmail).toBeUndefined();
  });

  it('rejects privileged request fields and keeps email/password phone validation', async () => {
    const { nonce, cookie } = await beginGoogle();
    await request(app.getHttpServer())
      .post('/member/google/login')
      .set('Cookie', cookie)
      .send({
        idToken: googleToken(nonce),
        memberType: 'ADMIN',
        memberNick: 'chosen',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/member/signup')
      .send({ ...signup, memberPhone: undefined })
      .expect(400);
    const invalid = new Member({
      ...signup,
      authProvider: AuthProvider.EMAIL,
      memberPhone: undefined,
    });
    await expect(invalid.validate()).rejects.toThrow('memberPhone');
  });

  it('returns 503 when Google sign-in is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await request(app.getHttpServer()).post('/member/google/nonce').expect(503);
    await request(app.getHttpServer())
      .post('/member/google/login')
      .send({ idToken: 'anything' })
      .expect(503);
  });

  it('rejects a token from another browser and duplicate nonce cookies', async () => {
    const first = await beginGoogle();
    const second = await beginGoogle();
    for (const cookie of [second.cookie, `${first.cookie}; ${second.cookie}`]) {
      await request(app.getHttpServer())
        .post('/member/google/login')
        .set('Cookie', cookie)
        .send({ idToken: googleToken(first.nonce) })
        .expect(401);
    }
    expect(members).toHaveLength(0);
    await expect(
      app.get(MemberService).authenticateAccessToken(first.nonce),
    ).rejects.toThrow('Invalid access token');
  });

  it('uses secure host-only nonce cookies in production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const response = await request(app.getHttpServer())
        .post('/member/google/nonce')
        .expect(200);
      const cookie = response.headers['set-cookie'][0];
      expect(cookie).toMatch(/^__Host-medconnect_google_nonce=/);
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=None');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('reports a provider key-fetch outage without leaking error details', async () => {
    jest
      .mocked(OAuth2Client.prototype.getFederatedSignonCertsAsync)
      .mockRejectedValueOnce(
        Object.assign(new Error('sensitive provider details'), {
          code: 'ENOTFOUND',
        }),
      );
    const result = await googleLogin();
    expect(result.status).toBe(503);
    expect(result.body.message).toBe(
      'Google sign-in is temporarily unavailable',
    );
    expect(members).toHaveLength(0);
  });
});
