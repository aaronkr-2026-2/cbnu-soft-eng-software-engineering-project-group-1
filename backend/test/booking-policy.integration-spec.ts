import { AppointmentCalendarService } from '../src/components/appointment/appointment-calendar.service.js';
import { AppointmentSource } from '../src/libs/enum/appointment.enum.js';
import { NotificationService } from '../src/components/notification/notification.service.js';
import { AppointmentWaitlistLifecycleService } from '../src/components/appointment/appointment-waitlist-lifecycle.service.js';
import { WaitlistService } from '../src/components/waitlist/waitlist.service.js';
import { AppointmentEventSchema } from '../src/schemas/appointment-event.model.js';
import type { InferSchemaType } from 'mongoose';
import { AppointmentPromotionService } from '../src/components/appointment/appointment-promotion.service.js';
import {
  BadRequestException,
  UnauthorizedException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppointmentService } from '../src/components/appointment/appointment.service.js';
import { BookingMigrationService } from '../src/components/booking/booking-migration.service.js';
import { BookingPolicyService } from '../src/components/booking/booking-policy.service.js';
import { BookingCoordinationService } from '../src/components/booking/booking-coordination.service.js';
import { parseBookingResolutions } from '../src/components/booking/booking-migration.js';
import { BookingUnavailableException } from '../src/components/booking/booking-error.js';
import { APPOINTMENT_MODEL_NAME } from '../src/schemas/appointment.model.js';
import { APPOINTMENT_EVENT } from '../src/schemas/appointment-event.model.js';
import {
  DoctorSpecialization,
  MemberType,
} from '../src/libs/enum/member.enum.js';

if (
  process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
  !process.env.BOOKING_TEST_URI?.startsWith('mongodb://127.0.0.1:')
)
  throw new Error('Use the owned disposable booking integration runner');
const id = () => new Types.ObjectId();
const patient = id(),
  patient2 = id(),
  clinic = id(),
  clinic2 = id(),
  doctor = id(),
  doctor2 = id(),
  doctor3 = id();
const start = new Date('2035-01-01T01:00:00Z');
const at = (minutes: number) => new Date(+start + minutes * 60_000);
const input = {
  doctorId: String(doctor),
  clinicId: String(clinic),
  startsAt: start.toISOString(),
  specialty: DoctorSpecialization.CARDIOLOGIST,
};
const mutation = `mutation Book($input: BookAppointmentInput!) {
  bookAppointment(input: $input) { _id patientId doctorId clinicId specialty startsAt endsAt status source version durationMinutes }
}`;

