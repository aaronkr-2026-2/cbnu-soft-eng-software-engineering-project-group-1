import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { createConnection, mongo, Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { BookingCoordinationService } from '../src/components/booking/booking-coordination.service.js';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../src/schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../src/schemas/booking-commitment.model.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../src/schemas/appointment.model.js';
import { DoctorSpecialization } from '../src/libs/enum/member.enum.js';
import type {
  BookingCommitment,
  BookingScope,
} from '../src/libs/types/booking.types.js';

if (
  process.env.BOOKING_TEST_DISPOSABLE !== '1' ||
  !process.env.BOOKING_TEST_URI?.startsWith('mongodb://127.0.0.1:')
) {
  throw new Error(
    'Run npm run test:booking:integration to own a disposable MongoDB fixture',
  );
}
const start = new Date('2035-01-01T01:00:00Z');
const id = () => new Types.ObjectId();
const later = (ms: number) => new Date(start.getTime() + ms);
const makeEntry = (
  overrides: Partial<BookingCommitment> = {},
): BookingCommitment => ({
  kind: 'APPOINTMENT',
  commitmentId: id(),
  patientId: id(),
  clinicId: id(),
  doctorId: id(),
  specialty: DoctorSpecialization.CARDIOLOGIST,
  startsAt: start,
  endsAt: later(30 * 60_000),
  ...overrides,
});
const scopeFor = (...entries: BookingCommitment[]): BookingScope => ({
  patientIds: entries.map((x) => x.patientId),
  slots: entries,
});
const serviceFor = (connection: Connection) =>
  new BookingCoordinationService(
    connection,
    connection.model(BOOKING_GATE, BookingGateSchema),
    connection.model(BOOKING_COMMITMENT, BookingCommitmentSchema),
  );

describe('Booking coordination on a real disposable replica set', () => {
  let connection: Connection;
  let otherConnection: Connection;
  let service: BookingCoordinationService;
  let other: BookingCoordinationService;
  const dbName = `booking_coordination_test_${randomUUID().replaceAll('-', '')}`;

  beforeAll(async () => {
    connection = await createConnection(process.env.BOOKING_TEST_URI!, {
      dbName,
      autoIndex: false,
    }).asPromise();
    otherConnection = await createConnection(process.env.BOOKING_TEST_URI!, {
      dbName,
      autoIndex: false,
    }).asPromise();
    service = serviceFor(connection);
    other = serviceFor(otherConnection);
    otherConnection.model(APPOINTMENT_MODEL_NAME, AppointmentSchema);
    await connection
      .model(APPOINTMENT_MODEL_NAME, AppointmentSchema)
      .createCollection();
    await connection.model(APPOINTMENT_MODEL_NAME).createIndexes();
    await connection.db!.createCollection('test_outbox');
  });
  afterAll(async () => {
    await otherConnection?.close();
    await connection?.close();
  });
  beforeEach(async () => {
    for (const name of [
      'booking_commitments',
      'booking_gates',
      'appointments',
      'test_outbox',
    ]) {
      await connection.db!.collection(name).deleteMany({});
    }
  });

  const save = (entry: BookingCommitment, coordinator = service) =>
    coordinator.run(scopeFor(entry), async (tx) => {
      await tx.reserve(entry);
      if (entry.kind === 'APPOINTMENT') {
        await (coordinator === other ? otherConnection : connection)
          .model(APPOINTMENT_MODEL_NAME)
          .create(
            [
              {
                _id: entry.commitmentId,
                patientId: entry.patientId,
                clinicId: entry.clinicId,
                doctorId: entry.doctorId,
                startsAt: entry.startsAt,
                endsAt: entry.endsAt,
                status: 'CONFIRMED',
              },
            ],
            { session: tx.session },
          );
      }
      return entry.commitmentId.toHexString();
    });

  it.each([
    ['APPOINTMENT', 'APPOINTMENT'],
    ['APPOINTMENT', 'WAITLIST'],
    ['WAITLIST', 'APPOINTMENT'],
    ['WAITLIST', 'WAITLIST'],
  ] as const)(
    'serializes cross-doctor %s / %s commitments on first use',
    async (a, b) => {
      const first = makeEntry({ kind: a });
      const second = makeEntry({
        kind: b,
        patientId: first.patientId,
        clinicId: first.clinicId,
        startsAt: later(23 * 3600_000 + 30 * 60_000),
        endsAt: later(24 * 3600_000),
      });
      const result = await Promise.allSettled([
        save(first),
        save(second, other),
      ]);
      expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(result.find((x) => x.status === 'rejected')).toMatchObject({
        reason: expect.any(ConflictException),
      });
      expect(
        await connection.db!.collection('booking_commitments').countDocuments(),
      ).toBe(1);
    },
  );

  it('allows exactly 24 hours, but rejects one millisecond inside the boundary', async () => {
    const first = makeEntry();
    await save(first);
    await expect(
      save(
        makeEntry({
          patientId: first.patientId,
          clinicId: first.clinicId,
          startsAt: later(24 * 3600_000 - 1),
          endsAt: later(24 * 3600_000 + 30 * 60_000 - 1),
        }),
      ),
    ).rejects.toThrow('within 24 hours');
    await expect(
      save(
        makeEntry({
          patientId: first.patientId,
          clinicId: first.clinicId,
          startsAt: later(24 * 3600_000),
          endsAt: later(24 * 3600_000 + 30 * 60_000),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('prevents patient overlap across clinics and specialties with two clients', async () => {
    const first = makeEntry();
    const second = makeEntry({
      patientId: first.patientId,
      specialty: DoctorSpecialization.DENTIST,
    });
    const result = await Promise.allSettled([save(first), save(second, other)]);
    expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(result.find((x) => x.status === 'rejected')).toMatchObject({
      reason: expect.any(ConflictException),
    });
  });

  it('allows adjacent appointments at different clinics', async () => {
    const first = makeEntry();
    await save(first);
    await expect(
      save(
        makeEntry({
          patientId: first.patientId,
          startsAt: first.endsAt,
          endsAt: later(60 * 60_000),
        }),
      ),
    ).resolves.toBeDefined();
  });

  it('allows one doctor-slot winner among different patients and specialties', async () => {
    const first = makeEntry();
    const second = makeEntry({
      doctorId: first.doctorId,
      specialty: DoctorSpecialization.DENTIST,
    });
    const result = await Promise.allSettled([save(first), save(second, other)]);
    expect(result.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      await connection.db!.collection('appointments').countDocuments(),
    ).toBe(1);
  });

  it('rolls back replacement, appointment update and outbox on injected failure', async () => {
    const original = makeEntry();
    await save(original);
    const target = makeEntry({
      patientId: original.patientId,
      clinicId: original.clinicId,
    });
    await expect(
      service.run(scopeFor(original, target), async (tx) => {
        await tx.release(original.kind, original.commitmentId);
        await connection
          .model(APPOINTMENT_MODEL_NAME)
          .updateOne(
            { _id: original.commitmentId },
            { $set: { status: 'CANCELED' } },
            { session: tx.session },
          );
        await tx.reserve(target);
        await connection
          .db!.collection('test_outbox')
          .insertOne({ event: 'slot-released' }, { session: tx.session });
        throw new Error('injected failure');
      }),
    ).rejects.toThrow('injected failure');
    expect(
      await connection
        .db!.collection('booking_commitments')
        .findOne({ commitmentId: original.commitmentId }),
    ).not.toBeNull();
    expect(
      await connection
        .db!.collection('booking_commitments')
        .findOne({ commitmentId: target.commitmentId }),
    ).toBeNull();
    expect(
      await connection
        .db!.collection('appointments')
        .findOne({ _id: original.commitmentId }),
    ).toMatchObject({ status: 'CONFIRMED' });
    expect(
      await connection.db!.collection('test_outbox').countDocuments(),
    ).toBe(0);
  });

  it('keeps an original commitment when the replacement destination conflicts', async () => {
    const original = makeEntry();
    const occupied = makeEntry();
    await save(original);
    await save(occupied);
    const target = makeEntry({
      patientId: original.patientId,
      doctorId: occupied.doctorId,
    });
    await expect(
      service.run(scopeFor(original, target), async (tx) => {
        await tx.release(original.kind, original.commitmentId);
        await tx.reserve(target);
      }),
    ).rejects.toThrow('already booked');
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(2);
  });

  it('holds manual allocation and rejects stale slot generations', async () => {
    const entry = makeEntry();
    const generation = await service.run(scopeFor(entry), (tx) =>
      tx.holdSlot(entry),
    );
    await expect(save(entry, other)).rejects.toThrow('allocation is pending');
    await expect(
      service.run(scopeFor(entry), (tx) =>
        tx.resolveSlot(entry, generation - 1),
      ),
    ).rejects.toThrow('stale');
    await expect(
      service.run(scopeFor(entry), (tx) => tx.reserve(entry, generation - 1)),
    ).rejects.toThrow('stale');
    await service.run(scopeFor(entry), async (tx) => {
      await tx.reserve(entry, generation);
      await tx.resolveSlot(entry, generation);
    });
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(1);
  });

  it('rejects a callback that writes a commitment outside its lock scope', async () => {
    const locked = makeEntry();
    await expect(
      service.run(scopeFor(locked), (tx) => tx.reserve(makeEntry())),
    ).rejects.toThrow('outside its locked scope');
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(0);
  });

  it('retains the existing appointment unique active-slot index', async () => {
    const model = connection.model(APPOINTMENT_MODEL_NAME);
    const row = makeEntry();
    const input = {
      doctorId: row.doctorId,
      clinicId: row.clinicId,
      patientId: row.patientId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
    await model.create({ ...input, status: 'PENDING' });
    await expect(
      model.create({ ...input, status: 'CONFIRMED' }),
    ).rejects.toMatchObject({ code: 11000 });
    await model.updateMany({}, { $set: { status: 'CANCELED' } });
    await expect(
      model.create({ ...input, status: 'CONFIRMED' }),
    ).resolves.toBeDefined();
  });

  it('refuses standalone MongoDB without running the callback', async () => {
    const standalone = await createConnection(
      process.env.BOOKING_TEST_STANDALONE_URI!,
      { dbName },
    ).asPromise();
    const callback = jest.fn();
    try {
      await expect(
        serviceFor(standalone).run(scopeFor(makeEntry()), callback),
      ).rejects.toThrow('requires a MongoDB replica set');
      expect(callback).not.toHaveBeenCalled();
    } finally {
      await standalone.close();
    }
  });

  it('refuses missing persistence without running the callback', async () => {
    const callback = jest.fn();
    await expect(
      new BookingCoordinationService().run(scopeFor(makeEntry()), callback),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(callback).not.toHaveBeenCalled();
  });

  it('connects DatabaseModule to MONGO_URI even when a development alias is present', async () => {
    const keys = ['MONGO_URI', 'MONGO_DEV', 'MONGO_PROD', 'NODE_ENV'] as const;
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    let module: TestingModule | undefined;
    try {
      process.env.MONGO_URI = process.env.BOOKING_TEST_URI!.replace(
        '/?',
        `/${dbName}?`,
      );
      process.env.MONGO_DEV = 'mongodb://127.0.0.1:1/should_never_connect';
      process.env.NODE_ENV = 'test';
      const { DatabaseModule } =
        await import('../src/database/database.module.js');
      module = await Test.createTestingModule({
        imports: [DatabaseModule],
      }).compile();
      expect(module.get<Connection>(getConnectionToken()).name).toBe(dbName);
      expect(
        await module
          .get<Connection>(getConnectionToken())
          .db!.admin()
          .command({ hello: 1 }),
      ).toMatchObject({ setName: 'bookingTest' });
    } finally {
      await module?.close();
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it('retries a transient transaction failure without retaining the first attempt writes', async () => {
    const entry = makeEntry();
    let attempts = 0;
    await service.run(scopeFor(entry), async (tx) => {
      await tx.reserve(entry);
      if (++attempts === 1) {
        throw new mongo.MongoServerError({
          message: 'injected transient error',
          errorLabels: ['TransientTransactionError'],
        });
      }
    });
    expect(attempts).toBe(2);
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(1);
  });

  it('bounds callback retries rather than retrying a permanently busy operation forever', async () => {
    let attempts = 0;
    await expect(
      service.run(scopeFor(makeEntry()), async () => {
        attempts++;
        throw new mongo.MongoServerError({
          message: 'injected repeated conflict',
          errorLabels: ['TransientTransactionError'],
        });
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(attempts).toBe(8);
    expect(
      await connection.db!.collection('booking_commitments').countDocuments(),
    ).toBe(0);
  });
});
