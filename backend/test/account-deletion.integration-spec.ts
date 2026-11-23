import { GoogleAuthService } from '../src/components/auth/google-auth.service.js';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { EmailDeliveryService } from '../src/components/auth/email-delivery.service.js';
import { EmailVerificationService } from '../src/components/auth/email-verification.service.js';
import {
  setupEmailVerificationStorage,
  EMAIL_VERIFICATIONS,
  EMAIL_LIMITS,
} from '../src/schemas/email-verification.model.js';
import { migrateUsernames } from '../src/components/member/member-username-migration.js';
import { BookingMigrationService } from '../src/components/booking/booking-migration.service.js';
import { AccountDeletionCommitmentService } from '../src/components/booking/account-deletion-commitment.service.js';
import { MemberService } from '../src/components/member/member.service.js';
import { AppointmentPromotionService } from '../src/components/appointment/appointment-promotion.service.js';
import { MemberType } from '../src/libs/enum/member.enum.js';
import { AccountDeletionPageInput } from '../src/libs/dto/member/account-deletion.input.js';
import { hashPassword } from '../src/components/auth/member-password.js';

if (
  process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
  !process.env.BOOKING_TEST_URI?.startsWith('mongodb://127.0.0.1:')
)
  throw new Error('Use the owned disposable database runner');
const patient = new Types.ObjectId();
const other = new Types.ObjectId();
const doctor = new Types.ObjectId();
const clinic = new Types.ObjectId();
const admin = new Types.ObjectId();
// Monday, 10am in Seoul. Kept well into the future without changing the driver clock.
const startsAt = new Date('2035-01-01T01:00:00Z');
const endsAt = new Date(+startsAt + 1800000);
const bookingInput = {
  doctorId: String(doctor),
  clinicId: String(clinic),
  startsAt: startsAt.toISOString(),
  specialty: 'CARDIOLOGIST',
};
const deletionInput = { memberStatus: 'DELETED', deletionAgreement: true };
const deleteMutation =
  'mutation($input:MemberUpdateInput!){updateMember(input:$input){member{_id} requiresLogin imageCleanupPending}}';
const readinessQuery = `query($input:AccountDeletionPageInput!){accountDeletionReadiness(input:$input){
  asOf ready appointmentCount waitlistCount affiliationImpactCount
  appointments{nextCursor entries{id kind status startsAt endsAt clinicId doctorId clinicName doctorName clinicTimezone permittedAction resolutionReason}}
  waitlists{nextCursor entries{id kind status startsAt endsAt clinicId doctorId clinicName doctorName clinicTimezone permittedAction resolutionReason}}
}}`;