describe('Specialty-aware booking policy through the real API and MongoDB', () => {
  let app: INestApplication<Server>;
  let connection: Connection;
  let migration: BookingMigrationService;
  let token: string;
  let token2: string;
  const dbName = `booking_policy_test_${randomUUID().replaceAll('-', '')}`;
  const envKeys = [
    'MONGO_URI',
    'BOOKING_POLICY_V2_ENABLED',
    'WAITLIST_ENROLLMENT_ENABLED',
    'COMMITMENT_REPLACEMENT_ENABLED',
    'WAITLIST_PROMOTION_ENABLED',
    'WAITLIST_NOTIFICATIONS_ENABLED',
    'WAITLIST_LIFECYCLE_ENABLED',
    'JWT_ACCESS_SECRET',
    'NODE_ENV',
  ] as const;
  const previous = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  beforeAll(async () => {
    process.env.MONGO_URI = process.env.BOOKING_TEST_URI!.replace(
      '/?',
      `/${dbName}?`,
    );
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      'disposable-booking-test-secret-at-least-32-bytes';
    process.env.WAITLIST_ENROLLMENT_ENABLED = 'false';
    process.env.COMMITMENT_REPLACEMENT_ENABLED = 'false';
    process.env.WAITLIST_PROMOTION_ENABLED = 'false';
    process.env.WAITLIST_NOTIFICATIONS_ENABLED = 'false';
    process.env.WAITLIST_LIFECYCLE_ENABLED = 'false';
    process.env.BOOKING_POLICY_V2_ENABLED = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () => new BadRequestException('Invalid request data'),
      }),
    );
    connection = app.get<Connection>(getConnectionToken());
    migration = app.get(BookingMigrationService);
    await migration.apply();
    process.env.BOOKING_POLICY_V2_ENABLED = 'true';
    await app.listen(0, '127.0.0.1');
    token = await app
      .get(JwtService)
      .signAsync({ sub: String(patient), tokenType: 'access', authVersion: 0 });
    token2 = await app.get(JwtService).signAsync({
      sub: String(patient2),
      tokenType: 'access',
      authVersion: 0,
    });
  });

  afterAll(async () => {
    await app?.close();
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });

  beforeEach(async () => {
    process.env.WAITLIST_ENROLLMENT_ENABLED = 'false';
    process.env.COMMITMENT_REPLACEMENT_ENABLED = 'false';
    process.env.WAITLIST_PROMOTION_ENABLED = 'false';
    process.env.WAITLIST_NOTIFICATIONS_ENABLED = 'false';
    process.env.WAITLIST_LIFECYCLE_ENABLED = 'false';
    process.env.BOOKING_POLICY_V2_ENABLED = 'false';
    for (const name of [
      'waitlists',
      'waitlist_cleanup',
      'notifications',
      'notification_outbox',
      'appointments',
      'appointment_events',
      'members',
      'booking_commitments',
      'booking_gates',
      'booking_policy',
      'booking_migration_audit',
      'doctor_availability',
      'doctor_availability_overrides',
    ])
      await connection.db!.collection(name).deleteMany({});
    // Explicit fixture prerequisites while onboarding/schedule APIs await Step 4.
    await connection.db!.collection('members').insertMany([
      {
        _id: patient,
        memberType: 'USER',
        memberStatus: 'ACTIVE',
        authVersion: 0,
      },
      {
        _id: patient2,
        memberType: 'USER',
        memberStatus: 'ACTIVE',
        authVersion: 0,
      },
      ...[clinic, clinic2].map((_id) => ({
        _id,
        memberType: 'CLINIC',
        memberStatus: 'ACTIVE',
        clinicTimezone: 'Asia/Seoul',
      })),
      {
        _id: doctor,
        memberType: 'DOCTOR',
        memberStatus: 'ACTIVE',
        clinicId: clinic,
        doctorClinicStatus: 'APPROVED',
        doctorSpecializations: ['CARDIOLOGIST'],
      },
      {
        _id: doctor2,
        memberType: 'DOCTOR',
        memberStatus: 'ACTIVE',
        clinicId: clinic,
        doctorClinicStatus: 'APPROVED',
        doctorSpecializations: ['CARDIOLOGIST', 'DENTIST'],
      },
      {
        _id: doctor3,
        memberType: 'DOCTOR',
        memberStatus: 'ACTIVE',
        clinicId: clinic2,
        doctorClinicStatus: 'APPROVED',
        doctorSpecializations: ['DENTIST'],
      },
    ]);
    await connection.db!.collection('doctor_availability').insertMany(
      [doctor, doctor2, doctor3].flatMap((doctorId) =>
        Array.from({ length: 7 }, (_, weekday) => ({
          doctorId,
          clinicId: doctorId === doctor3 ? clinic2 : clinic,
          weekday,
          startMinute: 540,
          endMinute: 1080,
        })),
      ),
    );
    await migration.apply();
    process.env.BOOKING_POLICY_V2_ENABLED = 'true';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    // Restore Mongoose's prototype health getter after policy-clock tests.
    Reflect.deleteProperty(connection, 'readyState');
  });

  const freezeTime = (now: number) => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    // Advancing the policy clock years ahead also makes Mongoose's real
    // heartbeat timestamp appear stale. Keep that health getter independent
    // of the simulated policy time; the replica-set hello is still real.
    Object.defineProperty(connection, 'readyState', {
      configurable: true,
      writable: true,
      value: 1,
    });
  };

  const rest = (changes = {}, bearer = token) =>
    request(app.getHttpServer())
      .post('/appointment/bookAppointment')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ ...input, ...changes });
  const gql = (changes = {}, bearer = token) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${bearer}`)
      .send({
        query: mutation,
        variables: { input: { ...input, ...changes } },
      });
  const legacy = (changes: Record<string, unknown> = {}) => ({
    _id: id(),
    doctorId: doctor,
    clinicId: clinic,
    patientId: patient,
    startsAt: start,
    endsAt: at(30),
    durationMinutes: 30,
    status: 'PENDING',
    ...changes,
  });
  const seed = async (row: ReturnType<typeof legacy>) => {
    process.env.BOOKING_POLICY_V2_ENABLED = 'false';
    await connection.db!.collection('booking_policy').deleteMany({});
    await connection.db!.collection('appointments').insertOne(row);
  };

  it('creates a CONFIRMED appointment and matching ledger entry atomically', async () => {
    const response = await rest().expect(201);
    expect(response.body).toMatchObject({
      status: 'CONFIRMED',
      source: 'ONLINE',
      specialty: 'CARDIOLOGIST',
      patientId: String(patient),
      startsAt: start.toISOString(),
      endsAt: at(30).toISOString(),
      durationMinutes: 30,
    });
    expect(response.body.version).toMatch(/^[a-f\d-]{36}$/);
    expect(response.body).not.toHaveProperty('__v');
    const entry = await connection
      .db!.collection('booking_commitments')
      .findOne({ commitmentId: new Types.ObjectId(response.body._id) });
    expect(entry).toMatchObject({
      version: response.body.version,
      specialty: 'CARDIOLOGIST',
      status: 'CONFIRMED',
      patientId: patient,
    });
    const own = await request(app.getHttpServer())
      .get(`/appointment/${response.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(own.body.version).toBe(response.body.version);
  });

  it('returns matching structured own-commitment conflicts in REST and GraphQL', async () => {
    const first = await rest().expect(201);
    const changes = {
      doctorId: String(doctor2),
      startsAt: at(23 * 60 + 30).toISOString(),
    };
    const second = await gql(changes).expect(200);
    const detail = second.body.errors[0].extensions.booking;
    expect(second.body.errors[0].extensions.code).toBe('CONFLICT');
    expect(detail).toEqual({
      reason: 'COMMITMENT_CONFLICT',
      choices: ['KEEP'],
      existingCommitments: [
        {
          kind: 'APPOINTMENT',
          id: first.body._id,
          version: first.body.version,
          doctorId: String(doctor),
          clinicId: String(clinic),
          specialty: 'CARDIOLOGIST',
          startsAt: start.toISOString(),
          endsAt: at(30).toISOString(),
          status: 'CONFIRMED',
        },
      ],
    });
    expect((await rest(changes).expect(409)).body.booking).toEqual(detail);
    expect(
      await connection.db!.collection('appointments').countDocuments(),
    ).toBe(1);
  });

  it('allows exactly 24 hours between same-clinic/specialty commitments', async () => {
    await rest().expect(201);
    const response = await gql({
      doctorId: String(doctor2),
      startsAt: at(24 * 60).toISOString(),
    });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.bookAppointment.status).toBe('CONFIRMED');
  });

  it('blocks overlapping appointments across clinics/specialties but permits adjacent ones', async () => {
    await rest().expect(201);
    const other = {
      doctorId: String(doctor3),
      clinicId: String(clinic2),
      specialty: 'DENTIST',
    };
    expect((await rest(other).expect(409)).body.booking.reason).toBe(
      'PATIENT_OVERLAP',
    );
    await rest({ ...other, startsAt: at(30).toISOString() }).expect(201);
  });

  it('has one cross-doctor winner for concurrent requests by one patient', async () => {
    const results = await Promise.all([
      rest(),
      rest({ doctorId: String(doctor2), startsAt: at(30).toISOString() }),
    ]);
    expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(
      await connection.db!.collection('appointments').countDocuments(),
    ).toBe(1);
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(1);
  });

  it('does not reveal the other patient in slot-contention errors', async () => {
    const results = await Promise.all([rest(), rest({}, token2)]);
    expect(results.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(results.find((item) => item.status === 409)!.body.booking).toEqual({
      reason: 'SLOT_OCCUPIED',
      existingCommitments: [],
      choices: [],
    });
  });

  it.each([
    { specialty: undefined },
    { specialty: 'INVALID' },
    { specialty: 'DENTIST' },
    { patientId: String(patient2) },
    { status: 'PENDING' },
    { source: 'PHONE' },
    { version: 'client-controlled' },
  ])('rejects invalid/server-owned booking input %j', async (changes) => {
    await rest(changes).expect(400);
    expect((await gql(changes)).body.errors).toBeDefined();
    expect(
      await connection.db!.collection('appointments').countDocuments(),
    ).toBe(0);
  });

  it('rejects suspended accounts, revoked sessions and stale service principals', async () => {
    await connection
      .db!.collection('members')
      .updateOne({ _id: patient }, { $set: { memberStatus: 'SUSPENDED' } });
    await rest().expect(401);
    await expect(
      app.get(AppointmentService).bookAppointment(input, {
        _id: patient,
        memberType: MemberType.USER,
        authVersion: 0,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await connection
      .db!.collection('members')
      .updateOne(
        { _id: patient },
        { $set: { memberStatus: 'ACTIVE', authVersion: 1 } },
      );
    await rest().expect(401);
    await expect(
      app.get(AppointmentService).bookAppointment(input, {
        _id: patient,
        memberType: MemberType.USER,
        authVersion: 0,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed for a disabled flag or missing migration marker on both transports', async () => {
    process.env.BOOKING_POLICY_V2_ENABLED = 'false';
    expect((await rest().expect(503)).body.booking.reason).toBe(
      'FEATURE_DISABLED',
    );
    expect((await gql()).body.errors[0].extensions.booking.reason).toBe(
      'FEATURE_DISABLED',
    );
    process.env.BOOKING_POLICY_V2_ENABLED = 'true';
    await connection.db!.collection('booking_policy').deleteMany({});
    expect((await rest().expect(503)).body.booking.reason).toBe(
      'MIGRATION_REQUIRED',
    );
    expect((await gql()).body.errors[0].extensions.booking.reason).toBe(
      'MIGRATION_REQUIRED',
    );
  });

  it('rejects activation when an active appointment is absent from the ledger', async () => {
    await connection.db!.collection('appointments').insertOne(
      legacy({
        status: 'CONFIRMED',
        specialty: 'CARDIOLOGIST',
        source: 'ONLINE',
        version: randomUUID(),
      }),
    );
    await expect(
      app.get(BookingPolicyService).onModuleInit(),
    ).rejects.toBeInstanceOf(BookingUnavailableException);
  });

  it('rolls back the ledger if appointment persistence fails', async () => {
    jest
      .spyOn(connection.model(APPOINTMENT_MODEL_NAME), 'create')
      .mockRejectedValueOnce(new Error('injected appointment failure'));
    await rest().expect(500);
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(0);
    expect(
      await connection.db!.collection('appointments').countDocuments(),
    ).toBe(0);
  });

  it('respects an unresolved slot allocation gate', async () => {
    await app.get(BookingCoordinationService).run(
      {
        patientIds: [patient],
        slots: [{ doctorId: doctor, startsAt: start }],
      },
      (tx) => tx.holdSlot({ doctorId: doctor, startsAt: start }),
    );
    expect((await rest().expect(409)).body.booking.reason).toBe(
      'STALE_COMMITMENT',
    );
  });

  it('dry-runs without inferring a specialty or silently confirming a pending record', async () => {
    const row = legacy();
    await seed(row);
    const audit = await migration.audit();
    expect(audit.summary.issueCounts).toMatchObject({
      PENDING_REQUIRES_RESOLUTION: 1,
      SPECIALTY_REQUIRES_RESOLUTION: 1,
    });
    await expect(migration.apply()).rejects.toThrow('unresolved');
    expect(
      await connection.db!.collection('appointments').findOne({ _id: row._id }),
    ).toEqual(row);
    expect(
      await connection.db!.collection('booking_policy').countDocuments(),
    ).toBe(0);
  });

  it('applies an explicit legacy resolution idempotently with stable version and audit evidence', async () => {
    const row = legacy();
    await seed(row);
    const decisions = parseBookingResolutions([
      {
        appointmentId: String(row._id),
        specialty: 'CARDIOLOGIST',
        status: 'CONFIRMED',
        evidenceRef: 'fixture-review-1',
      },
    ]);
    await migration.apply(decisions);
    const first = await connection
      .db!.collection('appointments')
      .findOne({ _id: row._id });
    await migration.apply(decisions);
    expect(
      await connection.db!.collection('appointments').findOne({ _id: row._id }),
    ).toEqual(first);
    expect(first).toMatchObject({
      source: 'LEGACY',
      status: 'CONFIRMED',
      specialty: 'CARDIOLOGIST',
    });
    expect(
      await connection
        .db!.collection('booking_migration_audit')
        .countDocuments(),
    ).toBe(1);
    expect(
      await connection
        .db!.collection('booking_migration_audit')
        .findOne({ appointmentId: row._id }),
    ).toMatchObject({ evidenceRef: 'fixture-review-1' });
    expect((await migration.audit()).summary).toMatchObject({
      readyToApply: true,
      ledgerMatches: true,
      metadataMatches: true,
    });
    process.env.BOOKING_POLICY_V2_ENABLED = 'true';
    await app.get(BookingPolicyService).onModuleInit();
    expect(
      (await rest({ doctorId: String(doctor2) }).expect(409)).body.booking
        .reason,
    ).toBe('COMMITMENT_CONFLICT');
  });

  it('keeps unresolved terminal history readable with null specialty and no active commitment', async () => {
    const row = legacy({
      startsAt: new Date('2020-01-01T01:00Z'),
      endsAt: new Date('2020-01-01T01:30Z'),
      status: 'COMPLETED',
    });
    await seed(row);
    await migration.apply();
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(0);
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query:
          'query($id: ID!) { getAppointment(id: $id) { specialty source version status } }',
        variables: { id: String(row._id) },
      });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.getAppointment).toMatchObject({
      specialty: null,
      source: 'LEGACY',
      status: 'COMPLETED',
    });
  });

  it('requires explicit resolution of existing patient conflicts before activation', async () => {
    const first = legacy({ status: 'CONFIRMED', specialty: 'CARDIOLOGIST' });
    const second = legacy({
      doctorId: doctor2,
      status: 'CONFIRMED',
      specialty: 'CARDIOLOGIST',
      startsAt: at(30),
      endsAt: at(60),
    });
    await seed(first);
    await connection.db!.collection('appointments').insertOne(second);
    expect(
      (await migration.audit()).summary.issueCounts.COMMITMENT_CONFLICT,
    ).toBe(1);
    await expect(migration.apply()).rejects.toThrow('unresolved');
    await migration.apply(
      parseBookingResolutions([
        {
          appointmentId: String(second._id),
          status: 'CANCELED',
          evidenceRef: 'fixture-review-conflict',
        },
      ]),
    );
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(1);
  });

  it('retains new audit evidence when previously unresolved terminal history is resolved later', async () => {
    const row = legacy({
      startsAt: new Date('2020-01-01T01:00Z'),
      endsAt: new Date('2020-01-01T01:30Z'),
      status: 'COMPLETED',
    });
    await seed(row);
    await migration.apply();
    await migration.apply(
      parseBookingResolutions([
        {
          appointmentId: String(row._id),
          specialty: 'DENTIST',
          evidenceRef: 'fixture-historical-evidence',
        },
      ]),
    );
    expect(
      await connection
        .db!.collection('booking_migration_audit')
        .countDocuments(),
    ).toBe(2);
    expect(
      await connection
        .db!.collection('booking_migration_audit')
        .findOne({ evidenceRef: 'fixture-historical-evidence' }),
    ).toMatchObject({ previousSpecialty: null, specialty: 'DENTIST' });
  });

  it('rejects premature completion and past confirmation without changing legacy records', async () => {
    const future = legacy();
    await seed(future);
    await expect(
      migration.apply(
        parseBookingResolutions([
          {
            appointmentId: String(future._id),
            specialty: 'CARDIOLOGIST',
            status: 'COMPLETED',
            evidenceRef: 'fixture-invalid-completion',
          },
        ]),
      ),
    ).rejects.toThrow('unresolved');
    expect(
      await connection
        .db!.collection('appointments')
        .findOne({ _id: future._id }),
    ).toEqual(future);
    await connection.db!.collection('appointments').deleteMany({});
    const past = legacy({
      startsAt: new Date('2020-01-01T01:00Z'),
      endsAt: new Date('2020-01-01T01:30Z'),
    });
    await connection.db!.collection('appointments').insertOne(past);
    await expect(
      migration.apply(
        parseBookingResolutions([
          {
            appointmentId: String(past._id),
            specialty: 'CARDIOLOGIST',
            status: 'CONFIRMED',
            evidenceRef: 'fixture-invalid-confirmation',
          },
        ]),
      ),
    ).rejects.toThrow('unresolved');
    expect(
      await connection
        .db!.collection('appointments')
        .findOne({ _id: past._id }),
    ).toEqual(past);
  });

  it('rejects incomplete doctor specialty and clinic timezone records instead of using implicit defaults', async () => {
    await connection
      .db!.collection('members')
      .updateOne({ _id: doctor }, { $unset: { doctorSpecializations: '' } });
    await rest().expect(400);
    await connection
      .db!.collection('members')
      .updateOne(
        { _id: doctor },
        { $set: { doctorSpecializations: ['CARDIOLOGIST'] } },
      );
    await connection
      .db!.collection('members')
      .updateOne({ _id: clinic }, { $unset: { clinicTimezone: '' } });
    await rest().expect(400);
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(0);
  });

  it('rolls back all metadata, statuses and audit writes if ledger migration fails', async () => {
    const row = legacy();
    await seed(row);
    const ledgerModel = connection.model('BookingCommitment');
    jest
      .spyOn(ledgerModel, 'create')
      .mockRejectedValueOnce(new Error('injected migration failure'));
    await expect(
      migration.apply(
        parseBookingResolutions([
          {
            appointmentId: String(row._id),
            specialty: 'CARDIOLOGIST',
            status: 'CONFIRMED',
            evidenceRef: 'fixture-review-failure',
          },
        ]),
      ),
    ).rejects.toThrow('injected migration failure');
    expect(
      await connection.db!.collection('appointments').findOne({ _id: row._id }),
    ).toEqual(row);
    expect(
      await connection.db!.collection('booking_policy').countDocuments(),
    ).toBe(0);
    expect(
      await connection
        .db!.collection('booking_migration_audit')
        .countDocuments(),
    ).toBe(0);
  });

  it('runs the compiled CLI dry-run against only the disposable database with a private report', async () => {
    const row = legacy();
    await seed(row);
    const directory = await mkdtemp(join(tmpdir(), 'booking-report-'));
    try {
      const report = join(directory, 'report.json');
      const output = execFileSync(
        process.execPath,
        ['dist/tools/booking-migration.js', '--dry-run', '--report', report],
        {
          cwd: process.cwd(),
          env: { ...process.env, BOOKING_POLICY_V2_ENABLED: 'false' },
          encoding: 'utf8',
        },
      );
      expect(JSON.parse(output)).toMatchObject({
        readyToApply: false,
        total: 1,
      });
      expect(output).not.toContain(String(row._id));
      expect(JSON.parse(await readFile(report, 'utf8')).issues).toContainEqual({
        appointmentId: String(row._id),
        code: 'PENDING_REQUIRES_RESOLUTION',
      });
      expect((await stat(report)).mode & 0o777).toBe(0o600);
      expect(
        await connection
          .db!.collection('appointments')
          .findOne({ _id: row._id }),
      ).toEqual(row);
      const emptyName = `${dbName}_empty`;
      const emptyDatabase = connection.getClient().db(emptyName);
      const emptyUri = process.env.BOOKING_TEST_URI!.replace(
        '/?',
        `/${emptyName}?`,
      );
      const emptyResult = execFileSync(
        process.execPath,
        ['dist/tools/booking-migration.js', '--dry-run'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MONGO_URI: emptyUri,
            BOOKING_POLICY_V2_ENABLED: 'false',
          },
          encoding: 'utf8',
        },
      );
      expect(JSON.parse(emptyResult).total).toBe(0);
      expect(await emptyDatabase.listCollections().toArray()).toEqual([]);
      const commandEnv = {
        ...process.env,
        MONGO_URI: emptyUri,
        BOOKING_POLICY_V2_ENABLED: 'false',
      };
      expect(() =>
        execFileSync(
          process.execPath,
          ['dist/tools/booking-migration.js', '--apply'],
          {
            cwd: process.cwd(),
            env: commandEnv,
            timeout: 10_000,
            stdio: 'pipe',
          },
        ),
      ).toThrow();
      expect(await emptyDatabase.listCollections().toArray()).toEqual([]);
      const applied = execFileSync(
        process.execPath,
        ['dist/tools/booking-migration.js', '--apply', '--writers-stopped'],
        {
          cwd: process.cwd(),
          env: commandEnv,
          timeout: 10_000,
          encoding: 'utf8',
        },
      );
      expect(JSON.parse(applied)).toMatchObject({
        readyToApply: true,
        total: 0,
        ledgerMatches: true,
      });
      expect(
        await emptyDatabase.collection('booking_policy').countDocuments(),
      ).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const clinicGraphql = async (
    query: string,
    variables: Record<string, unknown>,
    owner = clinic,
  ) => {
    const bearer = await app
      .get(JwtService)
      .signAsync({ sub: String(owner), tokenType: 'access', authVersion: 0 });
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ query, variables });
  };
  const weeklyMutation =
    'mutation($input: DoctorWeeklyHoursInput!) { setDoctorWeeklyHours(input: $input) }';
  const overrideMutation =
    'mutation($input: DoctorDateOverridesInput!) { setDoctorDateOverrides(input: $input) }';
  const day = start.toISOString().slice(0, 10);
  const weekday = start.getUTCDay();
  const slots = (changes = {}) =>
    request(app.getHttpServer())
      .post('/graphql')
      .send({
        query:
          'query($input: AvailableSlotsInput!) { getAvailableSlots(input: $input) { doctorId clinicId specialty clinicTimezone startsAt endsAt state waitlistEligible canJoinWaitlist } }',
        variables: {
          input: {
            doctorId: String(doctor),
            clinicId: String(clinic),
            specialty: 'CARDIOLOGIST',
            fromDate: day,
            toDate: day,
            ...changes,
          },
        },
      });
  const setWeekly = (
    intervals: unknown[],
    doctorId = String(doctor),
    owner = clinic,
  ) => clinicGraphql(weeklyMutation, { input: { doctorId, intervals } }, owner);
  const setOverrides = (overrides: unknown[], date = day) =>
    clinicGraphql(overrideMutation, {
      input: { doctorId: String(doctor), date, overrides },
    });

  it('onboards a doctor and configures 14 split-shift slots entirely through APIs', async () => {
    const signup = await request(app.getHttpServer())
      .post('/member/signup')
      .send({
        memberEmail: 'schedule-doctor@example.test',
        memberPassword: 'test-password-123',
        memberPhone: '+821011112222',
        memberNick: 'Schedule Doctor',
        memberType: 'DOCTOR',
        clinicId: String(clinic),
        doctorSpecializations: ['CARDIOLOGIST'],
        professionalLicenseNumber: 'fixture-schedule-license',
      })
      .expect(201);
    const doctorId = signup.body.member._id;
    const roster = await clinicGraphql(
      'query { myClinicDoctors { _id doctorClinicStatus } }',
      {},
    );
    expect(roster.body.data.myClinicDoctors).toContainEqual({
      _id: doctorId,
      doctorClinicStatus: 'PENDING',
    });
    const review = await clinicGraphql(
      'mutation($id: ID!) { reviewDoctorAffiliation(doctorId: $id, approve: true) }',
      { id: doctorId },
    );
    expect(review.body.data.reviewDoctorAffiliation).toBe('APPROVED');
    const configured = await setWeekly(
      [
        { weekday, startMinute: 540, endMinute: 720 },
        { weekday, startMinute: 780, endMinute: 1020 },
      ],
      doctorId,
    );
    expect(configured.body.errors).toBeUndefined();
    const response = await slots({ doctorId });
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.getAvailableSlots).toHaveLength(14);
    expect(
      response.body.data.getAvailableSlots.every(
        (row: { state: string }) => row.state === 'AVAILABLE',
      ),
    ).toBe(true);
    expect(
      response.body.data.getAvailableSlots.some(
        (row: { startsAt: string }) => row.startsAt === at(120).toISOString(),
      ),
    ).toBe(false); // noon break
    await rest({ doctorId }).expect(201);
  });

  it('enforces clinic ownership and does not revoke approved affiliations through review', async () => {
    const foreign = await setWeekly([], String(doctor), clinic2);
    expect(foreign.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    const user = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: weeklyMutation,
        variables: { input: { doctorId: String(doctor), intervals: [] } },
      });
    expect(user.body.errors[0].extensions.code).toBe('FORBIDDEN');
    const anonymous = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: weeklyMutation,
        variables: { input: { doctorId: String(doctor), intervals: [] } },
      });
    expect(anonymous.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const rejectApproved = await clinicGraphql(
      'mutation($id: ID!) { reviewDoctorAffiliation(doctorId: $id, approve: false) }',
      { id: String(doctor) },
    );
    expect(rejectApproved.body.errors[0].extensions.code).toBe('CONFLICT');
    const foreignReview = await clinicGraphql(
      'mutation($id: ID!) { reviewDoctorAffiliation(doctorId: $id, approve: true) }',
      { id: String(doctor) },
      clinic2,
    );
    expect(foreignReview.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it.each([
    [{ weekday: 7, startMinute: 540, endMinute: 720 }],
    [{ weekday, startMinute: 545, endMinute: 720 }],
    [{ weekday, startMinute: 720, endMinute: 540 }],
    [
      { weekday, startMinute: 540, endMinute: 720 },
      { weekday, startMinute: 600, endMinute: 780 },
    ],
  ])(
    'rejects invalid or overlapping weekly intervals %j',
    async (...intervals) => {
      expect((await setWeekly(intervals)).body.errors[0].extensions.code).toBe(
        'BAD_USER_INPUT',
      );
      expect((await slots()).body.data.getAvailableSlots).toHaveLength(18);
    },
  );

  it('applies custom hours, full-day closure and clearing consistently with booking', async () => {
    expect(
      (
        await setOverrides([
          { type: 'CUSTOM_HOURS', startMinute: 780, endMinute: 840 },
        ])
      ).body.errors,
    ).toBeUndefined();
    expect((await slots()).body.data.getAvailableSlots).toHaveLength(2);
    await rest().expect(409);
    expect(
      (await setOverrides([{ type: 'UNAVAILABLE' }])).body.errors,
    ).toBeUndefined();
    expect((await slots()).body.data.getAvailableSlots).toEqual([]);
    expect((await setOverrides([])).body.errors).toBeUndefined();
    expect((await slots()).body.data.getAvailableSlots).toHaveLength(18);
    await rest().expect(201);
  });

  it('applies partial blocks without changing another doctor and rejects incomplete overrides', async () => {
    const bad = await setOverrides([{ type: 'UNAVAILABLE', startMinute: 600 }]);
    expect(bad.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(
      (
        await setOverrides([
          { type: 'CUSTOM_HOURS', startMinute: 540, endMinute: 720 },
          { type: 'UNAVAILABLE', startMinute: 600, endMinute: 630 },
        ])
      ).body.errors,
    ).toBeUndefined();
    expect((await slots()).body.data.getAvailableSlots).toHaveLength(5);
    expect(
      (await slots({ doctorId: String(doctor2) })).body.data.getAvailableSlots,
    ).toHaveLength(18);
    await rest().expect(409);
  });

  it('returns occupied slots and allocation holds without patient identity', async () => {
    await rest().expect(201);
    const result = await slots();
    const row = result.body.data.getAvailableSlots.find(
      (item: { startsAt: string }) => item.startsAt === start.toISOString(),
    );
    expect(row).toMatchObject({
      state: 'OCCUPIED',
      waitlistEligible: true,
      canJoinWaitlist: false,
    });
    expect(JSON.stringify(result.body)).not.toContain(String(patient));
    await app.get(BookingCoordinationService).run(
      {
        doctorIds: [doctor],
        patientIds: [],
        slots: [{ doctorId: doctor, startsAt: start }],
      },
      (tx) => tx.holdSlot({ doctorId: doctor, startsAt: start }),
    );
    const held = (await slots()).body.data.getAvailableSlots.find(
      (item: { startsAt: string }) => item.startsAt === start.toISOString(),
    );
    expect(held).toMatchObject({
      state: 'UNAVAILABLE',
      waitlistEligible: false,
    });
  });

  it('preserves booked times and active waitlist targets when editing schedules', async () => {
    await rest().expect(201);
    const narrowing = await setWeekly([
      { weekday, startMinute: 780, endMinute: 1020 },
    ]);
    expect(narrowing.body.errors[0].extensions.code).toBe('CONFLICT');
    expect(
      (await setOverrides([{ type: 'UNAVAILABLE' }])).body.errors[0].extensions
        .code,
    ).toBe('CONFLICT');
    expect((await slots()).body.data.getAvailableSlots).toHaveLength(18);
    const waitingStart = at(24 * 60);
    await connection.db!.collection('booking_commitments').insertOne({
      kind: 'WAITLIST',
      commitmentId: id(),
      patientId: patient2,
      doctorId: doctor,
      clinicId: clinic,
      specialty: 'CARDIOLOGIST',
      status: 'ACTIVE',
      version: randomUUID(),
      startsAt: waitingStart,
      endsAt: at(24 * 60 + 30),
    });
    const closingQueue = await setOverrides(
      [{ type: 'UNAVAILABLE' }],
      waitingStart.toISOString().slice(0, 10),
    );
    expect(closingQueue.body.errors[0].extensions.code).toBe('CONFLICT');
    expect(
      (await connection
        .db!.collection('appointments')
        .findOne({ patientId: patient }))!.status,
    ).toBe('CONFIRMED');
  });

  it('serializes closing working hours against a concurrent patient booking', async () => {
    const [editing, booking] = await Promise.all([setWeekly([]), rest()]);
    expect(Boolean(editing.body.errors) || booking.status === 409).toBe(true);
    if (booking.status === 201)
      expect(editing.body.errors[0].extensions.code).toBe('CONFLICT');
    else {
      expect(booking.status).toBe(409);
      expect(editing.body.errors).toBeUndefined();
    }
  });

  it('bounds calendar queries and respects quarter-hour clinic offsets', async () => {
    for (const changes of [
      { fromDate: '2035-02-30', toDate: '2035-03-01' },
      { toDate: '2035-02-01' },
    ])
      expect((await slots(changes)).body.errors[0].extensions.code).toBe(
        'BAD_USER_INPUT',
      );
    await connection
      .db!.collection('members')
      .updateOne(
        { _id: clinic },
        { $set: { clinicTimezone: 'Asia/Kathmandu' } },
      );
    const rows = (await slots()).body.data.getAvailableSlots;
    expect(rows).toHaveLength(18);
    expect(
      rows.every(
        (row: { startsAt: string }) =>
          new Date(row.startsAt).getUTCMinutes() % 30 === 15,
      ),
    ).toBe(true);
  });

  const slotGate = () =>
    connection
      .db!.collection<{
        _id: string;
        generation: number;
        allocationPending: boolean;
      }>('booking_gates')
      .findOne({ _id: `slot:${doctor}:${+start}` });
  const cancelQuery =
    'mutation($id: ID!) { cancelAppointment(id: $id) { _id status version canceledAt canceledBy lastChangedBy source } }';
  const outcomeQuery =
    'mutation($id: ID!, $outcome: AppointmentOutcome!) { setAppointmentOutcome(id: $id, outcome: $outcome) { _id status version lastChangedBy } }';
  const staffQuery =
    'mutation($input: ClinicAppointmentInput!) { createClinicAppointment(input: $input) { _id clinicId patientId source status lastChangedBy } }';
  const cancel = (appointmentId: string, bearer = token) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ query: cancelQuery, variables: { id: appointmentId } });
  const staff = (changes = {}, owner = clinic) => {
    const { clinicId: _clinicId, ...booking } = input;
    return clinicGraphql(
      staffQuery,
      {
        input: {
          ...booking,
          patientId: String(patient),
          source: 'PHONE',
          ...changes,
        },
      },
      owner,
    );
  };
  const queueFor = async (startsAt = start) =>
    connection.db!.collection('booking_commitments').insertOne({
      kind: 'WAITLIST',
      commitmentId: id(),
      patientId: patient2,
      doctorId: doctor,
      clinicId: clinic,
      specialty: 'CARDIOLOGIST',
      status: 'ACTIVE',
      version: randomUUID(),
      startsAt,
      endsAt: new Date(+startsAt + 30 * 60_000),
    });

  it('cancels once, atomically releases the commitment and invalidates old opening generations on rebooking', async () => {
    const original = (await rest().expect(201)).body;
    const results = await Promise.all([
      cancel(original._id),
      cancel(original._id),
    ]);
    expect(results.every((result) => result.body.errors === undefined)).toBe(
      true,
    );
    expect(results[0].body.data.cancelAppointment.version).toBe(
      results[1].body.data.cancelAppointment.version,
    );
    expect(results[0].body.data.cancelAppointment).toMatchObject({
      status: 'CANCELED',
      canceledBy: String(patient),
      lastChangedBy: String(patient),
    });
    expect(results[0].body.data.cancelAppointment.version).not.toBe(
      original.version,
    );
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(0);
    const events = await connection
      .db!.collection('appointment_events')
      .find({})
      .toArray();
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.state === 'PENDING')).toBe(true);
    const released = events.find((event) => event.type === 'SLOT_RELEASED')!;
    expect(released.releaseMode).toBe('MANUAL');
    await rest().expect(201);
    const gate = await slotGate();
    expect(gate!.generation).toBeGreaterThan(released.slotGeneration);
    expect(
      (await cancel(original._id)).body.data.cancelAppointment.status,
    ).toBe('CANCELED');
    expect((await slotGate())!.generation).toBe(gate!.generation);
    expect(
      await connection
        .db!.collection('appointments')
        .countDocuments({ status: 'CONFIRMED' }),
    ).toBe(1);
    expect(
      await connection.db!.collection('appointment_events').countDocuments(),
    ).toBe(2);
  });

  it('restricts cancellation to the patient and owning clinic and keeps it usable while new bookings are paused', async () => {
    const original = (await rest().expect(201)).body;
    expect(
      (await cancel(original._id, token2)).body.errors[0].extensions.code,
    ).toBe('NOT_FOUND');
    expect(
      (await clinicGraphql(cancelQuery, { id: original._id }, clinic2)).body
        .errors[0].extensions.code,
    ).toBe('NOT_FOUND');
    const doctorToken = await app
      .get(JwtService)
      .signAsync({ sub: String(doctor), tokenType: 'access', authVersion: 0 });
    expect(
      (await cancel(original._id, doctorToken)).body.errors[0].extensions.code,
    ).toBe('FORBIDDEN');
    process.env.BOOKING_POLICY_V2_ENABLED = 'false';
    expect(
      (await clinicGraphql(cancelQuery, { id: original._id })).body.data
        .cancelAppointment,
    ).toMatchObject({ status: 'CANCELED', canceledBy: String(clinic) });
    expect((await staff()).body.errors[0].extensions.booking.reason).toBe(
      'FEATURE_DISABLED',
    );
    expect(
      (await cancel(original._id)).body.data.cancelAppointment.canceledBy,
    ).toBe(String(clinic));
  });

  it.each(['PHONE', 'WALK_IN'])(
    'creates an own-clinic %s booking for an existing patient under the same rules',
    async (source) => {
      const result = await staff({ source });
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.createClinicAppointment).toMatchObject({
        clinicId: String(clinic),
        patientId: String(patient),
        lastChangedBy: String(clinic),
        source,
        status: 'CONFIRMED',
      });
      const conflict = await staff({
        doctorId: String(doctor2),
        startsAt: at(30).toISOString(),
      });
      expect(conflict.body.errors[0].extensions.booking).toEqual({
        reason: 'COMMITMENT_CONFLICT',
        existingCommitments: [],
        choices: [],
      });
    },
  );

  it('rejects foreign doctors, injected clinic/source fields and non-patient or unavailable accounts in staff booking', async () => {
    for (const changes of [
      { clinicId: String(clinic2) },
      { source: 'ONLINE' },
      { doctorId: String(doctor3) },
      { patientId: String(clinic) },
      { patientId: String(doctor) },
      { patientId: String(id()) },
    ])
      expect((await staff(changes)).body.errors).toBeDefined();
    await connection
      .db!.collection('members')
      .updateOne({ _id: patient }, { $set: { memberStatus: 'SUSPENDED' } });
    expect((await staff()).body.errors[0].extensions.code).toBe(
      'BAD_USER_INPUT',
    );
    expect(
      await connection.db!.collection('appointments').countDocuments(),
    ).toBe(0);
  });

  it('does not disclose another clinic commitment to staff when enforcing patient overlap', async () => {
    await rest({
      doctorId: String(doctor3),
      clinicId: String(clinic2),
      specialty: 'DENTIST',
    }).expect(201);
    const result = await staff();
    expect(result.body.errors[0].extensions.booking).toEqual({
      reason: 'PATIENT_OVERLAP',
      existingCommitments: [],
      choices: [],
    });
    expect(JSON.stringify(result.body)).not.toContain(String(clinic2));
    expect(JSON.stringify(result.body)).not.toContain(String(doctor3));
  });

  it.each([48 * 3600_000, 48 * 3600_000 - 1])(
    'holds queued cancellation releases only outside the 48h cutoff (%i ms)',
    async (remaining) => {
      const original = (await rest().expect(201)).body;
      await queueFor();
      freezeTime(+start - remaining);
      const result = await clinicGraphql(cancelQuery, { id: original._id });
      expect(result.body.errors).toBeUndefined();
      const event = await connection
        .db!.collection('appointment_events')
        .findOne({ type: 'SLOT_RELEASED' });
      expect(event!.releaseMode).toBe(
        remaining >= 48 * 3600_000 ? 'QUEUE' : 'MANUAL',
      );
      const gate = await slotGate();
      expect(gate!.allocationPending).toBe(remaining >= 48 * 3600_000);
      expect(event!.slotGeneration).toBe(gate!.generation);
      const replacement = await staff(); // Patient 1 is not in the queued entry.
      if (remaining >= 48 * 3600_000)
        expect(replacement.body.errors[0].extensions.code).toBe('CONFLICT');
      else
        expect(replacement.body.data.createClinicAppointment.status).toBe(
          'CONFIRMED',
        );
    },
  );

  it('records a closed cancellation release without reopening an unavailable slot', async () => {
    const original = (await rest().expect(201)).body;
    // Model an external closure; the normal schedule API protects existing visits.
    await connection.db!.collection('doctor_availability_overrides').insertOne({
      doctorId: doctor,
      clinicId: clinic,
      date: day,
      type: 'UNAVAILABLE',
    });
    expect((await cancel(original._id)).body.errors).toBeUndefined();
    expect(
      await connection
        .db!.collection('appointment_events')
        .findOne({ type: 'SLOT_RELEASED' }),
    ).toMatchObject({ releaseMode: 'UNAVAILABLE' });
    expect((await slots()).body.data.getAvailableSlots).toEqual([]);
    await rest().expect(409);
  });

  it('rolls cancellation, ledger release, gate generation and events back on an outbox failure', async () => {
    const original = (await rest().expect(201)).body;
    const oldGate = await slotGate();
    jest
      .spyOn(connection.model(APPOINTMENT_EVENT), 'create')
      .mockRejectedValueOnce(new Error('injected outbox failure'));
    expect((await cancel(original._id)).body.errors[0].extensions.code).toBe(
      'INTERNAL_SERVER_ERROR',
    );
    expect(
      await connection
        .db!.collection('appointments')
        .findOne({ _id: new Types.ObjectId(original._id) }),
    ).toMatchObject({ status: 'CONFIRMED', version: original.version });
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(1);
    expect(
      await connection.db!.collection('appointment_events').countDocuments(),
    ).toBe(0);
    expect((await slotGate())!.generation).toBe(oldGate!.generation);
  });

  it.each(['COMPLETED', 'NO_SHOW'])(
    'records clinic-only %s after the visit, releases its ledger, and repeats idempotently',
    async (outcome) => {
      const version = randomUUID();
      const row = legacy({
        startsAt: new Date('2020-01-01T01:00Z'),
        endsAt: new Date('2020-01-01T01:30Z'),
        status: 'CONFIRMED',
        specialty: 'CARDIOLOGIST',
        source: 'ONLINE',
        version,
      });
      await connection.db!.collection('appointments').insertOne(row);
      await connection.db!.collection('booking_commitments').insertOne({
        kind: 'APPOINTMENT',
        commitmentId: row._id,
        patientId: patient,
        doctorId: doctor,
        clinicId: clinic,
        specialty: 'CARDIOLOGIST',
        status: 'CONFIRMED',
        version,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      });
      const result = await clinicGraphql(outcomeQuery, {
        id: String(row._id),
        outcome,
      });
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.setAppointmentOutcome).toMatchObject({
        status: outcome,
        lastChangedBy: String(clinic),
      });
      expect(
        (await clinicGraphql(outcomeQuery, { id: String(row._id), outcome }))
          .body.data.setAppointmentOutcome.version,
      ).toBe(result.body.data.setAppointmentOutcome.version);
      expect(
        await connection.db!.collection('booking_commitments').countDocuments(),
      ).toBe(0);
      expect(
        await connection.db!.collection('appointment_events').countDocuments(),
      ).toBe(1);
      const flip = await clinicGraphql(outcomeQuery, {
        id: String(row._id),
        outcome: outcome === 'COMPLETED' ? 'NO_SHOW' : 'COMPLETED',
      });
      expect(flip.body.errors[0].extensions.code).toBe('CONFLICT');
    },
  );

  it('enforces start/end time boundaries and outcome ownership', async () => {
    const original = (await rest().expect(201)).body;
    expect(
      (
        await clinicGraphql(outcomeQuery, {
          id: original._id,
          outcome: 'COMPLETED',
        })
      ).body.errors[0].extensions.code,
    ).toBe('CONFLICT');
    expect(
      (
        await clinicGraphql(
          outcomeQuery,
          { id: original._id, outcome: 'COMPLETED' },
          clinic2,
        )
      ).body.errors[0].extensions.code,
    ).toBe('NOT_FOUND');
    const userOutcome = await request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${token}`)
      .send({
        query: outcomeQuery,
        variables: { id: original._id, outcome: 'COMPLETED' },
      });
    expect(userOutcome.body.errors[0].extensions.code).toBe('FORBIDDEN');
    freezeTime(+start);
    expect(
      (await clinicGraphql(cancelQuery, { id: original._id })).body.errors[0]
        .extensions.code,
    ).toBe('CONFLICT');
    freezeTime(+at(30));
    expect(
      (
        await clinicGraphql(outcomeQuery, {
          id: original._id,
          outcome: 'COMPLETED',
        })
      ).body.data.setAppointmentOutcome.status,
    ).toBe('COMPLETED');
  });

  describe('Authorized calendar snapshots and polling', () => {
    const window = {
      from: at(-30).toISOString(),
      to: at(3 * 1440).toISOString(),
    };
    const calendarQuery =
      'query($input:CalendarInput!){myCalendar(input:$input){revision nextCursor clinicTimezone entries{_id patientId doctorId clinicId clinicTimezone startsAt endsAt status source version}}}';
    const updatesQuery =
      'query($input:CalendarUpdatesInput!){calendarUpdates(input:$input){revision changed pollAfterSeconds}}';
    const calendar = (changes = {}, owner = clinic) =>
      clinicGraphql(calendarQuery, { input: { ...window, ...changes } }, owner);
    const updates = (changes = {}, owner = clinic) =>
      clinicGraphql(updatesQuery, { input: { ...window, ...changes } }, owner);
    const historical = (changes: Record<string, unknown> = {}) =>
      legacy({
        status: 'CANCELED',
        createdAt: at(-1440),
        updatedAt: at(-1440),
        ...changes,
      });

    it('shows online, phone and walk-in bookings only to their own clinic and assigned doctor', async () => {
      const online = (await rest()).body;
      const foreign = await rest(
        {
          doctorId: String(doctor3),
          clinicId: String(clinic2),
          specialty: DoctorSpecialization.DENTIST,
        },
        token2,
      );
      expect(foreign.status).toBe(201);
      expect(
        (
          await staff({
            doctorId: String(doctor2),
            specialty: 'DENTIST',
            startsAt: at(60).toISOString(),
          })
        ).body.errors,
      ).toBeUndefined();
      expect(
        (
          await staff({
            doctorId: String(doctor2),
            patientId: String(patient2),
            source: 'WALK_IN',
            startsAt: at(120).toISOString(),
          })
        ).body.errors,
      ).toBeUndefined();
      const clinicPage = await calendar();
      expect(clinicPage.body.errors).toBeUndefined();
      expect(clinicPage.headers['cache-control']).toBe('no-store');
      const page = clinicPage.body.data.myCalendar;
      expect(page.clinicTimezone).toBe('Asia/Seoul');
      expect(
        page.entries.map((row: { source: string }) => row.source).sort(),
      ).toEqual(['ONLINE', 'PHONE', 'WALK_IN']);
      expect(
        page.entries.every(
          (row: { clinicId: string; clinicTimezone: string }) =>
            row.clinicId === String(clinic) &&
            row.clinicTimezone === 'Asia/Seoul',
        ),
      ).toBe(true);
      const doctorPage = (await calendar({}, doctor)).body.data.myCalendar;
      expect(doctorPage.entries.map((row: { _id: string }) => row._id)).toEqual(
        [online._id],
      );
      expect(
        (await calendar({}, clinic2)).body.data.myCalendar.entries.map(
          (row: { _id: string }) => row._id,
        ),
      ).toEqual([foreign.body._id]);
      expect(
        (await calendar({ doctorId: String(doctor3) })).body.data.myCalendar
          .entries,
      ).toHaveLength(0);
      expect(
        (await calendar({ doctorId: String(doctor2) }, doctor)).body.errors[0]
          .extensions.code,
      ).toBe('FORBIDDEN');
    });

    it('revisions reveal changes only within the authorized doctor/clinic window', async () => {
      const initial = (await updates({}, doctor)).body.data.calendarUpdates;
      expect(initial).toMatchObject({ changed: true, pollAfterSeconds: 5 });
      expect(initial.revision).toMatch(/^[a-f\d]{64}$/);
      await rest({ doctorId: String(doctor2) });
      expect(
        (await updates({ knownRevision: initial.revision }, doctor)).body.data
          .calendarUpdates.changed,
      ).toBe(false);
      const clinicBefore = (await updates()).body.data.calendarUpdates;
      expect(
        (await updates({ knownRevision: clinicBefore.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(false);
      await rest(
        {
          doctorId: String(doctor3),
          clinicId: String(clinic2),
          specialty: DoctorSpecialization.DENTIST,
        },
        token2,
      );
      expect(
        (await updates({ knownRevision: clinicBefore.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(false);
      await rest({ startsAt: at(1440).toISOString() });
      expect(
        (await updates({ knownRevision: clinicBefore.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(true);
    });

    it('reconnects from committed state after cancellation and rejects stale pagination revisions', async () => {
      const first = (await rest()).body;
      await rest({ startsAt: at(1440).toISOString() });
      const page = (await calendar({ limit: 1 })).body.data.myCalendar;
      expect(page.nextCursor).toBe(first._id);
      await cancel(first._id);
      expect(
        (await updates({ knownRevision: page.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(true);
      expect(
        (
          await calendar({
            after: page.nextCursor,
            revision: page.revision,
            limit: 1,
          })
        ).body.errors[0].extensions.code,
      ).toBe('CONFLICT');
      const fresh = (await calendar()).body.data.myCalendar;
      expect(
        fresh.entries.find((row: { _id: string }) => row._id === first._id)
          .status,
      ).toBe('CANCELED');
      expect(
        new Set(fresh.entries.map((row: { _id: string }) => row._id)).size,
      ).toBe(2);
      expect(
        (await updates({ knownRevision: fresh.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(false);
    });

    it('paginates tied starts and requires an unchanged authorized window for every page', async () => {
      const first = new Types.ObjectId('100000000000000000000001'),
        second = new Types.ObjectId('100000000000000000000002'),
        third = new Types.ObjectId('100000000000000000000003');
      const foreign = historical({
        doctorId: doctor3,
        clinicId: clinic2,
        patientId: patient2,
      });
      await connection
        .db!.collection('appointments')
        .insertMany([
          historical({ _id: third }),
          historical({ _id: first }),
          historical({ _id: second }),
          foreign,
        ]);
      const page = (await calendar({ limit: 1 })).body.data.myCalendar;
      expect(page.entries[0]._id).toBe(String(first));
      const next = (
        await calendar({
          limit: 1,
          after: page.nextCursor,
          revision: page.revision,
        })
      ).body.data.myCalendar;
      expect(next.entries[0]._id).toBe(String(second));
      const final = (
        await calendar({
          limit: 1,
          after: next.nextCursor,
          revision: next.revision,
        })
      ).body.data.myCalendar;
      expect(final.entries[0]._id).toBe(String(third));
      expect(final.nextCursor).toBeNull();
      expect(
        (
          await calendar({
            after: String(foreign._id),
            revision: page.revision,
          })
        ).body.errors[0].extensions.code,
      ).toBe('BAD_USER_INPUT');
      expect(
        (await calendar({ doctorId: String(doctor), revision: page.revision }))
          .body.errors[0].extensions.code,
      ).toBe('CONFLICT');
    });

    it('includes overlapping visits, excludes adjoining boundaries, and normalizes UTC offsets', async () => {
      await rest();
      expect(
        (
          await calendar({
            from: at(15).toISOString(),
            to: at(45).toISOString(),
          })
        ).body.data.myCalendar.entries,
      ).toHaveLength(1);
      expect(
        (
          await calendar({
            from: at(30).toISOString(),
            to: at(60).toISOString(),
          })
        ).body.data.myCalendar.entries,
      ).toHaveLength(0);
      expect(
        (
          await calendar({
            from: at(-30).toISOString(),
            to: start.toISOString(),
          })
        ).body.data.myCalendar.entries,
      ).toHaveLength(0);
      const utc = (
        await calendar({ from: start.toISOString(), to: at(60).toISOString() })
      ).body.data.myCalendar;
      const offset = (
        await calendar({
          from: '2035-01-01T10:00:00+09:00',
          to: '2035-01-01T11:00:00+09:00',
        })
      ).body.data.myCalendar;
      expect(offset.revision).toBe(utc.revision);
    });

    it('keeps history readable while booking is paused and excludes persistence-only data', async () => {
      await connection
        .db!.collection('appointments')
        .insertOne(
          historical({ internalOnly: 'private-provider-payload', __v: 7 }),
        );
      process.env.BOOKING_POLICY_V2_ENABLED = 'false';
      await connection.db!.collection('booking_policy').deleteMany({});
      const result = await calendar();
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.myCalendar.entries[0]).toMatchObject({
        source: 'LEGACY',
        version: null,
        status: 'CANCELED',
      });
      const raw = await app
        .get(AppointmentCalendarService)
        .calendar(
          { from: at(-30), to: at(60), limit: 100 },
          { _id: clinic, memberType: MemberType.CLINIC, authVersion: 0 },
        );
      expect(raw.entries[0]).not.toHaveProperty('internalOnly');
      expect(raw.entries[0]).not.toHaveProperty('__v');
      expect(JSON.stringify(result.body)).not.toContain(
        'private-provider-payload',
      );
    });

    it('invalidates when clinic display timezone changes, even on an empty calendar', async () => {
      const before = (await calendar()).body.data.myCalendar;
      await connection
        .db!.collection('members')
        .updateOne(
          { _id: clinic },
          { $set: { clinicTimezone: 'America/New_York' } },
        );
      const after = (await calendar()).body.data.myCalendar;
      expect(after.clinicTimezone).toBe('America/New_York');
      expect(after.revision).not.toBe(before.revision);
    });

    it('shows promoted bookings once, with their current appointment version', async () => {
      const original = (await rest({}, token2)).body;
      process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
      const joined = await clinicGraphql(
        'mutation($input:JoinWaitlistInput!){joinWaitlist(input:$input){_id}}',
        { input: { ...input, automaticBookingConsent: true } },
        patient,
      );
      expect(joined.body.errors).toBeUndefined();
      await cancel(original._id, token2);
      const before = (await updates()).body.data.calendarUpdates;
      jest
        .spyOn(app.get(AppointmentPromotionService), 'isEnabled')
        .mockReturnValue(true);
      await app.get(AppointmentPromotionService).runOnce();
      expect(
        (await updates({ knownRevision: before.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(true);
      const page = (await calendar({}, doctor)).body.data.myCalendar;
      const active = page.entries.filter(
        (row: { status: string }) => row.status === 'CONFIRMED',
      );
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        source: 'WAITLIST',
        patientId: String(patient),
      });
      expect(active[0].version).toMatch(/^[a-f\d-]{36}$/);
      expect(
        new Set(page.entries.map((row: { _id: string }) => row._id)).size,
      ).toBe(2);
    });

    it('never publishes a booking before its transaction commits', async () => {
      await app.get(WaitlistService).prepare();
      const before = (await calendar()).body.data.myCalendar;
      let enter!: () => void, resume!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const pending = app.get(BookingCoordinationService).run(
        {
          doctorIds: [doctor],
          patientIds: [patient],
          slots: [{ doctorId: doctor, startsAt: start }],
        },
        async (tx) => {
          const booked = await app
            .get(AppointmentService)
            .bookInTransaction(
              input,
              patient,
              { _id: patient, memberType: MemberType.USER, authVersion: 0 },
              AppointmentSource.ONLINE,
              tx,
            );
          enter();
          await resumed;
          return booked;
        },
      );
      await entered;
      try {
        const during = (await calendar()).body.data.myCalendar;
        expect(during.entries).toHaveLength(0);
        expect(during.revision).toBe(before.revision);
      } finally {
        resume();
      }
      const committed = await pending;
      const after = (await calendar()).body.data.myCalendar;
      expect(after.entries[0]._id).toBe(String(committed._id));
      expect(after.revision).not.toBe(before.revision);
    });

    it('reads replacement atomically rather than publishing a half-cancelled calendar', async () => {
      const original = (await rest()).body;
      const appointments = app.get(AppointmentService);
      const book = appointments.bookInTransaction.bind(appointments);
      let enter!: () => void, resume!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const resumed = new Promise<void>((resolve) => {
        resume = resolve;
      });
      jest
        .spyOn(appointments, 'bookInTransaction')
        .mockImplementationOnce(async (...args) => {
          enter();
          await resumed;
          return book(...args);
        });
      const pending = clinicGraphql(
        'mutation($input:ReplaceCommitmentInput!){replaceCommitment(input:$input){appointment{_id}}}',
        {
          input: {
            originalKind: 'APPOINTMENT',
            originalId: original._id,
            originalVersion: original.version,
            destinationKind: 'APPOINTMENT',
            destination: {
              ...input,
              doctorId: String(doctor2),
              startsAt: at(60).toISOString(),
            },
          },
        },
        patient,
      );
      process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
      process.env.COMMITMENT_REPLACEMENT_ENABLED = 'true';
      // Start the Supertest request before waiting at the in-transaction barrier.
      const result = pending.then((response) => response);
      await entered;
      try {
        expect((await calendar()).body.data.myCalendar.entries).toMatchObject([
          { _id: original._id, status: 'CONFIRMED' },
        ]);
      } finally {
        resume();
      }
      expect((await result).body.errors).toBeUndefined();
      const after = (await calendar()).body.data.myCalendar.entries;
      expect(after.map((row: { status: string }) => row.status).sort()).toEqual(
        ['CANCELED', 'CONFIRMED'],
      );
    });

    it('updates outcomes and rechecks token/account state for every poll', async () => {
      const booked = (await rest()).body;
      const before = (await updates()).body.data.calendarUpdates;
      freezeTime(+at(30));
      await clinicGraphql(outcomeQuery, {
        id: booked._id,
        outcome: 'COMPLETED',
      });
      const result = (await updates({ knownRevision: before.revision })).body
        .data.calendarUpdates;
      expect(result.changed).toBe(true);
      expect((await calendar()).body.data.myCalendar.entries[0].status).toBe(
        'COMPLETED',
      );
      const bearer = await app.get(JwtService).signAsync({
        sub: String(clinic),
        tokenType: 'access',
        authVersion: 0,
      });
      await connection
        .db!.collection('members')
        .updateOne({ _id: clinic }, { $set: { authVersion: 1 } });
      const revoked = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ query: updatesQuery, variables: { input: window } });
      expect(revoked.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('requires current staff/doctor authentication and does not grant patients or admins calendar access', async () => {
      const anonymous = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: calendarQuery, variables: { input: window } });
      expect(anonymous.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
      expect((await calendar({}, patient)).body.errors[0].extensions.code).toBe(
        'FORBIDDEN',
      );
      const admin = id();
      await connection.db!.collection('members').insertOne({
        _id: admin,
        memberType: 'ADMIN',
        memberStatus: 'ACTIVE',
        authVersion: 0,
      });
      expect((await calendar({}, admin)).body.errors[0].extensions.code).toBe(
        'FORBIDDEN',
      );
      await connection
        .db!.collection('members')
        .updateOne({ _id: doctor }, { $set: { memberStatus: 'SUSPENDED' } });
      expect((await updates({}, doctor)).body.errors[0].extensions.code).toBe(
        'UNAUTHENTICATED',
      );
    });

    it.each([
      { from: start.toISOString(), to: start.toISOString() },
      { from: start.toISOString(), to: at(32 * 1440).toISOString() },
      { from: 'invalid' },
      { doctorId: 'invalid' },
      { limit: 0 },
      { limit: 101 },
      { after: String(doctor) },
      { revision: 'invalid' },
      { clinicId: String(clinic2) },
    ])('rejects invalid or unscoped calendar input %j', async (changes) => {
      expect((await calendar(changes)).body.errors).toBeDefined();
    });

    it('reads multiple MongoDB cursor batches and changes on a later calendar page', async () => {
      await connection
        .db!.collection('appointments')
        .insertMany(Array.from({ length: 150 }, () => historical()));
      const first = (await calendar()).body.data.myCalendar;
      expect(first.entries).toHaveLength(100);
      const next = (
        await calendar({ after: first.nextCursor, revision: first.revision })
      ).body.data.myCalendar;
      expect(next.entries).toHaveLength(50);
      expect(next.nextCursor).toBeNull();
      expect(next.revision).toBe(first.revision);
      await connection
        .db!.collection('appointments')
        .updateOne(
          { _id: new Types.ObjectId(next.entries[49]._id) },
          { $set: { version: randomUUID() } },
        );
      expect(
        (await updates({ knownRevision: first.revision })).body.data
          .calendarUpdates.changed,
      ).toBe(true);
    });

    it('fails explicitly instead of silently truncating an oversized calendar window', async () => {
      await connection
        .db!.collection('appointments')
        .insertMany(Array.from({ length: 5001 }, () => historical()));
      const result = await calendar();
      expect(result.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(result.body.errors[0].message).toContain('narrow');
    });
  });

  describe('Patient appointment list', () => {
    const listQuery =
      'query($input: MyAppointmentsInput!) { myAppointments(input: $input) { entries { _id patientId doctorId clinicId specialty source version status startsAt endsAt durationMinutes createdAt updatedAt } nextCursor } }';
    const list = (input = {}, bearer = token) =>
      request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ query: listQuery, variables: { input } });
    const history = (changes: Record<string, unknown> = {}) =>
      legacy({
        status: 'CANCELED',
        createdAt: at(-1440),
        updatedAt: at(-1440),
        ...changes,
      });

    it('returns an empty page by default with no shared caching', async () => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${token}`)
        .send({ query: '{ myAppointments { entries { _id } nextCursor } }' });
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.myAppointments).toEqual({
        entries: [],
        nextCursor: null,
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('paginates in appointment-time/ID order, including ties, with patient isolation', async () => {
      const first = new Types.ObjectId('100000000000000000000001'),
        second = new Types.ObjectId('100000000000000000000002'),
        third = new Types.ObjectId('100000000000000000000003');
      await connection
        .db!.collection('appointments')
        .insertMany([
          history({ _id: third, startsAt: at(60), endsAt: at(90) }),
          history({ _id: second }),
          history({ _id: first }),
          history({ patientId: patient2 }),
        ]);
      const ids: string[] = [];
      let after: string | null = null;
      for (let n = 0; n < 3; n++) {
        const result = (await list({ limit: 1, ...(after ? { after } : {}) }))
          .body;
        expect(result.errors).toBeUndefined();
        const page: {
          entries: Array<{ _id: string; patientId: string }>;
          nextCursor: string | null;
        } = result.data.myAppointments;
        ids.push(page.entries[0]._id);
        expect(page.entries[0].patientId).toBe(String(patient));
        after = page.nextCursor;
      }
      expect(ids).toEqual([String(first), String(second), String(third)]);
      expect(after).toBeNull();
      expect(
        (await list({ after: String(third) })).body.data.myAppointments,
      ).toEqual({ entries: [], nextCursor: null });
    });

    it('bounds page sizes at the default20 and maximum100', async () => {
      await connection
        .db!.collection('appointments')
        .insertMany(
          Array.from({ length: 101 }, (_, n) =>
            history({ startsAt: at(n * 30), endsAt: at(n * 30 + 30) }),
          ),
        );
      const standard = (await list()).body.data.myAppointments;
      const maximum = (await list({ limit: 100 })).body.data.myAppointments;
      expect(standard.entries).toHaveLength(20);
      expect(standard.nextCursor).toBe(standard.entries[19]._id);
      expect(maximum.entries).toHaveLength(100);
      expect(maximum.nextCursor).toBe(maximum.entries[99]._id);
    });

    it('filters status and UTC start ranges with inclusive from and exclusive to', async () => {
      const early = history(),
        middle = history({
          status: 'COMPLETED',
          startsAt: at(60),
          endsAt: at(90),
        }),
        late = history({ startsAt: at(120), endsAt: at(150) });
      await connection
        .db!.collection('appointments')
        .insertMany([late, middle, early]);
      const window = {
        from: '2035-01-01T10:00:00+09:00',
        to: '2035-01-01T12:00:00+09:00',
      };
      expect(
        (await list(window)).body.data.myAppointments.entries.map(
          (row: { _id: string }) => row._id,
        ),
      ).toEqual([String(early._id), String(middle._id)]);
      expect(
        (
          await list({ ...window, status: 'CANCELED' })
        ).body.data.myAppointments.entries.map(
          (row: { _id: string }) => row._id,
        ),
      ).toEqual([String(early._id)]);
      expect(
        (
          await list({ from: at(120).toISOString() })
        ).body.data.myAppointments.entries.map(
          (row: { _id: string }) => row._id,
        ),
      ).toEqual([String(late._id)]);
      expect(
        (await list({ to: start.toISOString() })).body.data.myAppointments
          .entries,
      ).toEqual([]);
    });

    it('reads historical legacy metadata while booking is paused, and keeps persistence-only fields private', async () => {
      await connection
        .db!.collection('appointments')
        .insertOne(history({ internalOnly: 'private-provider-data', __v: 17 }));
      process.env.BOOKING_POLICY_V2_ENABLED = 'false';
      await connection.db!.collection('booking_policy').deleteMany({});
      const response = await list({
        after: null,
        from: null,
        to: null,
        status: null,
      });
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data.myAppointments.entries[0]).toMatchObject({
        source: 'LEGACY',
        specialty: null,
        version: null,
        status: 'CANCELED',
      });
      const raw = await app
        .get(AppointmentService)
        .myAppointments(
          { limit: 20 },
          { _id: patient, memberType: MemberType.USER, authVersion: 0 },
        );
      expect(raw.entries[0]).not.toHaveProperty('internalOnly');
      expect(raw.entries[0]).not.toHaveProperty('__v');
      expect(JSON.stringify(response.body)).not.toContain(
        'private-provider-data',
      );
    });

    it('uses patient-scoped cursors and does not accept a target patient ID', async () => {
      const foreign = history({ patientId: patient2 });
      await connection.db!.collection('appointments').insertOne(foreign);
      const foreignCursor = await list({ after: String(foreign._id) });
      const missing = await list({ after: String(id()) });
      expect(foreignCursor.body.errors[0]).toEqual(missing.body.errors[0]);
      expect(foreignCursor.body.errors[0].extensions.code).toBe(
        'BAD_USER_INPUT',
      );
      expect(
        (await list({ patientId: String(patient2) })).body.errors,
      ).toBeDefined();
      expect(
        (await list({}, token2)).body.data.myAppointments.entries,
      ).toHaveLength(1);
      expect((await list()).body.data.myAppointments.entries).toHaveLength(0);
    });

    it('continues paging after the previous confirmed appointment is cancelled', async () => {
      const first = (await rest()).body;
      const second = (await rest({ startsAt: at(1440).toISOString() })).body;
      const page = (await list({ limit: 1, status: 'CONFIRMED' })).body.data
        .myAppointments;
      expect(page.nextCursor).toBe(first._id);
      await cancel(first._id);
      const next = (
        await list({ limit: 1, status: 'CONFIRMED', after: page.nextCursor })
      ).body.data.myAppointments;
      expect(next.entries.map((row: { _id: string }) => row._id)).toEqual([
        second._id,
      ]);
      expect(next.nextCursor).toBeNull();
    });

    it.each([
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { after: 'invalid' },
      { status: 'INVALID' },
      { from: 'not-a-date' },
      { from: start.toISOString(), to: start.toISOString() },
      { from: at(60).toISOString(), to: start.toISOString() },
    ])('rejects invalid pagination/filters %j', async (input) => {
      expect((await list(input)).body.errors).toBeDefined();
    });

    it.each([clinic, doctor])(
      'does not turn a staff or doctor session into a patient list (%s)',
      async (owner) => {
        const result = await clinicGraphql(listQuery, { input: {} }, owner);
        expect(result.body.errors[0].extensions.code).toBe('FORBIDDEN');
      },
    );

    it('rejects anonymous, inactive and revoked sessions', async () => {
      const anonymous = await request(app.getHttpServer())
        .post('/graphql')
        .send({ query: listQuery, variables: { input: {} } });
      expect(anonymous.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
      await connection
        .db!.collection('members')
        .updateOne({ _id: patient }, { $set: { memberStatus: 'SUSPENDED' } });
      expect((await list()).body.errors[0].extensions.code).toBe(
        'UNAUTHENTICATED',
      );
      await connection
        .db!.collection('members')
        .updateOne(
          { _id: patient },
          { $set: { memberStatus: 'ACTIVE', authVersion: 1 } },
        );
      expect((await list()).body.errors[0].extensions.code).toBe(
        'UNAUTHENTICATED',
      );
    });
  });

  describe('Waitlist enrollment and explicit replacements', () => {
    const entryFields =
      '_id patientId doctorId clinicId specialty startsAt endsAt status version automaticBookingConsent consentPolicyVersion queueSequence queuePosition automaticBookingEligible automaticBookingEnabled appointmentId';
    const api = (
      query: string,
      variables: Record<string, unknown> = {},
      bearer = token,
    ) =>
      request(app.getHttpServer())
        .post('/graphql')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ query, variables });
    const join = (changes = {}, bearer = token) =>
      api(
        `mutation($input: JoinWaitlistInput!) { joinWaitlist(input: $input) { ${entryFields} } }`,
        { input: { ...input, automaticBookingConsent: true, ...changes } },
        bearer,
      );
    const leave = (id: string, bearer = token) =>
      api(
        `mutation($id: ID!) { leaveWaitlist(id: $id) { ${entryFields} } }`,
        { id },
        bearer,
      );
    const replace = (
      originalKind: string,
      original: { _id: string; version: string },
      destinationKind: string,
      changes = {},
    ) =>
      api(
        `mutation($input: ReplaceCommitmentInput!) { replaceCommitment(input: $input) { kind appointment { _id status version doctorId startsAt } waitlist { ${entryFields} } } }`,
        {
          input: {
            originalKind,
            originalId: original._id,
            originalVersion: original.version,
            destinationKind,
            destination: {
              ...input,
              automaticBookingConsent: true,
              ...changes,
            },
          },
        },
      );
    const destination = {
      doctorId: String(doctor2),
      startsAt: at(60).toISOString(),
    };
    const originalRecord = (id: string, collection = 'appointments') =>
      connection
        .db!.collection(collection)
        .findOne({ _id: new Types.ObjectId(id) });
    const occupied = async (changes = {}) => {
      const result = await rest(changes, token2);
      expect(result.status).toBe(201);
      return result.body as { _id: string; version: string };
    };
    beforeEach(() => {
      process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
      process.env.COMMITMENT_REPLACEMENT_ENABLED = 'true';
    });

    it('joins an occupied exact slot, persists consent and FIFO, and validates startup queues', async () => {
      await occupied();
      const result = await join();
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.joinWaitlist).toMatchObject({
        patientId: String(patient),
        queueSequence: 1,
        queuePosition: 1,
        status: 'ACTIVE',
        automaticBookingConsent: true,
        consentPolicyVersion: 'waitlist-v1',
        automaticBookingEligible: true,
        automaticBookingEnabled: false,
      });
      expect(
        await connection
          .db!.collection('booking_commitments')
          .countDocuments({ kind: 'WAITLIST' }),
      ).toBe(1);
      expect(
        (await slots()).body.data.getAvailableSlots.find(
          (slot: { startsAt: string }) => slot.startsAt === start.toISOString(),
        ).canJoinWaitlist,
      ).toBe(true);
      await expect(
        app.get(BookingPolicyService).onModuleInit(),
      ).resolves.toBeUndefined();
      expect(
        (await migration.audit()).summary.issueCounts.WAITLIST_PRESENT,
      ).toBe(1);
      process.env.BOOKING_POLICY_V2_ENABLED = 'false';
      await expect(migration.apply()).rejects.toThrow('unresolved');
    });

    it('rejects a free slot, missing consent, a duplicate, and a conflicting cross-doctor commitment', async () => {
      expect((await join()).body.errors[0].extensions.booking.reason).toBe(
        'WAITLIST_CLOSED',
      );
      await occupied();
      expect(
        (await join({ automaticBookingConsent: false })).body.errors,
      ).toBeDefined();
      expect((await join()).body.errors).toBeUndefined();
      expect((await join()).body.errors[0].extensions.booking.reason).toBe(
        'DUPLICATE_ENTRY',
      );
      const conflict = await rest(destination);
      expect(conflict.status).toBe(409);
      expect(conflict.body.booking.choices).toEqual(['KEEP', 'REPLACE']);
    });

    it.each([48 * 3600_000, 48 * 3600_000 - 1])(
      'enforces the enrollment cutoff at %i milliseconds',
      async (delta) => {
        await occupied();
        freezeTime(+start - delta);
        const result = await clinicGraphql(
          `mutation($input: JoinWaitlistInput!) { joinWaitlist(input: $input) { _id } }`,
          { input: { ...input, automaticBookingConsent: true } },
          patient,
        );
        expect(Boolean(result.body.errors)).toBe(delta < 48 * 3600_000);
      },
    );

    it('withdraws idempotently while disabled and rejoins at a new FIFO position', async () => {
      await occupied();
      const first = (await join()).body.data.joinWaitlist;
      process.env.WAITLIST_ENROLLMENT_ENABLED = 'false';
      process.env.COMMITMENT_REPLACEMENT_ENABLED = 'false';
      expect((await join()).body.errors[0].extensions.booking.reason).toBe(
        'FEATURE_DISABLED',
      );
      const withdrawn = (await leave(first._id)).body.data.leaveWaitlist;
      expect(withdrawn.status).toBe('WITHDRAWN');
      expect((await leave(first._id)).body.data.leaveWaitlist.version).toBe(
        withdrawn.version,
      );
      process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
      expect((await join()).body.data.joinWaitlist.queueSequence).toBe(2);
    });

    it('scopes detail/list reads and exposes only counts to the doctor', async () => {
      await occupied();
      const row = (await join()).body.data.joinWaitlist;
      const detail = `query($id: ID!) { getWaitlist(id: $id) { ${entryFields} } }`;
      expect(
        (await api(detail, { id: row._id }, token2)).body.errors[0].extensions
          .code,
      ).toBe('NOT_FOUND');
      const ownClinic = await clinicGraphql(detail, { id: row._id });
      expect(ownClinic.body.data.getWaitlist.queueSequence).toBeNull();
      expect(
        (await clinicGraphql(detail, { id: row._id }, clinic2)).body.errors,
      ).toBeDefined();
      expect(
        (await clinicGraphql(detail, { id: row._id }, doctor)).body.errors,
      ).toBeDefined();
      const countQuery =
        'query($doctorId: ID!, $startsAt: DateTime!) { getWaitlistCount(doctorId: $doctorId, startsAt: $startsAt) }';
      expect(
        (
          await clinicGraphql(
            countQuery,
            { doctorId: String(doctor), startsAt: start.toISOString() },
            doctor,
          )
        ).body.data.getWaitlistCount,
      ).toBe(1);
      expect(
        (
          await api(countQuery, {
            doctorId: String(doctor),
            startsAt: start.toISOString(),
          })
        ).body.errors,
      ).toBeDefined();
      const list = await api(
        `query { myWaitlist(input: {limit: 1}) { entries { ${entryFields} } nextCursor } }`,
      );
      expect(
        list.body.data.myWaitlist.entries.map(
          (entry: { _id: string }) => entry._id,
        ),
      ).toEqual([row._id]);
      expect((await leave(row._id, token2)).body.errors).toBeDefined();
    });

    it.each(['APPOINTMENT', 'WAITLIST'])(
      'atomically replaces APPOINTMENT with %s',
      async (kind) => {
        const original = (await rest()).body;
        if (kind === 'WAITLIST') await occupied(destination);
        const result = await replace(
          'APPOINTMENT',
          original,
          kind,
          destination,
        );
        expect(result.body.errors).toBeUndefined();
        expect(result.body.data.replaceCommitment.kind).toBe(kind);
        expect((await originalRecord(original._id))!.status).toBe('CANCELED');
        expect(
          await connection.db!.collection('appointment_events').countDocuments({
            appointmentId: new Types.ObjectId(original._id),
          }),
        ).toBe(2);
        expect(
          await connection
            .db!.collection('booking_commitments')
            .countDocuments({ patientId: patient }),
        ).toBe(1);
      },
    );

    it.each(['APPOINTMENT', 'WAITLIST'])(
      'atomically replaces WAITLIST with %s',
      async (kind) => {
        await occupied();
        const original = (await join()).body.data.joinWaitlist;
        if (kind === 'WAITLIST')
          await occupied({
            ...destination,
            specialty: DoctorSpecialization.DENTIST,
          });
        const result = await replace('WAITLIST', original, kind, destination);
        expect(result.body.errors).toBeUndefined();
        expect((await originalRecord(original._id, 'waitlists'))!.status).toBe(
          'WITHDRAWN',
        );
        expect(
          await connection
            .db!.collection('booking_commitments')
            .countDocuments({ patientId: patient }),
        ).toBe(1);
      },
    );

    it.each(['APPOINTMENT', 'WAITLIST'])(
      'preserves an original %s when destination booking fails',
      async (kind) => {
        const original =
          kind === 'APPOINTMENT'
            ? (await rest()).body
            : (await occupied(), (await join()).body.data.joinWaitlist);
        await occupied({
          ...destination,
          specialty: DoctorSpecialization.DENTIST,
        });
        const result = await replace(
          kind,
          original,
          'APPOINTMENT',
          destination,
        );
        expect(result.body.errors).toBeDefined();
        expect(
          (await originalRecord(
            original._id,
            kind === 'APPOINTMENT' ? 'appointments' : 'waitlists',
          ))!.version,
        ).toBe(original.version);
        expect(
          await connection
            .db!.collection('booking_commitments')
            .countDocuments({ patientId: patient }),
        ).toBe(1);
        expect(
          await connection
            .db!.collection('appointment_events')
            .countDocuments(),
        ).toBe(0);
      },
    );

    it('rolls back original cancellation and events when destination persistence fails', async () => {
      const original = (await rest()).body;
      await occupied(destination);
      const model = connection.model('Waitlist');
      jest
        .spyOn(model, 'create')
        .mockRejectedValueOnce(new Error('injected failure'));
      expect(
        (await replace('APPOINTMENT', original, 'WAITLIST', destination)).body
          .errors,
      ).toBeDefined();
      expect((await originalRecord(original._id))!.status).toBe('CONFIRMED');
      expect(
        await connection.db!.collection('appointment_events').countDocuments(),
      ).toBe(0);
    });

    it('rejects stale versions, same-kind same targets, and out-of-scope originals', async () => {
      const original = (await rest()).body;
      expect(
        (
          await replace(
            'APPOINTMENT',
            { ...original, version: randomUUID() },
            'APPOINTMENT',
            destination,
          )
        ).body.errors[0].extensions.booking.reason,
      ).toBe('STALE_COMMITMENT');
      expect(
        (await replace('APPOINTMENT', original, 'APPOINTMENT')).body.errors,
      ).toBeDefined();
      const foreign = await occupied({
        ...destination,
        specialty: DoctorSpecialization.DENTIST,
      });
      expect(
        (
          await replace('APPOINTMENT', foreign, 'APPOINTMENT', {
            startsAt: at(120).toISOString(),
          })
        ).body.errors,
      ).toBeDefined();
      expect((await originalRecord(original._id))!.version).toBe(
        original.version,
      );
    });

    it('does not exclude a second conflicting commitment during replacement', async () => {
      const original = (await rest()).body;
      expect((await rest({ startsAt: at(24 * 60).toISOString() })).status).toBe(
        201,
      );
      expect(
        (
          await replace('APPOINTMENT', original, 'APPOINTMENT', {
            startsAt: at(60).toISOString(),
          })
        ).body.errors[0].extensions.booking.reason,
      ).toBe('COMMITMENT_CONFLICT');
      expect((await originalRecord(original._id))!.status).toBe('CONFIRMED');
    });

    it('blocks manual fulfillment behind a queue hold; last withdrawal releases it', async () => {
      const booking = await occupied();
      const entry = (await join()).body.data.joinWaitlist;
      await cancel(booking._id, token2);
      expect((await rest()).body.booking.reason).toBe('STALE_COMMITMENT');
      expect((await originalRecord(entry._id, 'waitlists'))!.status).toBe(
        'ACTIVE',
      );
      expect((await leave(entry._id)).body.data.leaveWaitlist.status).toBe(
        'WITHDRAWN',
      );
      expect((await rest()).status).toBe(201);
    });

    it.each([false, true])(
      'fulfills the matching entry atomically on inside-cutoff manual booking (explicit replacement %s)',
      async (explicit) => {
        const booking = await occupied();
        const entry = (await join()).body.data.joinWaitlist;
        freezeTime(+start - 47 * 3600_000);
        await clinicGraphql(cancelQuery, { id: booking._id }, patient2);
        const query = explicit
          ? `mutation($input: ReplaceCommitmentInput!) { replaceCommitment(input: $input) { appointment { _id } } }`
          : mutation;
        const variables = explicit
          ? {
              input: {
                originalKind: 'WAITLIST',
                originalId: entry._id,
                originalVersion: entry.version,
                destinationKind: 'APPOINTMENT',
                destination: input,
              },
            }
          : { input };
        const result = await clinicGraphql(query, variables, patient);
        expect(result.body.errors).toBeUndefined();
        const stored = (await originalRecord(entry._id, 'waitlists'))!;
        expect(stored.status).toBe('FULFILLED');
        expect(
          await connection
            .db!.collection('booking_commitments')
            .countDocuments({ patientId: patient, kind: 'WAITLIST' }),
        ).toBe(0);
        expect(
          (
            await clinicGraphql(
              `mutation($id: ID!) { leaveWaitlist(id: $id) { status } }`,
              { id: entry._id },
              patient,
            )
          ).body.errors,
        ).toBeDefined();
        expect(
          (await originalRecord(String(stored.appointmentId)))!.status,
        ).toBe('CONFIRMED');
      },
    );

    it('keeps concurrent duplicate joins and competing replacements coherent', async () => {
      await occupied();
      const joins = await Promise.all([join(), join()]);
      expect(joins.filter((result) => !result.body.errors)).toHaveLength(1);
      const original = joins.find((result) => !result.body.errors)!.body.data
        .joinWaitlist;
      const results = await Promise.all([
        replace('WAITLIST', original, 'APPOINTMENT', destination),
        replace('WAITLIST', original, 'APPOINTMENT', {
          ...destination,
          startsAt: at(120).toISOString(),
        }),
      ]);
      expect(results.filter((result) => !result.body.errors)).toHaveLength(1);
      expect(
        await connection
          .db!.collection('booking_commitments')
          .countDocuments({ patientId: patient }),
      ).toBe(1);
    });

    it('preserves originals on failed enrollment and rechecks clinic/specialty/overlap rules', async () => {
      const original = (await rest()).body;
      const failed = await replace(
        'APPOINTMENT',
        original,
        'WAITLIST',
        destination,
      );
      expect(failed.body.errors[0].extensions.booking.reason).toBe(
        'WAITLIST_CLOSED',
      );
      expect((await originalRecord(original._id))!.version).toBe(
        original.version,
      );
      expect(
        (
          await rest({
            doctorId: String(doctor3),
            clinicId: String(clinic2),
            specialty: DoctorSpecialization.DENTIST,
          })
        ).status,
      ).toBe(409);
      expect(
        (await join({ doctorId: String(doctor2), clinicId: String(clinic2) }))
          .body.errors,
      ).toBeDefined();
    });

    it('orders all specialties on a doctor slot together and paginates only the caller entries', async () => {
      await occupied({
        doctorId: String(doctor2),
        specialty: DoctorSpecialization.DENTIST,
      });
      const first = (await join({ doctorId: String(doctor2) })).body.data
        .joinWaitlist;
      const other = id();
      await connection.db!.collection('members').insertOne({
        _id: other,
        memberType: 'USER',
        memberStatus: 'ACTIVE',
        authVersion: 0,
      });
      const bearer = await app
        .get(JwtService)
        .signAsync({ sub: String(other), tokenType: 'access', authVersion: 0 });
      const second = (
        await join(
          {
            doctorId: String(doctor2),
            specialty: DoctorSpecialization.DENTIST,
          },
          bearer,
        )
      ).body.data.joinWaitlist;
      expect([
        first.queueSequence,
        second.queueSequence,
        second.queuePosition,
      ]).toEqual([1, 2, 2]);
      await occupied({ startsAt: at(1440).toISOString() });
      const later = (await join({ startsAt: at(1440).toISOString() })).body.data
        .joinWaitlist;
      const query =
        'query($input: MyWaitlistInput!) { myWaitlist(input: $input) { entries { _id } nextCursor } }';
      const page = (await api(query, { input: { limit: 1 } })).body.data
        .myWaitlist;
      expect(page.entries).toEqual([{ _id: first._id }]);
      const next = (
        await api(query, { input: { limit: 1, after: page.nextCursor } })
      ).body.data.myWaitlist;
      expect(next.entries).toEqual([{ _id: later._id }]);
      expect(next.nextCursor).toBeNull();
    });

    it('serializes withdrawal against manual fulfillment without cancelling the resulting appointment', async () => {
      const booking = await occupied();
      const entry = (await join()).body.data.joinWaitlist;
      freezeTime(+start - 47 * 3600_000);
      await clinicGraphql(cancelQuery, { id: booking._id }, patient2);
      const results = await Promise.all([
        clinicGraphql(mutation, { input }, patient),
        clinicGraphql(
          'mutation($id: ID!) { leaveWaitlist(id: $id) { status } }',
          { id: entry._id },
          patient,
        ),
      ]);
      expect(results[0].body.errors).toBeUndefined();
      const stored = (await originalRecord(entry._id, 'waitlists'))!;
      expect(['WITHDRAWN', 'FULFILLED']).toContain(stored.status);
      expect(
        await connection
          .db!.collection('booking_commitments')
          .countDocuments({ patientId: patient, kind: 'APPOINTMENT' }),
      ).toBe(1);
      expect(
        await connection
          .db!.collection('booking_commitments')
          .countDocuments({ patientId: patient, kind: 'WAITLIST' }),
      ).toBe(0);
    });

    it('retains queue ordering and the old entry on failed waitlist replacement', async () => {
      await occupied();
      const original = (await join()).body.data.joinWaitlist;
      expect(
        (await replace('WAITLIST', original, 'WAITLIST', destination)).body
          .errors,
      ).toBeDefined();
      const row = (await originalRecord(original._id, 'waitlists'))!;
      expect(row.status).toBe('ACTIVE');
      expect(row.version).toBe(original.version);
      expect(row.queueSequence).toBe(original.queueSequence);
    });

    it('rejects startup when a waitlist ledger record drifts', async () => {
      await occupied();
      await join();
      await connection
        .db!.collection('booking_commitments')
        .updateOne({ kind: 'WAITLIST' }, { $set: { version: randomUUID() } });
      await expect(
        app.get(BookingPolicyService).onModuleInit(),
      ).rejects.toThrow(BookingUnavailableException);
    });

    describe('FIFO promotion worker', () => {
      const worker = () => app.get(AppointmentPromotionService);
      const events = () => connection.db!.collection('appointment_events');
      const releaseEvent = () => events().findOne({ type: 'SLOT_RELEASED' });
      const promoted = () =>
        connection
          .db!.collection('appointments')
          .find({ source: 'WAITLIST' })
          .toArray();
      const setup = async () => {
        const booking = await occupied();
        const entry = (await join()).body.data.joinWaitlist;
        expect((await cancel(booking._id, token2)).body.errors).toBeUndefined();
        return entry as { _id: string; version: string };
      };
      const addPatient = async () => {
        const patientId = id();
        await connection.db!.collection('members').insertOne({
          _id: patientId,
          memberType: 'USER',
          memberStatus: 'ACTIVE',
          authVersion: 0,
        });
        const bearer = await app.get(JwtService).signAsync({
          sub: String(patientId),
          tokenType: 'access',
          authVersion: 0,
        });
        return { patientId, bearer };
      };
      const addWaiter = async () => {
        const added = await addPatient();
        const result = await join({}, added.bearer);
        expect(result.body.errors).toBeUndefined();
        return { ...added, entry: result.body.data.joinWaitlist };
      };
      const retryNow = () =>
        events().updateOne(
          { type: 'SLOT_RELEASED' },
          { $set: { nextAttemptAt: new Date(Date.now() - 1) } },
        );
      const freshWorker = () => {
        const instance = new AppointmentPromotionService(
          app.get(BookingCoordinationService),
          app.get(BookingPolicyService),
          app.get(WaitlistService),
          app.get(AppointmentService),
          connection.model<InferSchemaType<typeof AppointmentEventSchema>>(
            APPOINTMENT_EVENT,
          ),
        );
        jest.spyOn(instance, 'isEnabled').mockReturnValue(true);
        return instance;
      };
      beforeEach(() => jest.spyOn(worker(), 'isEnabled').mockReturnValue(true));

      it('promotes the FIFO head and atomically persists exactly one booking notification', async () => {
        const booking = await occupied();
        const first = (await join()).body.data.joinWaitlist;
        const second = await addWaiter();
        await cancel(booking._id, token2);
        expect(await worker().runOnce()).toBe(true);
        const appointments = await promoted();
        expect(appointments).toHaveLength(1);
        expect(String(appointments[0].patientId)).toBe(String(patient));
        expect((await originalRecord(first._id, 'waitlists'))!.status).toBe(
          'FULFILLED',
        );
        expect(
          (await originalRecord(second.entry._id, 'waitlists'))!.status,
        ).toBe('ACTIVE');
        expect((await releaseEvent())!.result).toBe('PROMOTED');
        expect((await slotGate())!.allocationPending).toBe(false);
        expect(
          await events().countDocuments({
            type: 'WAITLIST_BOOKING_CREATED',
            patientId: patient,
            appointmentId: appointments[0]._id,
            waitlistId: new Types.ObjectId(first._id),
          }),
        ).toBe(1);
        expect(await worker().runOnce()).toBe(false);
        await app.get(BookingPolicyService).onModuleInit();
      });

      it('prevents duplicate workers, repeated openings and manual booking from allocating twice', async () => {
        await setup();
        const [manual, ...results] = await Promise.all([
          rest({}, token2),
          ...Array.from({ length: 4 }, () => worker().runOnce()),
        ]);
        expect(manual.status).toBe(409);
        expect(results.filter(Boolean)).toHaveLength(1);
        const event = (await releaseEvent())!;
        await events().updateOne(
          { _id: event._id },
          { $set: { state: 'PENDING' } },
        );
        await worker().runOnce();
        expect((await releaseEvent())!.result).toBe('STALE');
        expect(await promoted()).toHaveLength(1);
        expect(
          await events().countDocuments({ type: 'WAITLIST_BOOKING_CREATED' }),
        ).toBe(1);
      });

      it.each([
        'PATIENT_INACTIVE',
        'INVALID_CONSENT',
        'PATIENT_OVERLAP',
        'COMMITMENT_CONFLICT',
      ])(
        'skips only established %s failures and promotes the next eligible patient',
        async (reason) => {
          const booking = await occupied();
          const first = (await join()).body.data.joinWaitlist;
          const second = await addWaiter();
          if (reason === 'PATIENT_INACTIVE')
            await connection
              .db!.collection('members')
              .updateOne(
                { _id: patient },
                { $set: { memberStatus: 'SUSPENDED' } },
              );
          if (reason === 'INVALID_CONSENT')
            await connection
              .db!.collection('waitlists')
              .updateOne(
                { _id: new Types.ObjectId(first._id) },
                { $set: { automaticBookingConsent: false } },
              );
          if (reason === 'PATIENT_OVERLAP')
            expect(
              (
                await rest({
                  doctorId: String(doctor3),
                  clinicId: String(clinic2),
                  specialty: DoctorSpecialization.DENTIST,
                })
              ).status,
            ).toBe(201);
          if (reason === 'COMMITMENT_CONFLICT')
            await connection.db!.collection('booking_commitments').insertOne({
              kind: 'APPOINTMENT',
              commitmentId: id(),
              version: randomUUID(),
              status: 'CONFIRMED',
              patientId: patient,
              doctorId: doctor2,
              clinicId: clinic,
              specialty: 'CARDIOLOGIST',
              startsAt: at(60),
              endsAt: at(90),
            });
          await cancel(booking._id, token2);
          await worker().runOnce();
          const row = (await originalRecord(first._id, 'waitlists'))!;
          expect(row).toMatchObject({
            status: 'INELIGIBLE',
            closedReason: reason,
          });
          expect(String((await promoted())[0].patientId)).toBe(
            String(second.patientId),
          );
          expect(
            await connection
              .db!.collection('booking_commitments')
              .countDocuments({
                kind: 'WAITLIST',
                commitmentId: new Types.ObjectId(first._id),
              }),
          ).toBe(0);
        },
      );

      it.each(['schedule', 'doctor', 'specialty'])(
        'rechecks current %s and releases a queue with no eligible patients',
        async (change) => {
          const first = await setup();
          if (change === 'schedule')
            await connection
              .db!.collection('doctor_availability')
              .deleteMany({ doctorId: doctor });
          if (change === 'doctor')
            await connection
              .db!.collection('members')
              .updateOne(
                { _id: doctor },
                { $set: { memberStatus: 'SUSPENDED' } },
              );
          if (change === 'specialty')
            await connection
              .db!.collection('members')
              .updateOne(
                { _id: doctor },
                { $set: { doctorSpecializations: [] } },
              );
          await worker().runOnce();
          expect(await promoted()).toHaveLength(0);
          expect(
            (await originalRecord(first._id, 'waitlists'))!.closedReason,
          ).toBe('DOCTOR_OR_SCHEDULE');
          expect((await slotGate())!.allocationPending).toBe(false);
          expect((await releaseEvent())!.result).toBe('QUEUE_EMPTY');
        },
      );

      it.each([48 * 3600_000, 48 * 3600_000 - 1])(
        'checks the actual allocation cutoff at %i ms',
        async (delta) => {
          await setup();
          freezeTime(+start - delta);
          await worker().runOnce();
          expect(await promoted()).toHaveLength(
            delta === 48 * 3600_000 ? 1 : 0,
          );
          expect((await releaseEvent())!.state).toBe(
            delta === 48 * 3600_000 ? 'PROCESSED' : 'DEFERRED',
          );
          expect((await slotGate())!.allocationPending).toBe(false);
        },
      );

      it('rolls back an allocation crossing the cutoff and durably defers it for manual fan-out', async () => {
        const entry = await setup();
        freezeTime(+start - 48 * 3600_000);
        const appointments = app.get(AppointmentService);
        const check = appointments.checkPromotionEligibility.bind(appointments);
        jest
          .spyOn(appointments, 'checkPromotionEligibility')
          .mockImplementationOnce(async (...args) => {
            const principal = await check(...args);
            freezeTime(+start - 48 * 3600_000 + 1);
            return principal;
          });
        await worker().runOnce();
        expect(await promoted()).toHaveLength(0);
        expect((await originalRecord(entry._id, 'waitlists'))!.status).toBe(
          'ACTIVE',
        );
        expect((await releaseEvent())!).toMatchObject({
          state: 'DEFERRED',
          result: 'MANUAL_CUTOFF',
        });
        expect(
          await events().countDocuments({ type: 'WAITLIST_BOOKING_CREATED' }),
        ).toBe(0);
        expect((await slotGate())!.allocationPending).toBe(false);
      });

      it.each(['eligibility-read', 'notification-write'])(
        'retries %s failure without skipping the FIFO head or leaking error payloads',
        async (point) => {
          const booking = await occupied();
          const first = (await join()).body.data.joinWaitlist;
          await addWaiter();
          await cancel(booking._id, token2);
          if (point === 'eligibility-read')
            jest
              .spyOn(app.get(AppointmentService), 'checkPromotionEligibility')
              .mockRejectedValueOnce(new Error('private provider payload'));
          else
            jest
              .spyOn(connection.model(APPOINTMENT_EVENT), 'create')
              .mockRejectedValueOnce(new Error('private provider payload'));
          await worker().runOnce();
          expect(await promoted()).toHaveLength(0);
          expect((await originalRecord(first._id, 'waitlists'))!.status).toBe(
            'ACTIVE',
          );
          expect((await slotGate())!.allocationPending).toBe(true);
          const failed = (await releaseEvent())!;
          expect(failed).toMatchObject({
            state: 'PENDING',
            attempts: 1,
            lastFailureCode: 'WORKER_RETRY',
          });
          expect(JSON.stringify(failed)).not.toContain(
            'private provider payload',
          );
          expect(await worker().runOnce()).toBe(false);
          await retryNow();
          await worker().runOnce();
          expect(String((await promoted())[0].patientId)).toBe(String(patient));
          expect((await releaseEvent())!.attempts).toBe(2);
          expect(
            await events().countDocuments({ type: 'WAITLIST_BOOKING_CREATED' }),
          ).toBe(1);
        },
      );

      it('recovers abandoned expired leases from a fresh worker instance', async () => {
        await setup();
        await events().updateOne(
          { type: 'SLOT_RELEASED' },
          {
            $set: {
              state: 'PROCESSING',
              claimToken: randomUUID(),
              leaseUntil: new Date(Date.now() - 1),
              attempts: 1,
            },
          },
        );
        await freshWorker().runOnce();
        expect(await promoted()).toHaveLength(1);
        expect((await releaseEvent())!).toMatchObject({
          state: 'PROCESSED',
          attempts: 2,
        });
      });

      it('fences a stale owner after another worker takes over its expired claim', async () => {
        await setup();
        let enter!: () => void, resume!: () => void;
        const entered = new Promise<void>((resolve) => {
          enter = resolve;
        });
        const resumed = new Promise<void>((resolve) => {
          resume = resolve;
        });
        const waitlists = app.get(WaitlistService);
        const first = waitlists.firstForPromotion.bind(waitlists);
        jest
          .spyOn(waitlists, 'firstForPromotion')
          .mockImplementationOnce(async (...args) => {
            enter();
            await resumed;
            return first(...args);
          });
        const stale = worker().runOnce();
        await entered;
        try {
          await events().updateOne(
            { type: 'SLOT_RELEASED' },
            { $set: { leaseUntil: new Date(Date.now() - 1) } },
          );
          await freshWorker().runOnce();
        } finally {
          resume();
        }
        await stale;
        expect(await promoted()).toHaveLength(1);
        expect(
          await events().countDocuments({ type: 'WAITLIST_BOOKING_CREATED' }),
        ).toBe(1);
        expect((await releaseEvent())!.result).toBe('PROMOTED');
      });

      it('serializes withdrawal versus promotion into one coherent result', async () => {
        const entry = await setup();
        await Promise.all([leave(entry._id), worker().runOnce()]);
        const row = (await originalRecord(entry._id, 'waitlists'))!;
        expect(['WITHDRAWN', 'FULFILLED']).toContain(row.status);
        expect(await promoted()).toHaveLength(
          row.status === 'FULFILLED' ? 1 : 0,
        );
        expect(
          await connection
            .db!.collection('booking_commitments')
            .countDocuments({ patientId: patient, kind: 'WAITLIST' }),
        ).toBe(0);
        expect((await slotGate())!.allocationPending).toBe(false);
      });

      it('ignores a stale slot generation without unlocking the newer hold', async () => {
        await setup();
        await connection
          .db!.collection<{ _id: string; generation: number }>('booking_gates')
          .updateOne(
            { _id: `slot:${doctor}:${+start}` },
            { $inc: { generation: 1 } },
          );
        await worker().runOnce();
        expect(await promoted()).toHaveLength(0);
        expect((await releaseEvent())!.result).toBe('STALE');
        expect((await slotGate())!.allocationPending).toBe(true);
      });

      it('never promotes notification-only entries and releases an empty eligible queue', async () => {
        const entry = await setup();
        await connection
          .db!.collection('waitlists')
          .updateOne(
            { _id: new Types.ObjectId(entry._id) },
            { $set: { status: 'NOTIFICATION_ONLY' } },
          );
        await connection
          .db!.collection('booking_commitments')
          .updateOne(
            { kind: 'WAITLIST' },
            { $set: { status: 'NOTIFICATION_ONLY' } },
          );
        await worker().runOnce();
        expect(await promoted()).toHaveLength(0);
        expect((await releaseEvent())!.result).toBe('QUEUE_EMPTY');
        expect((await originalRecord(entry._id, 'waitlists'))!.status).toBe(
          'NOTIFICATION_ONLY',
        );
        expect((await slotGate())!.allocationPending).toBe(false);
      });

      it('bounds a claim and resumes the FIFO queue on the next attempt', async () => {
        const booking = await occupied();
        const entries = [];
        for (let n = 0; n < 26; n++) entries.push(await addWaiter());
        await connection.db!.collection('members').updateMany(
          {
            _id: {
              $in: entries.slice(0, 25).map((entry) => entry.patientId),
            },
          },
          { $set: { memberStatus: 'SUSPENDED' } },
        );
        await cancel(booking._id, token2);
        await worker().runOnce();
        expect((await releaseEvent())!).toMatchObject({
          state: 'PENDING',
          lastFailureCode: 'BATCH_LIMIT',
        });
        expect((await slotGate())!.allocationPending).toBe(true);
        expect(await promoted()).toHaveLength(0);
        await retryNow();
        await worker().runOnce();
        expect(String((await promoted())[0].patientId)).toBe(
          String(entries[25].patientId),
        );
      });

      it('leaves pending work untouched when promotion is disabled', async () => {
        await setup();
        jest.spyOn(worker(), 'isEnabled').mockReturnValue(false);
        expect(await worker().runOnce()).toBe(false);
        expect((await releaseEvent())!).toMatchObject({
          state: 'PENDING',
          attempts: 0,
        });
        expect((await slotGate())!.allocationPending).toBe(true);
      });
    });

    describe('Cutoff lifecycle and in-app notification delivery', () => {
      const lifecycle = () => app.get(AppointmentWaitlistLifecycleService);
      const delivery = () => app.get(NotificationService);
      const outbox = () => connection.db!.collection('notification_outbox');
      const inbox = () => connection.db!.collection('notifications');
      const noticesQuery =
        'query($input: MyNotificationsInput!) { myNotifications(input:$input) { entries { _id type message waitlistId appointmentId doctorId clinicId startsAt occurredAt readAt } nextCursor unreadCount } }';
      const mine = (owner = patient, input: Record<string, unknown> = {}) =>
        clinicGraphql(noticesQuery, { input }, owner);
      const flush = async (
        service: { runOnce(): Promise<boolean> },
        max = 100,
      ) => {
        for (let n = 0; n < max; n++) if (!(await service.runOnce())) return;
        throw new Error('Test drain exceeded its bound');
      };
      const extraWaiter = async () => {
        const patientId = id();
        await connection.db!.collection('members').insertOne({
          _id: patientId,
          memberType: 'USER',
          memberStatus: 'ACTIVE',
          authVersion: 0,
        });
        const bearer = await app.get(JwtService).signAsync({
          sub: String(patientId),
          tokenType: 'access',
          authVersion: 0,
        });
        const result = await join({}, bearer);
        expect(result.body.errors).toBeUndefined();
        return { patientId, entry: result.body.data.joinWaitlist };
      };
      const setup = async () => {
        const booking = await occupied();
        const first = (await join()).body.data.joinWaitlist;
        const second = await extraWaiter();
        return { booking, first, second };
      };
      const manualOpening = async (booking: { _id: string }) => {
        freezeTime(+start - (47 * 60 + 59) * 60_000);
        const result = await clinicGraphql(
          cancelQuery,
          { id: booking._id },
          patient2,
        );
        expect(result.body.errors).toBeUndefined();
      };
      beforeEach(() => {
        jest.spyOn(lifecycle(), 'isEnabled').mockReturnValue(true);
        jest.spyOn(delivery(), 'isEnabled').mockReturnValue(true);
      });

      it('captures every active recipient at a 47h59 opening, creates no automatic booking and delivers unreserved alerts', async () => {
        const { booking, first, second } = await setup();
        await manualOpening(booking);
        const rows = await outbox()
          .find({ type: 'SLOT_OPEN_FOR_MANUAL_BOOKING' })
          .toArray();
        expect(rows.map((row) => String(row.patientId)).sort()).toEqual(
          [String(patient), String(second.patientId)].sort(),
        );
        expect(rows.every((row) => !row.appointmentId)).toBe(true);
        await flush(lifecycle());
        await flush(delivery());
        expect(
          await connection
            .db!.collection('appointments')
            .countDocuments({ source: 'WAITLIST' }),
        ).toBe(0);
        expect((await originalRecord(first._id, 'waitlists'))!.status).toBe(
          'NOTIFICATION_ONLY',
        );
        const result = (await mine()).body.data.myNotifications;
        expect(
          result.entries.find(
            (row: { type: string }) =>
              row.type === 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          ).message,
        ).toContain('not reserved');
        expect(JSON.stringify(result)).not.toContain(booking._id);
        expect(result.entries).toHaveLength(2);
        expect(
          (await mine(second.patientId)).body.data.myNotifications.entries,
        ).toHaveLength(2);
      });

      it('preserves the opening snapshot after withdrawal and deduplicates cancellation/worker replay', async () => {
        const { booking, first } = await setup();
        await manualOpening(booking);
        await clinicGraphql(
          'mutation($id:ID!){leaveWaitlist(id:$id){status}}',
          { id: first._id },
          patient,
        );
        await clinicGraphql(cancelQuery, { id: booking._id }, patient2);
        await Promise.all([lifecycle().runOnce(), lifecycle().runOnce()]);
        await flush(delivery());
        expect(
          await inbox().countDocuments({
            patientId: patient,
            type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          }),
        ).toBe(1);
        expect(
          await outbox().countDocuments({
            type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          }),
        ).toBe(2);
      });

      it('deduplicates each event/recipient/channel while allowing a distinct opening event', async () => {
        const { booking, first } = await setup();
        await manualOpening(booking);
        const existing = (await outbox().findOne({
          type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          patientId: patient,
        }))!;
        const notice = {
          eventId: 'distinct-opening',
          patientId: patient,
          waitlistId: new Types.ObjectId(first._id),
          type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          doctorId: doctor,
          clinicId: clinic,
          startsAt: start,
          endsAt: at(30),
          occurredAt: new Date(Date.now()),
        };
        await app.get(BookingCoordinationService).run(
          {
            doctorIds: [doctor],
            patientIds: [patient],
            slots: [{ doctorId: doctor, startsAt: start }],
          },
          async (tx) => {
            await delivery().emit([notice, notice], tx.session);
          },
        );
        await flush(delivery());
        expect(
          await inbox().countDocuments({
            patientId: patient,
            type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          }),
        ).toBe(2);
        expect(existing.eventId).not.toBe('distinct-opening');
      });

      it('moves queues to notification-only strictly inside48 and keeps their ledger commitments/version in sync', async () => {
        await occupied();
        const entry = (await join()).body.data.joinWaitlist;
        freezeTime(+start - 48 * 3600_000);
        expect(await lifecycle().runOnce()).toBe(false);
        freezeTime(+start - 48 * 3600_000 + 1);
        expect(await lifecycle().runOnce()).toBe(true);
        const row = (await originalRecord(entry._id, 'waitlists'))!;
        const ledger = await connection
          .db!.collection('booking_commitments')
          .findOne({
            kind: 'WAITLIST',
            commitmentId: new Types.ObjectId(entry._id),
          });
        expect(row.status).toBe('NOTIFICATION_ONLY');
        expect(row.version).not.toBe(entry.version);
        expect(ledger!.version).toBe(row.version);
        expect(ledger!.status).toBe('NOTIFICATION_ONLY');
        const withdrawal = await clinicGraphql(
          'mutation($id:ID!){leaveWaitlist(id:$id){status}}',
          { id: entry._id },
          patient,
        );
        expect(withdrawal.body.data.leaveWaitlist.status).toBe('WITHDRAWN');
      });

      it('rolls back a cutoff transition rather than silently repairing a mismatched ledger version', async () => {
        await occupied();
        const entry = (await join()).body.data.joinWaitlist;
        await connection
          .db!.collection('booking_commitments')
          .updateOne({ kind: 'WAITLIST' }, { $set: { version: randomUUID() } });
        freezeTime(+start - 48 * 3600_000 + 1);
        await expect(lifecycle().runOnce()).rejects.toThrow();
        expect((await originalRecord(entry._id, 'waitlists'))!).toMatchObject({
          status: 'ACTIVE',
          version: entry.version,
        });
      });

      it('releases a held queued opening at cutoff even with promotion disabled', async () => {
        const { booking } = await setup();
        await cancel(booking._id, token2);
        expect((await slotGate())!.allocationPending).toBe(true);
        freezeTime(+start - 48 * 3600_000 + 1);
        await flush(lifecycle());
        expect((await slotGate())!.allocationPending).toBe(false);
        expect(
          await outbox().countDocuments({
            type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          }),
        ).toBe(2);
        expect(
          await connection
            .db!.collection('appointments')
            .countDocuments({ source: 'WAITLIST' }),
        ).toBe(0);
      });

      it('expires unfilled entries at slot start and emits exactly one expiry notice per entry', async () => {
        const { first } = await setup();
        freezeTime(+start);
        await Promise.all([lifecycle().runOnce(), lifecycle().runOnce()]);
        await flush(lifecycle());
        await flush(delivery());
        expect((await originalRecord(first._id, 'waitlists'))!).toMatchObject({
          status: 'EXPIRED',
          closedReason: 'SLOT_STARTED',
        });
        expect(
          await connection
            .db!.collection('booking_commitments')
            .countDocuments({ kind: 'WAITLIST' }),
        ).toBe(0);
        expect(await inbox().countDocuments({ type: 'WAITLIST_EXPIRED' })).toBe(
          2,
        );
      });

      it('closes remaining entries after manual fulfillment and keeps delivery separate from booking', async () => {
        const { booking, first, second } = await setup();
        await manualOpening(booking);
        const booked = await clinicGraphql(mutation, { input }, patient);
        expect(booked.body.errors).toBeUndefined();
        await flush(lifecycle());
        expect((await originalRecord(first._id, 'waitlists'))!.status).toBe(
          'FULFILLED',
        );
        expect(
          (await originalRecord(second.entry._id, 'waitlists'))!,
        ).toMatchObject({ status: 'EXPIRED', closedReason: 'SLOT_TAKEN' });
        expect(
          await outbox().countDocuments({
            patientId: patient,
            type: 'WAITLIST_BOOKING_CREATED',
          }),
        ).toBe(1);
        await outbox().updateMany(
          { type: { $ne: 'WAITLIST_BOOKING_CREATED' } },
          { $set: { state: 'DELIVERED' } },
        );
        jest
          .spyOn(connection.model('Notification'), 'updateOne')
          .mockRejectedValueOnce(new Error('private provider payload'));
        await delivery().runOnce();
        expect(
          (await originalRecord(booked.body.data.bookAppointment._id))!.status,
        ).toBe('CONFIRMED');
        const pending = (await outbox().findOne({
          type: 'WAITLIST_BOOKING_CREATED',
        }))!;
        expect(pending).toMatchObject({
          state: 'PENDING',
          lastFailureCode: 'IN_APP_DELIVERY_RETRY',
        });
        expect(JSON.stringify(pending)).not.toContain(
          'private provider payload',
        );
        await outbox().updateOne(
          { _id: pending._id },
          { $set: { nextAttemptAt: new Date(Date.now() - 1) } },
        );
        await delivery().runOnce();
        expect(
          await inbox().countDocuments({
            type: 'WAITLIST_BOOKING_CREATED',
            appointmentId: new Types.ObjectId(
              booked.body.data.bookAppointment._id,
            ),
          }),
        ).toBe(1);
      });

      it('cleanup of an older booking preserves later enrollments and later opening recipients', async () => {
        const { booking, second } = await setup();
        await cancel(booking._id, token2);
        jest
          .spyOn(app.get(AppointmentPromotionService), 'isEnabled')
          .mockReturnValue(true);
        await app.get(AppointmentPromotionService).runOnce();
        const later = await extraWaiter();
        await flush(lifecycle());
        expect(
          (await originalRecord(second.entry._id, 'waitlists'))!.status,
        ).toBe('EXPIRED');
        expect(
          (await originalRecord(later.entry._id, 'waitlists'))!.status,
        ).toBe('ACTIVE');
        const confirmed = (await connection
          .db!.collection('appointments')
          .findOne({ source: 'WAITLIST' }))!;
        freezeTime(+start - 47 * 3600_000);
        await clinicGraphql(
          cancelQuery,
          { id: String(confirmed._id) },
          patient,
        );
        const opening = await outbox()
          .find({ type: 'SLOT_OPEN_FOR_MANUAL_BOOKING' })
          .toArray();
        expect(opening.map((row) => String(row.patientId))).toEqual([
          String(later.patientId),
        ]);
      });

      it('rejects reuse of a queue entry pending cleanup, while allowing a fresh enrollment at the back', async () => {
        const { booking, second } = await setup();
        await cancel(booking._id, token2);
        jest
          .spyOn(app.get(AppointmentPromotionService), 'isEnabled')
          .mockReturnValue(true);
        await app.get(AppointmentPromotionService).runOnce();
        const old = await app.get(WaitlistService).get(second.entry._id, {
          _id: second.patientId,
          memberType: MemberType.USER,
          authVersion: 0,
        });
        expect(
          (
            await app.get(WaitlistService).view(old, {
              _id: second.patientId,
              memberType: MemberType.USER,
              authVersion: 0,
            })
          ).automaticBookingEligible,
        ).toBe(false);
        const replaced = await clinicGraphql(
          'mutation($input:ReplaceCommitmentInput!){replaceCommitment(input:$input){kind}}',
          {
            input: {
              originalKind: 'WAITLIST',
              originalId: second.entry._id,
              originalVersion: second.entry.version,
              destinationKind: 'APPOINTMENT',
              destination: { ...input, ...destination },
            },
          },
          second.patientId,
        );
        expect(replaced.body.errors[0].extensions.booking.reason).toBe(
          'STALE_COMMITMENT',
        );
        const rejoined = await clinicGraphql(
          'mutation($input:JoinWaitlistInput!){joinWaitlist(input:$input){_id queueSequence}}',
          { input: { ...input, automaticBookingConsent: true } },
          second.patientId,
        );
        expect(rejoined.body.errors).toBeUndefined();
        expect(rejoined.body.data.joinWaitlist.queueSequence).toBe(3);
        expect(
          (await originalRecord(second.entry._id, 'waitlists'))!.status,
        ).toBe('EXPIRED');
        await flush(lifecycle());
        expect(
          (await originalRecord(
            rejoined.body.data.joinWaitlist._id,
            'waitlists',
          ))!.status,
        ).toBe('ACTIVE');
      });

      it('stale release generations and closed schedules never announce bookable time', async () => {
        const { booking } = await setup();
        await cancel(booking._id, token2);
        await connection
          .db!.collection('doctor_availability')
          .deleteMany({ doctorId: doctor });
        freezeTime(+start - 47 * 3600_000);
        await lifecycle().runOnce();
        expect(
          await outbox().countDocuments({
            type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          }),
        ).toBe(0);
        expect((await slotGate())!.allocationPending).toBe(false);
      });

      it('delivers idempotently under concurrent workers and replay without resetting read state', async () => {
        await occupied();
        await join();
        await Promise.all(
          Array.from({ length: 4 }, () => delivery().runOnce()),
        );
        const result = (await mine()).body.data.myNotifications;
        expect(result.entries).toHaveLength(1);
        const id = result.entries[0]._id;
        const readQuery =
          'mutation($id:ID!){markNotificationRead(id:$id){_id readAt}}';
        const first = (await clinicGraphql(readQuery, { id }, patient)).body
          .data.markNotificationRead;
        const again = (await clinicGraphql(readQuery, { id }, patient)).body
          .data.markNotificationRead;
        expect(again.readAt).toBe(first.readAt);
        await outbox().updateOne(
          { _id: id },
          {
            $set: {
              state: 'PROCESSING',
              claimToken: randomUUID(),
              leaseUntil: new Date(Date.now() - 1),
            },
          },
        );
        await delivery().runOnce();
        expect(await inbox().countDocuments()).toBe(1);
        expect((await mine()).body.data.myNotifications.unreadCount).toBe(0);
        expect((await inbox().findOne({ _id: id }))!.readAt.toISOString()).toBe(
          first.readAt,
        );
      });

      it('scopes inbox/read/cursors and exposes only aggregate failure status to operators', async () => {
        const { booking } = await setup();
        await manualOpening(booking);
        await flush(delivery());
        const firstPage = (await mine(patient, { limit: 1 })).body.data
          .myNotifications;
        const next = (
          await mine(patient, { limit: 1, after: firstPage.nextCursor })
        ).body.data.myNotifications;
        expect(firstPage.entries[0]._id).not.toBe(next.entries[0]._id);
        expect(next.nextCursor).toBeNull();
        const id = firstPage.entries[0]._id;
        const foreign = await clinicGraphql(
          'mutation($id:ID!){markNotificationRead(id:$id){_id}}',
          { id },
          patient2,
        );
        expect(foreign.body.errors[0].extensions.code).toBe('NOT_FOUND');
        expect((await mine(clinic)).body.errors[0].extensions.code).toBe(
          'FORBIDDEN',
        );
        expect(
          (await mine(patient2, { after: id })).body.errors[0].extensions.code,
        ).toBe('BAD_USER_INPUT');
        const statusQuery =
          'query {notificationDeliveryStatus {pending processing delivered retrying expiredClaims}}';
        expect(
          (await clinicGraphql(statusQuery, {}, patient)).body.errors[0]
            .extensions.code,
        ).toBe('FORBIDDEN');
        const admin = new Types.ObjectId();
        await connection.db!.collection('members').insertOne({
          _id: admin,
          memberType: 'ADMIN',
          memberStatus: 'ACTIVE',
          authVersion: 0,
        });
        const status = await clinicGraphql(statusQuery, {}, admin);
        expect(status.body.errors).toBeUndefined();
        expect(status.body.data.notificationDeliveryStatus.delivered).toBe(4);
      });

      it('a failure to capture notices rolls back cancellation; delivery being disabled does not discard notices', async () => {
        const { booking } = await setup();
        freezeTime(+start - 47 * 3600_000);
        jest
          .spyOn(connection.model('NotificationOutbox'), 'bulkWrite')
          .mockRejectedValueOnce(new Error('storage failure'));
        const result = await clinicGraphql(
          cancelQuery,
          { id: booking._id },
          patient2,
        );
        expect(result.body.errors).toBeDefined();
        expect((await originalRecord(booking._id))!.status).toBe('CONFIRMED');
        expect(
          await outbox().countDocuments({
            type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
          }),
        ).toBe(0);
        jest.spyOn(delivery(), 'isEnabled').mockReturnValue(false);
        expect(await delivery().runOnce()).toBe(false);
        expect(await outbox().countDocuments({ state: 'PENDING' })).toBe(2);
      });
    });
  });
});
