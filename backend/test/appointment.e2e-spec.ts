import { GraphQLModule } from '@nestjs/graphql';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import { AppointmentResolver } from '../src/components/appointment/appointment.resolver.js';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppointmentController } from '../src/components/appointment/appointment.controller.js';
import { AppointmentService } from '../src/components/appointment/appointment.service.js';
import { MemberAccessGuard } from '../src/components/auth/guards/member-access.guard.js';
import { MemberService } from '../src/components/member/member.service.js';
import { MEMBER } from '../src/schemas/member.model.js';
import { APPOINTMENT_MODEL_NAME } from '../src/schemas/appointment.model.js';
import { MemberStatus, MemberType } from '../src/libs/enum/member.enum.js';

const secret = 'appointment-test-secret-at-least-32-bytes';
const patientId = new Types.ObjectId();
const doctorId = new Types.ObjectId();
const clinicId = new Types.ObjectId();
const appointmentId = new Types.ObjectId();
const appointment = {
  _id: appointmentId,
  patientId,
  doctorId,
  clinicId,
  status: 'CONFIRMED',
  startsAt: new Date('2026-09-15T01:00:00Z'),
  endsAt: new Date('2026-09-15T01:30:00Z'),
  durationMinutes: 30,
  __v: 0,
  internalOnly: 'must never be returned',
};

