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
    process.env.BOOKING_POLICY_V2_ENABLED = 'false';
    for (const name of [
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
  afterEach(() => jest.restoreAllMocks());

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
      jest.spyOn(Date, 'now').mockReturnValue(+start - remaining);
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
    jest.spyOn(Date, 'now').mockReturnValue(+start);
    expect(
      (await clinicGraphql(cancelQuery, { id: original._id })).body.errors[0]
        .extensions.code,
    ).toBe('CONFLICT');
    jest.spyOn(Date, 'now').mockReturnValue(+at(30));
    expect(
      (
        await clinicGraphql(outcomeQuery, {
          id: original._id,
          outcome: 'COMPLETED',
        })
      ).body.data.setAppointmentOutcome.status,
    ).toBe('COMPLETED');
  });
});
