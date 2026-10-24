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
});
