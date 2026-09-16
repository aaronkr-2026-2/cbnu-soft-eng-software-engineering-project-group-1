import { GraphQLModule } from '@nestjs/graphql';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import { AppointmentResolver } from '../src/components/appointment/appointment.resolver.js';
import { Test } from '@nestjs/testing';
import {
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { model, Types } from 'mongoose';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppointmentController } from '../src/components/appointment/appointment.controller.js';
import { AppointmentService } from '../src/components/appointment/appointment.service.js';
import { MemberService } from '../src/components/member/member.service.js';
import { MemberAccessGuard } from '../src/components/auth/guards/member-access.guard.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../src/schemas/appointment.model.js';
import { MEMBER } from '../src/schemas/member.model.js';
import { DOCTOR_AVAILABILITY_MODEL_NAME } from '../src/schemas/doctor-availability.model.js';
import { DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME } from '../src/schemas/doctor-availability-override.model.js';
import { AppointmentStatus } from '../src/libs/enum/appointment.enum.js';
import { MemberType } from '../src/libs/enum/member.enum.js';

const Appointment = model('BookingTestAppointment', AppointmentSchema);
const patientId = new Types.ObjectId();
const clinicId = new Types.ObjectId();
const doctorId = new Types.ObjectId();
const start = new Date();
start.setUTCDate(start.getUTCDate() + 7);
start.setUTCHours(1, 0, 0, 0); // 10:00 Asia/Seoul
const input = {
  doctorId: String(doctorId),
  clinicId: String(clinicId),
  startsAt: start.toISOString(),
};
const date = start.toISOString().slice(0, 10);
const weekday = start.getUTCDay();
type Row = Record<string, unknown>;