describe('GET appointment by ID', () => {
  let app: INestApplication<Server>;
  let jwt: JwtService;
  let appointmentQueries = 0;
  const members = new Map<
    string,
    {
      _id: Types.ObjectId;
      memberType: MemberType;
      memberStatus: MemberStatus;
      deletedAt?: Date;
    }
  >();

  const query = (record: Record<string, unknown> | null) => {
    let projection: Record<string, number> | undefined;
    const chain = {
      select: (fields: Record<string, number>) => {
        projection = fields;
        return chain;
      },
      lean: () => chain,
      exec: async () =>
        record && projection
          ? Object.fromEntries(
              Object.entries(record).filter(([key]) => projection![key] === 1),
            )
          : record,
    };
    return chain;
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false }),
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
      controllers: [AppointmentController],
      providers: [
        AppointmentService,
        AppointmentResolver,
        MemberService,
        MemberAccessGuard,
        {
          provide: getModelToken(MEMBER),
          useValue: {
            findOne: (filter: {
              _id: Types.ObjectId;
              memberStatus: MemberStatus;
            }) => {
              const member = members.get(String(filter._id));
              return query(
                member &&
                  member.memberStatus === filter.memberStatus &&
                  !member.deletedAt
                  ? member
                  : null,
              );
            },
          },
        },
        {
          provide: getModelToken(APPOINTMENT_MODEL_NAME),
          useValue: {
            findOne: (filter: Record<string, unknown>) => {
              appointmentQueries++;
              const matches = Object.entries(filter).every(
                ([key, value]) =>
                  String(appointment[key as keyof typeof appointment]) ===
                  String(value),
              );
              return query(matches ? appointment : null);
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
      }),
    );
    await app.listen(0, '127.0.0.1');
    jwt = app.get(JwtService);
  });
  beforeEach(() => {
    members.clear();
    appointmentQueries = 0;
    for (const [_id, memberType] of [
      [patientId, MemberType.USER],
      [doctorId, MemberType.DOCTOR],
      [clinicId, MemberType.CLINIC],
    ] as const) {
      members.set(String(_id), {
        _id,
        memberType,
        memberStatus: MemberStatus.ACTIVE,
      });
    }
  });
  afterAll(async () => {
    await app.close();
  });
  const tokenFor = (id: Types.ObjectId) =>
    jwt.signAsync({ sub: String(id), tokenType: 'access' });
  const get = (token: string, id = String(appointmentId)) =>
    request(app.getHttpServer())
      .get(`/appointment/${id}`)
      .set('Authorization', `Bearer ${token}`);

  it.each([
    [MemberType.USER, patientId],
    [MemberType.DOCTOR, doctorId],
    [MemberType.CLINIC, clinicId],
  ])('allows the appointment owner with role %s', async (_role, id) => {
    const response = await get(await tokenFor(id)).expect(200);
    expect(response.body._id).toBe(String(appointmentId));
    expect(response.body.startsAt).toBe('2026-09-15T01:00:00.000Z');
    expect(response.body.patientId).toBe(String(patientId));
    expect(response.body).not.toHaveProperty('__v');
    expect(response.body).not.toHaveProperty('internalOnly');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    MemberType.USER,
    MemberType.DOCTOR,
    MemberType.CLINIC,
    MemberType.ADMIN,
  ])('hides records from unrelated %s accounts', async (memberType) => {
    const _id = new Types.ObjectId();
    members.set(String(_id), {
      _id,
      memberType,
      memberStatus: MemberStatus.ACTIVE,
    });
    const token = await tokenFor(_id);
    const unrelated = await get(token).expect(404);
    const missing = await get(token, String(new Types.ObjectId())).expect(404);
    expect(unrelated.body).toEqual(missing.body);
  });

  it('uses the current database role instead of a supplied JWT role', async () => {
    members.get(String(patientId))!.memberType = MemberType.CLINIC;
    const token = await jwt.signAsync({
      sub: String(patientId),
      tokenType: 'access',
      memberType: 'USER',
    });
    await get(token).expect(404);
  });

  it.each(['SUSPENDED', 'DELETED', 'soft-deleted', 'missing'])(
    'rejects an account that is %s after token issuance',
    async (state) => {
      const token = await tokenFor(patientId);
      const member = members.get(String(patientId))!;
      if (state === 'missing') members.delete(String(patientId));
      else if (state === 'soft-deleted') member.deletedAt = new Date();
      else member.memberStatus = state as MemberStatus;
      await get(token).expect(401);
      expect(appointmentQueries).toBe(0);
    },
  );

  it('rejects missing and invalid authorization before reading appointments', async () => {
    await request(app.getHttpServer())
      .get(`/appointment/${appointmentId}`)
      .expect(401);
    const tokens = [
      'not-a-jwt',
      await jwt.signAsync(
        { sub: String(patientId), tokenType: 'access' },
        { secret: 'wrong-signing-secret-at-least-32-bytes' },
      ),
      await jwt.signAsync(
        { sub: String(patientId), tokenType: 'access' },
        { expiresIn: -1 },
      ),
      await jwt.signAsync({ sub: String(patientId), tokenType: 'refresh' }),
      await jwt.signAsync({ sub: 'invalid-id', tokenType: 'access' }),
      await jwt.signAsync(
        { sub: String(patientId), tokenType: 'access' },
        { audience: 'another-api' },
      ),
      await jwt.signAsync(
        { sub: String(patientId), tokenType: 'access' },
        { issuer: 'another-issuer' },
      ),
      await jwt.signAsync(
        { sub: String(patientId), tokenType: 'access' },
        { algorithm: 'HS384' },
      ),
    ];
    for (const token of tokens) await get(token).expect(401);
    expect(appointmentQueries).toBe(0);
  });

  it('rejects malformed IDs and returns 404 for missing appointments', async () => {
    const token = await tokenFor(patientId);
    await get(token, 'invalid-id').expect(400);
    expect(appointmentQueries).toBe(0);
    await get(token, String(new Types.ObjectId())).expect(404);
  });
  const gqlGet = (token: string, id = String(appointmentId)) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: `query Get($id: ID!) { getAppointment(id: $id) { _id startsAt status patientId } }`,
        variables: { id },
      });

  it.each([patientId, doctorId, clinicId])(
    'allows a GraphQL query by participant %s',
    async (id) => {
      const result = await gqlGet(await tokenFor(id)).expect(200);
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.getAppointment._id).toBe(String(appointmentId));
    },
  );

  it('checks GraphQL JWTs, current account status, ownership, and ID validation', async () => {
    const valid = await tokenFor(patientId);
    expect((await gqlGet('invalid')).body.errors[0].extensions.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(
      (await gqlGet(valid, 'invalid-id')).body.errors[0].extensions.code,
    ).toBe('BAD_USER_INPUT');
    expect(
      (await gqlGet(valid, String(new Types.ObjectId()))).body.errors[0]
        .extensions.code,
    ).toBe('NOT_FOUND');
    members.get(String(patientId))!.memberType = MemberType.CLINIC;
    expect((await gqlGet(valid)).body.errors[0].extensions.code).toBe(
      'NOT_FOUND',
    );
    members.get(String(patientId))!.memberStatus = MemberStatus.SUSPENDED;
    const blocked = await gqlGet(valid);
    expect(blocked.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(blocked.body.errors[0].extensions).not.toHaveProperty('stacktrace');
  });
});