describe('Account deletion through the real API and disposable MongoDB', () => {
  let app: INestApplication;
  let connection: Connection;
  let password: string;
  const db = () => connection.db!;
  const tokens = new Map<string, string>();
  const delivered = new Map<string, string>();
  const envKeys = [
    'MONGO_URI',
    'NODE_ENV',
    'JWT_ACCESS_SECRET',
    'BOOKING_POLICY_V2_ENABLED',
    'WAITLIST_ENROLLMENT_ENABLED',
    'WAITLIST_PROMOTION_ENABLED',
    'COMMITMENT_REPLACEMENT_ENABLED',
    'WAITLIST_NOTIFICATIONS_ENABLED',
    'WAITLIST_LIFECYCLE_ENABLED',
  ] as const;
  const previous = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
  beforeAll(async () => {
    process.env.MONGO_URI = process.env.BOOKING_TEST_URI!.replace(
      '/?',
      `/deletion_${randomUUID().replaceAll('-', '')}?`,
    );
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET =
      'disposable-account-deletion-secret-at-least-32-bytes';
    for (const key of envKeys.filter((key) => key.endsWith('_ENABLED')))
      process.env[key] = 'false';
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailDeliveryService)
      .useValue({
        sendVerificationCode: async (email: string, code: string) => {
          delivered.set(email, code);
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
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
    await setupEmailVerificationStorage(db());
    await app.get(BookingMigrationService).apply();
    await app.init();
    password = await hashPassword('disposable-test-password');
    for (const id of [patient, other, doctor, clinic, admin])
      tokens.set(
        String(id),
        await app
          .get(JwtService)
          .signAsync({ sub: String(id), tokenType: 'access', authVersion: 0 }),
      );
  });
  beforeEach(async () => {
    for (const key of envKeys.filter((key) => key.endsWith('_ENABLED')))
      process.env[key] = 'false';
    for (const name of [
      'members',
      'member_sessions',
      'appointments',
      'appointment_events',
      'waitlists',
      'waitlist_cleanup',
      'booking_gates',
      'booking_commitments',
      'booking_policy',
      'doctor_availability',
      'doctor_availability_overrides',
      EMAIL_VERIFICATIONS,
      EMAIL_LIMITS,
    ])
      await db().collection(name).deleteMany({});
    await db()
      .collection('members')
      .insertMany(
        [
          {
            _id: patient,
            memberType: 'USER',
            memberEmail: 'patient@example.test',
            memberPassword: password,
          },
          {
            _id: other,
            memberType: 'USER',
            memberEmail: 'other@example.test',
            memberPassword: password,
          },
          {
            _id: doctor,
            memberType: 'DOCTOR',
            clinicId: clinic,
            doctorClinicStatus: 'APPROVED',
            doctorSpecializations: ['CARDIOLOGIST'],
          },
          {
            _id: clinic,
            memberType: 'CLINIC',
            clinicName: 'Test clinic',
            clinicTimezone: 'Asia/Seoul',
            location: 'SEOUL',
          },
          { _id: admin, memberType: 'ADMIN' },
        ].map((row) => ({
          ...row,
          memberNick: `user_${row._id}`,
          memberNickNormalized: `user_${row._id}`,
          memberStatus: 'ACTIVE',
          authProvider: 'EMAIL',
          authVersion: 0,
          __v: 0,
        })),
      );
    await db()
      .collection('doctor_availability')
      .insertMany(
        [1, 2, 3, 4, 5].map((weekday) => ({
          doctorId: doctor,
          clinicId: clinic,
          weekday,
          startMinute: 540,
          endMinute: 1080,
        })),
      );
    await app.get(BookingMigrationService).apply();
    process.env.BOOKING_POLICY_V2_ENABLED = 'true';
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await db().dropDatabase();
    await app?.close();
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  const gql = (query: string, variables: object, id = patient) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${tokens.get(String(id))}`)
      .send({ query, variables });
  const remove = (id = patient, input: object = deletionInput) =>
    gql(deleteMutation, { input }, id);
  const ready = (id = patient, input: object = {}) =>
    gql(readinessQuery, { input }, id);
  const row = (status = 'CONFIRMED', changes: object = {}) => ({
    _id: new Types.ObjectId(),
    patientId: patient,
    doctorId: doctor,
    clinicId: clinic,
    startsAt,
    endsAt,
    status,
    version: randomUUID(),
    source: 'LEGACY',
    ...changes,
  });
  const wait = (status = 'ACTIVE', changes: object = {}) => ({
    ...row(status),
    specialty: 'CARDIOLOGIST',
    queueSequence: 1,
    automaticBookingConsent: true,
    consentPolicyVersion: 'waitlist-v1',
    consentedAt: new Date(),
    ...changes,
  });
  const booking = (id = patient, changes: object = {}) =>
    gql(
      'mutation($input:BookAppointmentInput!){bookAppointment(input:$input){_id status}}',
      { input: { ...bookingInput, ...changes } },
      id,
    );
  const login = () =>
    request(app.getHttpServer()).post('/member/login').send({
      memberEmail: 'patient@example.test',
      memberPassword: 'disposable-test-password',
    });
  const assertInvariant = async (id: Types.ObjectId) => {
    const member = await db().collection('members').findOne({ _id: id });
    const scope = id.equals(patient)
      ? { patientId: id }
      : id.equals(doctor)
        ? { doctorId: id }
        : { clinicId: id };
    if (member!.memberStatus === 'DELETED') {
      expect(
        await db()
          .collection('appointments')
          .countDocuments({
            ...scope,
            status: { $in: ['PENDING', 'CONFIRMED'] },
            endsAt: { $gt: new Date() },
          }),
      ).toBe(0);
      expect(
        await db()
          .collection('waitlists')
          .countDocuments({
            ...scope,
            status: { $in: ['ACTIVE', 'NOTIFICATION_ONLY'] },
            startsAt: { $gt: new Date() },
          }),
      ).toBe(0);
      expect(
        await db()
          .collection('member_sessions')
          .countDocuments({ memberId: id }),
      ).toBe(0);
    }
  };

  it.each([patient, doctor, clinic])(
    'soft deletes a ready account %s and retains its record/history',
    async (id) => {
      const history = row('COMPLETED');
      await db().collection('appointments').insertOne(history);
      const result = await remove(id);
      expect(result.body.errors).toBeUndefined();
      expect(result.body.data.updateMember).toEqual({
        member: null,
        requiresLogin: true,
        imageCleanupPending: false,
      });
      const saved = await db().collection('members').findOne({ _id: id });
      expect(saved).toMatchObject({
        memberStatus: 'DELETED',
        authVersion: 1,
        __v: 1,
      });
      expect(saved!.deletedAt).toBeInstanceOf(Date);
      expect(
        await db().collection('appointments').findOne({ _id: history._id }),
      ).toBeTruthy();
      expect((await ready(id)).body.errors[0].extensions.code).toBe(
        'UNAUTHENTICATED',
      );
      expect((await remove(id)).body.errors[0].extensions.code).toBe(
        'UNAUTHENTICATED',
      );
    },
  );

  it.each(['PENDING', 'CONFIRMED'])(
    'blocks %s appointments for all participants and leaves account state intact',
    async (status) => {
      await db().collection('appointments').insertOne(row(status));
      for (const id of [patient, doctor, clinic]) {
        const result = await remove(id);
        expect(result.body.errors[0].extensions).toMatchObject({
          code: 'CONFLICT',
          accountDeletion: {
            reason: 'ACCOUNT_DELETION_BLOCKED',
            appointmentCount: 1,
            waitlistCount: 0,
          },
        });
        expect(
          (await db().collection('members').findOne({ _id: id }))!.memberStatus,
        ).toBe('ACTIVE');
      }
    },
  );

  it.each(['ACTIVE', 'NOTIFICATION_ONLY'])(
    'blocks live %s waitlists with role-appropriate actions',
    async (status) => {
      await db().collection('waitlists').insertOne(wait(status));
      for (const id of [patient, doctor, clinic]) {
        const result = (await ready(id)).body.data.accountDeletionReadiness;
        expect(result).toMatchObject({ ready: false, waitlistCount: 1 });
        expect(result.waitlists.entries[0].permittedAction).toBe(
          id.equals(patient) ? 'CANCEL_WAITLIST' : 'NONE',
        );
        expect(
          (await remove(id)).body.errors[0].extensions.accountDeletion
            .waitlistCount,
        ).toBe(1);
      }
    },
  );

  it.each(['CANCELED', 'COMPLETED', 'NO_SHOW'])(
    'retains terminal appointment %s',
    async (status) => {
      await db().collection('appointments').insertOne(row(status));
      expect((await ready()).body.data.accountDeletionReadiness.ready).toBe(
        true,
      );
    },
  );
  it.each(['FULFILLED', 'WITHDRAWN', 'EXPIRED', 'INELIGIBLE'])(
    'retains terminal waitlist %s',
    async (status) => {
      await db().collection('waitlists').insertOne(wait(status));
      expect((await ready()).body.data.accountDeletionReadiness.ready).toBe(
        true,
      );
    },
  );

  it('handles in-progress visits, elapsed legacy visits, started waitlists and committed cleanup', async () => {
    const now = Date.now();
    const active = row('CONFIRMED', {
      startsAt: new Date(now - 60000),
      endsAt: new Date(now + 60000),
    });
    await db()
      .collection('appointments')
      .insertMany([
        active,
        row('PENDING', { startsAt: new Date(0), endsAt: new Date(1800000) }),
      ]);
    await db()
      .collection('waitlists')
      .insertMany([
        wait('ACTIVE', { startsAt: new Date(0), endsAt: new Date(1800000) }),
        wait('NOTIFICATION_ONLY'),
      ]);
    await db()
      .collection<{
        _id: string;
        doctorId: Types.ObjectId;
        startsAt: Date;
        sequenceMax: number;
      }>('waitlist_cleanup')
      .insertOne({
        _id: `slot:${doctor}:${+startsAt}`,
        doctorId: doctor,
        startsAt,
        sequenceMax: 1,
      });
    const result = (await ready()).body.data.accountDeletionReadiness;
    expect(result).toMatchObject({
      appointmentCount: 1,
      waitlistCount: 0,
      ready: false,
    });
    expect(result.appointments.entries[0]).toMatchObject({
      permittedAction: 'NONE',
      resolutionReason: 'VISIT_IN_PROGRESS',
    });
    await db()
      .collection('appointments')
      .updateOne(
        { _id: active._id },
        {
          $set: {
            endsAt: new Date(now - 1),
            startsAt: new Date(now - 1800000),
          },
        },
      );
    expect((await remove()).body.errors).toBeUndefined();
  });

  it.each([
    ['appointments', { status: 'UNKNOWN' }],
    ['appointments', { endsAt: null }],
    ['appointments', { startsAt: 'invalid' }],
    ['waitlists', { queueSequence: null }],
    ['waitlists', { queueSequence: 1.5 }],
  ])('fails closed on malformed %s records %s', async (collection, changes) => {
    await db()
      .collection(collection)
      .insertOne(
        collection === 'appointments'
          ? row('CONFIRMED', changes)
          : wait('ACTIVE', changes),
      );
    expect(
      (await ready()).body.errors[0].extensions.accountDeletion.reason,
    ).toBe('ACCOUNT_DELETION_DATA_UNRESOLVED');
    expect(
      (await remove()).body.errors[0].extensions.accountDeletion.reason,
    ).toBe('ACCOUNT_DELETION_DATA_UNRESOLVED');
  });

  it('counts all pages, rejects foreign cursors, and allows a resolved cursor anchor', async () => {
    // >200 proves the legacy capped REST list cannot decide readiness.
    const rows = Array.from({ length: 205 }, (_, n) =>
      row('PENDING', {
        startsAt: new Date(+startsAt + n * 1800000),
        endsAt: new Date(+endsAt + n * 1800000),
      }),
    );
    await db().collection('appointments').insertMany(rows);
    const first = (await ready(patient, { appointmentLimit: 2 })).body.data
      .accountDeletionReadiness;
    expect(first.appointmentCount).toBe(205);
    expect(first.appointments.entries).toHaveLength(2);
    const cursor = first.appointments.nextCursor;
    await db()
      .collection('appointments')
      .updateOne(
        { _id: new Types.ObjectId(cursor) },
        { $set: { status: 'CANCELED' } },
      );
    const next = (
      await ready(patient, { appointmentAfter: cursor, appointmentLimit: 2 })
    ).body.data.accountDeletionReadiness;
    expect(next.appointmentCount).toBe(204);
    expect(next.appointments.entries).toHaveLength(2);
    const empty = (
      await ready(patient, { appointmentAfter: String(rows[204]._id) })
    ).body.data.accountDeletionReadiness;
    expect(empty.appointments.entries).toEqual([]);
    expect(empty.ready).toBe(false);
    expect(
      (await ready(other, { appointmentAfter: cursor })).body.errors[0]
        .extensions.code,
    ).toBe('BAD_USER_INPUT');
  });

  it('scopes commitments by stored relationship across affiliation changes and omits private fields', async () => {
    await db()
      .collection('members')
      .updateOne({ _id: doctor }, { $set: { clinicId: new Types.ObjectId() } });
    await db().collection('appointments').insertOne(row());
    expect(
      (await ready(doctor)).body.data.accountDeletionReadiness.appointmentCount,
    ).toBe(1);
    const result = (await ready(clinic)).body.data.accountDeletionReadiness
      .appointments.entries[0];
    expect(result).toMatchObject({
      clinicName: 'Test clinic',
      clinicTimezone: 'Asia/Seoul',
      permittedAction: 'CANCEL_BOOKING',
    });
    expect(Object.keys(result)).not.toContain('patientId');
    expect((await ready(other)).body.data.accountDeletionReadiness.ready).toBe(
      true,
    );
  });

  it('detaches more than 100 pending/approved active and suspended doctors atomically', async () => {
    const ids = Array.from({ length: 105 }, () => new Types.ObjectId());
    await db()
      .collection('members')
      .insertMany(
        ids.map((_id, n) => ({
          _id,
          memberType: 'DOCTOR',
          memberStatus: n % 2 ? 'ACTIVE' : 'SUSPENDED',
          clinicId: clinic,
          doctorClinicStatus: n % 3 ? 'APPROVED' : 'PENDING',
          memberNick: `doc_${_id}`,
          memberNickNormalized: `doc_${_id}`,
          __v: 0,
        })),
      );
    expect(
      (await ready(clinic)).body.data.accountDeletionReadiness
        .affiliationImpactCount,
    ).toBe(106);
    expect((await remove(clinic)).body.errors).toBeUndefined();
    expect(
      await db()
        .collection('members')
        .countDocuments({ clinicId: clinic, doctorClinicStatus: 'REMOVED' }),
    ).toBe(106);
    expect(
      await db()
        .collection('members')
        .countDocuments({ _id: { $in: ids }, __v: 1 }),
    ).toBe(105);
    expect(
      await db()
        .collection('members')
        .countDocuments({ _id: { $in: ids }, memberStatus: 'DELETED' }),
    ).toBe(0);
  });

  it.each([
    { memberStatus: 'ACTIVE', deletionAgreement: true },
    { memberStatus: 'SUSPENDED', deletionAgreement: true },
    { memberStatus: null, deletionAgreement: true },
    { memberStatus: 'DELETED' },
    { memberStatus: 'DELETED', deletionAgreement: false },
    { ...deletionInput, memberNick: 'renamed_user' },
    { ...deletionInput, memberImage: '' },
    { ...deletionInput, memberDesc: null },
    { deletionAgreement: true },
    { ...deletionInput, _id: String(other) },
  ])(
    'rejects forbidden, incomplete and mixed deletion inputs %s',
    async (input) => {
      expect((await remove(patient, input)).body.errors).toBeTruthy();
      expect(
        (await db().collection('members').findOne({ _id: patient }))!
          .memberStatus,
      ).toBe('ACTIVE');
    },
  );

  it('rejects admin and unauthenticated requests', async () => {
    expect(
      (await remove(admin)).body.errors[0].extensions.accountDeletion.reason,
    ).toBe('ACCOUNT_DELETION_ROLE_FORBIDDEN');
    expect((await ready(admin)).body.errors[0].extensions.code).toBe(
      'FORBIDDEN',
    );
    const result = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: deleteMutation, variables: { input: deletionInput } });
    expect(result.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('retains ordinary profile updates and their response fields', async () => {
    const result = await gql(
      'mutation{updateMember(input:{memberFullName:"Updated name"}){member{memberFullName} requiresLogin imageCleanupPending}}',
      {},
    );
    expect(result.body.errors).toBeUndefined();
    expect(result.body.data.updateMember).toEqual({
      member: { memberFullName: 'Updated name' },
      requiresLogin: false,
      imageCleanupPending: false,
    });
  });

  it('invalidates every session and rejects login, refresh and public discovery after deletion', async () => {
    const first = await login();
    const second = await login();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(
      await db()
        .collection('member_sessions')
        .countDocuments({ memberId: patient }),
    ).toBe(2);
    expect((await remove()).body.errors).toBeUndefined();
    expect(
      await db()
        .collection('member_sessions')
        .countDocuments({ memberId: patient }),
    ).toBe(0);
    expect((await login()).status).toBe(401);
    expect(
      (
        await request(app.getHttpServer())
          .post('/member/refresh')
          .send({ refreshToken: first.body.refreshToken })
      ).status,
    ).toBe(401);
    expect(
      (
        await gql(
          'query($id:ID!){getMember(id:$id){_id}}',
          { id: String(patient) },
          other,
        )
      ).body.errors,
    ).toBeTruthy();
    expect(
      await app.get(MemberService).usernameAvailability(`user_${patient}`),
    ).toMatchObject({ available: false });
  });

  it('supports a Google member without a password and retains provider identity', async () => {
    await db()
      .collection('members')
      .updateOne(
        { _id: patient },
        {
          $set: {
            authProvider: 'GOOGLE',
            googleId: 'disposable-google-identity',
          },
          $unset: { memberPassword: '' },
        },
      );
    expect((await remove()).body.errors).toBeUndefined();
    expect(
      (await db().collection('members').findOne({ _id: patient }))!.googleId,
    ).toBe('disposable-google-identity');
  });

  it('rolls back member and affiliation writes when session invalidation fails', async () => {
    const model = connection.model('MemberSession');
    jest
      .spyOn(model, 'deleteMany')
      .mockRejectedValueOnce(new Error('synthetic write failure'));
    expect(
      (await remove(clinic)).body.errors[0].extensions.accountDeletion.reason,
    ).toBe('ACCOUNT_DELETION_UNAVAILABLE');
    expect(
      (await db().collection('members').findOne({ _id: clinic }))!.memberStatus,
    ).toBe('ACTIVE');
    expect(
      (await db().collection('members').findOne({ _id: doctor }))!
        .doctorClinicStatus,
    ).toBe('APPROVED');
  });

  it.each([patient, doctor, clinic])(
    'serializes deletion with booking for %s',
    async (id) => {
      const results = await Promise.all([remove(id), booking()]);
      expect(results.some((result) => !result.body.errors)).toBe(true);
      await assertInvariant(id);
      const current = await db().collection('members').findOne({ _id: id });
      if (current!.memberStatus === 'ACTIVE')
        expect(
          results[0].body.errors[0].extensions.accountDeletion.reason,
        ).toBe('ACCOUNT_DELETION_BLOCKED');
    },
  );

  it('serializes deletion with staff booking and legacy REST booking', async () => {
    await Promise.all([
      remove(clinic),
      gql(
        'mutation($input:ClinicAppointmentInput!){createClinicAppointment(input:$input){_id}}',
        {
          input: {
            doctorId: String(doctor),
            patientId: String(patient),
            startsAt: startsAt.toISOString(),
            specialty: 'CARDIOLOGIST',
            source: 'PHONE',
          },
        },
        clinic,
      ),
      request(app.getHttpServer())
        .post('/appointment/bookAppointment')
        .set('Authorization', `Bearer ${tokens.get(String(other))}`)
        .send(bookingInput),
    ]);
    await assertInvariant(clinic);
  });

  it.each(['login', 'refresh', 'profile', 'delete'] as const)(
    'serializes deletion with concurrent %s',
    async (operation) => {
      const original = await login();
      const concurrent =
        operation === 'login'
          ? login()
          : operation === 'refresh'
            ? request(app.getHttpServer())
                .post('/member/refresh')
                .send({ refreshToken: original.body.refreshToken })
            : operation === 'profile'
              ? gql(
                  'mutation{updateMember(input:{memberFullName:"Concurrent edit"}){requiresLogin}}',
                  {},
                )
              : remove();
      const results = await Promise.all([remove(), concurrent]);
      if (operation === 'delete') {
        expect(results.filter((result) => !result.body.errors)).toHaveLength(1);
        expect(
          results.find((result) => result.body.errors)!.body.errors[0]
            .extensions.code,
        ).toBe('UNAUTHENTICATED');
      } else expect(results[0].body.errors).toBeUndefined();
      await assertInvariant(patient);
      const second = results[1];
      if (second.body.accessToken)
        await expect(
          app
            .get(MemberService)
            .authenticateAccessToken(second.body.accessToken),
        ).rejects.toThrow();
    },
  );

  it.each([patient, doctor, clinic])(
    'rejects a booking waiting behind deletion of %s',
    async (id) => {
      const commitments = app.get(AccountDeletionCommitmentService);
      const original = commitments.read.bind(commitments);
      let entered!: () => void;
      let release!: () => void;
      const atRead = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      jest
        .spyOn(commitments, 'read')
        .mockImplementationOnce(async (...args) => {
          const state = await original(...args);
          entered();
          await resume;
          return state;
        });
      const deletion = remove(id).then((result) => result);
      await atRead;
      const pendingBooking = booking().then((result) => result);
      release();
      const [deleted, booked] = await Promise.all([deletion, pendingBooking]);
      expect(deleted.body.errors).toBeUndefined();
      expect(booked.body.errors).toBeTruthy();
      await assertInvariant(id);
    },
  );

  it('serializes patient deletion with waitlist enrollment', async () => {
    expect((await booking(other)).body.errors).toBeUndefined();
    process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
    const [deleted, joined] = await Promise.all([
      remove(),
      gql(
        'mutation($input:JoinWaitlistInput!){joinWaitlist(input:$input){_id}}',
        { input: { ...bookingInput, automaticBookingConsent: true } },
      ),
    ]);
    expect(!deleted.body.errors || !joined.body.errors).toBe(true);
    await assertInvariant(patient);
    if (deleted.body.errors)
      expect(deleted.body.errors[0].extensions.accountDeletion.reason).toBe(
        'ACCOUNT_DELETION_BLOCKED',
      );
  });

  it('keeps deletion blocked throughout a concurrent commitment replacement', async () => {
    const booked = (await booking()).body.data.bookAppointment;
    const original = await db()
      .collection('appointments')
      .findOne({ _id: new Types.ObjectId(booked._id) });
    process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
    process.env.COMMITMENT_REPLACEMENT_ENABLED = 'true';
    const [deleted, replaced] = await Promise.all([
      remove(),
      gql(
        'mutation($input:ReplaceCommitmentInput!){replaceCommitment(input:$input){appointment{_id}}}',
        {
          input: {
            originalKind: 'APPOINTMENT',
            originalId: booked._id,
            originalVersion: original!.version,
            destinationKind: 'APPOINTMENT',
            destination: {
              ...bookingInput,
              startsAt: new Date(+startsAt + 86400000).toISOString(),
            },
          },
        },
      ),
    ]);
    expect(deleted.body.errors[0].extensions.accountDeletion.reason).toBe(
      'ACCOUNT_DELETION_BLOCKED',
    );
    expect(replaced.body.errors).toBeUndefined();
    expect(
      (await ready()).body.data.accountDeletionReadiness.appointmentCount,
    ).toBe(1);
  });

  it('keeps deletion blocked during allocation and rejects later allocation to a deleted patient', async () => {
    const occupied = (await booking(other)).body.data.bookAppointment;
    process.env.WAITLIST_ENROLLMENT_ENABLED = 'true';
    process.env.WAITLIST_NOTIFICATIONS_ENABLED = 'true';
    process.env.WAITLIST_LIFECYCLE_ENABLED = 'true';
    process.env.WAITLIST_PROMOTION_ENABLED = 'true';
    const joined = await gql(
      'mutation($input:JoinWaitlistInput!){joinWaitlist(input:$input){_id}}',
      { input: { ...bookingInput, automaticBookingConsent: true } },
    );
    expect(joined.body.errors).toBeUndefined();
    const canceled = await gql(
      'mutation($id:ID!){cancelAppointment(id:$id){_id}}',
      { id: occupied._id },
      other,
    );
    expect(canceled.body.errors).toBeUndefined();
    const [deleted] = await Promise.all([
      remove(),
      app.get(AppointmentPromotionService).runOnce(),
    ]);
    expect(deleted.body.errors[0].extensions.accountDeletion.reason).toBe(
      'ACCOUNT_DELETION_BLOCKED',
    );
    const promoted = await db()
      .collection('appointments')
      .findOne({ patientId: patient, status: 'CONFIRMED' });
    expect(promoted).toBeTruthy();
    const cancelPromoted = await gql(
      'mutation($id:ID!){cancelAppointment(id:$id){_id}}',
      { id: String(promoted!._id) },
    );
    expect(cancelPromoted.body.errors).toBeUndefined();
    expect((await remove()).body.errors).toBeUndefined();
    await app.get(AppointmentPromotionService).runOnce();
    await assertInvariant(patient);
  });

  it('shows migration resolution for a future legacy booking without a version', async () => {
    await db()
      .collection('appointments')
      .insertOne(row('CONFIRMED', { version: null }));
    const result = (await ready()).body.data.accountDeletionReadiness;
    expect(result.appointmentCount).toBe(1);
    expect(result.appointments.entries[0]).toMatchObject({
      permittedAction: 'NONE',
      resolutionReason: 'LEGACY_RESOLUTION_REQUIRED',
    });
  });

  it('uses exact server time boundaries without changing the database driver clock', async () => {
    await db().collection('appointments').insertOne(row());
    await db().collection('waitlists').insertOne(wait());
    const session = await connection.startSession({ snapshot: true });
    try {
      const service = app.get(AccountDeletionCommitmentService);
      const principal = {
        _id: patient,
        memberType: MemberType.USER,
        authVersion: 0,
      };
      const atStart = await service.read(
        principal,
        new AccountDeletionPageInput(),
        session,
        startsAt,
      );
      expect(atStart.appointmentCount).toBe(1);
      expect(atStart.waitlistCount).toBe(0);
      const atEnd = await service.read(
        principal,
        new AccountDeletionPageInput(),
        session,
        endsAt,
      );
      expect(atEnd.appointmentCount).toBe(0);
    } finally {
      await session.endSession();
    }
  });

  it('surfaces unavailable storage as a safe error and rolls back deletion', async () => {
    jest
      .spyOn(connection.model('Appointment'), 'aggregate')
      .mockImplementationOnce(() => {
        throw new Error('synthetic private database payload');
      });
    const result = await remove();
    expect(result.body.errors[0].extensions.accountDeletion.reason).toBe(
      'ACCOUNT_DELETION_UNAVAILABLE',
    );
    expect(JSON.stringify(result.body)).not.toContain(
      'private database payload',
    );
    expect(
      (await db().collection('members').findOne({ _id: patient }))!
        .memberStatus,
    ).toBe('ACTIVE');
  });

  it('rejects malformed cleanup cutoffs instead of declaring readiness', async () => {
    await db().collection('waitlists').insertOne(wait());
    await db()
      .collection<{ _id: string; sequenceMax: unknown }>('waitlist_cleanup')
      .insertOne({ _id: `slot:${doctor}:${+startsAt}`, sequenceMax: null });
    expect(
      (await ready()).body.errors[0].extensions.accountDeletion.reason,
    ).toBe('ACCOUNT_DELETION_DATA_UNRESOLVED');
  });

  it.each(['EMAIL', 'GOOGLE'] as const)(
    'invalidates a %s session issued just before deletion commits',
    async (provider) => {
      const members = app.get(MemberService);
      if (provider === 'GOOGLE') {
        await db()
          .collection('members')
          .updateOne(
            { _id: patient },
            {
              $set: { authProvider: 'GOOGLE', googleId: 'race-google-user' },
              $unset: { memberPassword: '' },
            },
          );
        jest
          .spyOn(app.get(GoogleAuthService), 'verify')
          .mockResolvedValue({ sub: 'race-google-user' });
      }
      const model = connection.model('MemberSession');
      const create = model.create.bind(model);
      let entered!: () => void;
      let release!: () => void;
      const atInsert = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      jest.spyOn(model, 'create').mockImplementationOnce((async (
        ...args: Parameters<typeof create>
      ) => {
        const result = await create(...args);
        entered();
        await resume;
        return result;
      }) as typeof model.create);
      const issued =
        provider === 'GOOGLE'
          ? members.loginWithGoogle('fixture-token')
          : members.login({
              memberEmail: 'patient@example.test',
              memberPassword: 'disposable-test-password',
            });
      await atInsert;
      const deletion = remove().then((result) => result);
      release();
      const [credentials, result] = await Promise.all([issued, deletion]);
      expect(result.body.errors).toBeUndefined();
      await assertInvariant(patient);
      await expect(
        members.authenticateAccessToken(credentials.accessToken),
      ).rejects.toThrow();
      await expect(members.refresh(credentials.refreshToken)).rejects.toThrow();
    },
  );

  it.each([null, undefined])(
    'deletes a legacy member with authVersion %s and retains identifiers',
    async (version) => {
      await db()
        .collection('members')
        .updateOne(
          { _id: patient },
          version === undefined
            ? { $unset: { authVersion: '' } }
            : { $set: { authVersion: version } },
        );
      expect((await remove()).body.errors).toBeUndefined();
      expect(
        (await db().collection('members').findOne({ _id: patient }))!
          .authVersion,
      ).toBe(1);
      expect(
        (await db().collection('members').findOne({ _id: patient }))!
          .memberEmail,
      ).toBe('patient@example.test');
    },
  );

  it('serializes clinic deletion with affiliation review', async () => {
    await db()
      .collection('members')
      .updateOne({ _id: doctor }, { $set: { doctorClinicStatus: 'PENDING' } });
    const results = await Promise.all([
      remove(clinic),
      gql(
        'mutation($id:ID!){reviewDoctorAffiliation(doctorId:$id,approve:true)}',
        { id: String(doctor) },
        clinic,
      ),
    ]);
    expect(results[0].body.errors).toBeUndefined();
    expect(
      (await db().collection('members').findOne({ _id: doctor }))!
        .doctorClinicStatus,
    ).toBe('REMOVED');
  });

  it('serializes clinic deletion with doctor signup without partially consuming proof', async () => {
    const service = app.get(EmailVerificationService);
    const email = 'newdoctor@example.test';
    const challenge = await service.request({
      memberEmail: email,
      requestId: randomUUID(),
    });
    const proof = await service.verify({
      memberEmail: email,
      challengeId: challenge.challengeId,
      code: delivered.get(email)!,
    });
    const signup = request(app.getHttpServer())
      .post('/member/signup')
      .send({
        memberType: 'DOCTOR',
        memberEmail: email,
        memberNick: 'new_doctor',
        memberPassword: 'disposable-test-password',
        memberPhone: '+821055551234',
        clinicId: String(clinic),
        doctorSpecializations: ['CARDIOLOGIST'],
        professionalLicenseNumber: 'TEST-12345',
        emailVerificationToken: proof.emailVerificationToken,
      });
    const results = await Promise.all([remove(clinic), signup]);
    expect(results[0].body.errors).toBeUndefined();
    const created = await db()
      .collection('members')
      .findOne({ memberEmail: email });
    if (results[1].status === 201)
      expect(created!.doctorClinicStatus).toBe('REMOVED');
    else {
      expect(results[1].status).toBe(400);
      expect(results[1].body.message).toBe('An active clinic is required');
      expect(created).toBeNull();
      expect(
        (await db().collection(EMAIL_VERIFICATIONS).findOne({ email }))!
          .consumedAt,
      ).toBeUndefined();
    }
  });
});