describe('POST /appointment/bookAppointment', () => {
  let app: INestApplication<Server>;
  let role: MemberType;
  let memberRows: Row[];
  let weekly: Row[];
  let overrides: Row[];
  let appointments: InstanceType<typeof Appointment>[];
  const matches = (row: Row, filter: Row) =>
    Object.entries(filter).every(([key, value]) =>
      value === null ? row[key] == null : String(row[key]) === String(value),
    );
  const query = (value: unknown) => {
    const chain = {
      select: () => chain,
      lean: () => chain,
      exec: async () => value,
    };
    return chain;
  };
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [GraphQLModule.forRoot({ ...graphqlConfig, graphiql: false })],
      controllers: [AppointmentController],
      providers: [
        AppointmentService,
        AppointmentResolver,
        MemberAccessGuard,
        {
          provide: MemberService,
          useValue: {
            authenticateAccessToken: async (token: string) => {
              if (token !== 'test-token') throw new UnauthorizedException();
              return { _id: patientId, memberType: role };
            },
          },
        },
        {
          provide: getModelToken(MEMBER),
          useValue: {
            findOne: (filter: Row) =>
              query(memberRows.find((row) => matches(row, filter)) ?? null),
          },
        },
        {
          provide: getModelToken(DOCTOR_AVAILABILITY_MODEL_NAME),
          useValue: {
            find: (filter: Row) =>
              query(weekly.filter((row) => matches(row, filter))),
          },
        },
        {
          provide: getModelToken(DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME),
          useValue: {
            find: (filter: Row) =>
              query(overrides.filter((row) => matches(row, filter))),
          },
        },
        {
          provide: getModelToken(APPOINTMENT_MODEL_NAME),
          useValue: {
            init: async () => undefined,
            exists: async (filter: {
              doctorId: string;
              clinicId: string;
              startsAt: { $lt: Date };
              endsAt: { $gt: Date };
            }) =>
              appointments.some(
                (item) =>
                  String(item.doctorId) === filter.doctorId &&
                  ['PENDING', 'CONFIRMED'].includes(item.status) &&
                  item.startsAt < filter.startsAt.$lt &&
                  item.endsAt > filter.endsAt.$gt,
              ),
            create: async (data: Row) => {
              const item = new Appointment(data);
              await item.validate();
              if (
                appointments.some(
                  (other) =>
                    String(other.doctorId) === String(item.doctorId) &&
                    +other.startsAt === +item.startsAt &&
                    ['PENDING', 'CONFIRMED'].includes(other.status),
                )
              )
                throw { code: 11000 };
              appointments.push(item);
              return item;
            },
          },
        },
      ],
    }).compile();
    app = fixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => {
    role = MemberType.USER;
    memberRows = [
      {
        _id: clinicId,
        memberType: 'CLINIC',
        memberStatus: 'ACTIVE',
        clinicTimezone: 'Asia/Seoul',
      },
      {
        _id: doctorId,
        memberType: 'DOCTOR',
        memberStatus: 'ACTIVE',
        clinicId,
        doctorClinicStatus: 'APPROVED',
      },
    ];
    weekly = [
      { doctorId, clinicId, weekday, startMinute: 540, endMinute: 1020 },
    ];
    overrides = [];
    appointments = [];
  });
  afterAll(async () => {
    await app.close();
  });
  const book = (changes: Row = {}) =>
    request(app.getHttpServer())
      .post('/appointment/bookAppointment')
      .set('Authorization', 'Bearer test-token')
      .send({ ...input, ...changes });

  it('creates a pending 30-minute booking for the authenticated patient', async () => {
    const result = await book().expect(201);
    expect(result.body.patientId).toBe(String(patientId));
    expect(result.body.status).toBe('PENDING');
    expect(result.body.startsAt).toBe(start.toISOString());
    expect(result.body.endsAt).toBe(
      new Date(+start + 30 * 60_000).toISOString(),
    );
    expect(result.body.durationMinutes).toBe(30);
    expect(result.body).not.toHaveProperty('__v');
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/appointment/bookAppointment')
      .send(input)
      .expect(401);
  });
  it.each([MemberType.CLINIC, MemberType.DOCTOR, MemberType.ADMIN])(
    'rejects booking as %s',
    async (type) => {
      role = type;
      await book().expect(403);
    },
  );
  it.each([
    { patientId: String(new Types.ObjectId()) },
    { status: 'CONFIRMED' },
    { endsAt: start.toISOString() },
    { doctorId: 'bad-id' },
    { clinicId: { $ne: null } },
    { startsAt: '2030-02-30T10:00:00Z' },
    { startsAt: start.toISOString().replace('Z', '') },
    { startsAt: '2020-01-01T10:00:00Z' },
    { startsAt: new Date(+start + 5 * 60_000).toISOString() },
  ])('rejects invalid or server-owned input %j', async (changes) => {
    await book(changes).expect(400);
    expect(appointments).toHaveLength(0);
  });
  it.each(['PENDING', 'REJECTED', 'REMOVED'])(
    'rejects doctor affiliation %s',
    async (status) => {
      memberRows[1].doctorClinicStatus = status;
      await book().expect(400);
    },
  );
  it('rejects a doctor from another clinic and disabled/deleted members', async () => {
    memberRows[1].clinicId = new Types.ObjectId();
    await book().expect(400);
    memberRows[1].clinicId = clinicId;
    memberRows[1].deletedAt = new Date();
    await book().expect(400);
    delete memberRows[1].deletedAt;
    memberRows[0].memberStatus = 'SUSPENDED';
    await book().expect(400);
  });
  it('rejects missing availability and slots that do not fit the complete interval', async () => {
    weekly = [];
    await book().expect(409);
    weekly = [
      { doctorId, clinicId, weekday, startMinute: 540, endMinute: 600 },
    ];
    await book().expect(409);
  });
  it('uses custom date hours instead of weekly hours', async () => {
    overrides = [
      {
        doctorId,
        clinicId,
        date,
        type: 'CUSTOM_HOURS',
        startMinute: 660,
        endMinute: 720,
      },
    ];
    await book().expect(409);
    weekly = [];
    overrides[0].startMinute = 600;
    await book().expect(201);
  });
  it('honors full-day and partial unavailability, even with custom hours', async () => {
    overrides = [
      { doctorId, clinicId, date, type: 'UNAVAILABLE' },
      {
        doctorId,
        clinicId,
        date,
        type: 'CUSTOM_HOURS',
        startMinute: 540,
        endMinute: 1020,
      },
    ];
    await book().expect(409);
    overrides[0].startMinute = 600;
    overrides[0].endMinute = 630;
    await book().expect(409);
    overrides[0].startMinute = 630;
    overrides[0].endMinute = 660;
    await book().expect(201);
  });
  it('returns one 201 and one 409 for simultaneous requests, and allows a canceled slot to be reused', async () => {
    const results = await Promise.all([book(), book()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(appointments).toHaveLength(1);
    appointments[0].status = AppointmentStatus.CANCELED;
    await book().expect(201);
  });
  const mutation = `mutation Book($input: BookAppointmentInput!) {
    bookAppointment(input: $input) { _id patientId doctorId clinicId startsAt endsAt status durationMinutes }
  }`;
  const gqlBook = (changes: Row = {}) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', 'Bearer test-token')
      .send({
        query: mutation,
        variables: { input: { ...input, ...changes } },
      });

  it('books through GraphQL using the same service and serialized IDs/dates', async () => {
    const result = await gqlBook().expect(200);
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.bookAppointment).toMatchObject({
      patientId: String(patientId),
      status: 'PENDING',
      startsAt: start.toISOString(),
      durationMinutes: 30,
    });
    expect(result.headers['cache-control']).toContain('no-store');
    const duplicate = await gqlBook().expect(200);
    expect(duplicate.body.errors[0].extensions.code).toBe('CONFLICT');
  });

  it('validates GraphQL inputs and rejects client-supplied patient IDs', async () => {
    for (const changes of [
      { doctorId: 'bad-id' },
      { startsAt: 'invalid-date' },
      { patientId: String(patientId) },
    ]) {
      const result = await gqlBook(changes);
      expect(result.body.errors).toBeDefined();
    }
    expect(appointments).toHaveLength(0);
  });

  it('enforces GraphQL authentication, roles, and availability', async () => {
    const absent = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: mutation, variables: { input } });
    expect(absent.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    role = MemberType.CLINIC;
    expect((await gqlBook()).body.errors[0].extensions.code).toBe('FORBIDDEN');
    role = MemberType.USER;
    weekly = [];
    expect((await gqlBook()).body.errors[0].extensions.code).toBe('CONFLICT');
    expect(appointments).toHaveLength(0);
  });
});
