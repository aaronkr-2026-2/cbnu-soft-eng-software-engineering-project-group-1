import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { model } from 'mongoose';
import request from 'supertest';
import { MemberController } from '../src/components/member/member.controller.js';
import { memberRateLimit } from '../src/components/auth/member-rate-limit.js';
import { MemberService } from '../src/components/member/member.service.js';
import MemberSchema, { MEMBER } from '../src/schemas/member.model.js';
import { MEMBER_SESSION } from '../src/schemas/member-session.model.js';
import type { MemberDocument } from '../src/libs/types/member.types.js';
import { MemberStatus } from '../src/libs/enum/member.enum.js';

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

  beforeAll(async () => {
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
        {
          provide: getModelToken(MEMBER),
          useValue: {
            create: async (data: object) => {
              const member = new Member(data);
              await member.validate();
              if (
                members.some(
                  (item) =>
                    item.memberEmail === member.memberEmail ||
                    item.memberPhone === member.memberPhone ||
                    item.memberNick === member.memberNick,
                )
              )
                throw { code: 11000 };
              members.push(member);
              return member;
            },
            findOne: ({ memberEmail }: { memberEmail: string }) =>
              query(
                members.find((item) => item.memberEmail === memberEmail) ??
                  null,
              ),
            findById: (id: unknown) =>
              query(
                members.find((item) => String(item._id) === String(id)) ?? null,
              ),
            exists: async (filter: Record<string, unknown>) =>
              members.find(
                (item) =>
                  String(item._id) === filter._id &&
                  item.memberType === filter.memberType &&
                  item.memberStatus === filter.memberStatus &&
                  !item.deletedAt,
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
    members.length = 0;
    sessions.clear();
  });
  afterAll(async () => {
    await app.close();
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

  it.each([8, 100])('accepts signup passwords of %i characters', async (length) => {
    await request(app.getHttpServer())
      .post('/member/signup')
      .send({ ...signup, memberPassword: 'a'.repeat(length) })
      .expect(201);
  });

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
});
