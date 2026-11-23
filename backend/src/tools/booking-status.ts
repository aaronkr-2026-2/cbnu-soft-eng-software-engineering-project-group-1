import 'reflect-metadata';
import { createConnection } from 'mongoose';
import { requireMongoUri } from '../database/database.config.js';
import { BookingMigrationService } from '../components/booking/booking-migration.service.js';
import { BookingCoordinationService } from '../components/booking/booking-coordination.service.js';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../schemas/booking-commitment.model.js';
import {
  BOOKING_POLICY,
  BOOKING_POLICY_ID,
  BOOKING_MIGRATION_VERSION,
  BookingPolicySchema,
} from '../schemas/booking-policy.model.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../schemas/appointment.model.js';
import MemberSchema, { MEMBER } from '../schemas/member.model.js';
import type { MemberEntity } from '../libs/types/member.types.js';

// Read-only: no AppModule, worker timers, automatic DDL or repair writes.
async function main() {
  const connection = await createConnection(requireMongoUri(), {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  }).asPromise();
  try {
    const db = connection.db!;
    const commitments = connection.model(
      BOOKING_COMMITMENT,
      BookingCommitmentSchema,
    );
    const coordination = new BookingCoordinationService(
      connection,
      connection.model(BOOKING_GATE, BookingGateSchema),
      commitments,
    );
    const migration = new BookingMigrationService(
      coordination,
      connection,
      connection.model(APPOINTMENT_MODEL_NAME, AppointmentSchema),
      connection.model<MemberEntity>(MEMBER, MemberSchema),
      commitments,
      connection.model(BOOKING_POLICY, BookingPolicySchema),
    );
    const now = new Date();
    const backlog = async (
      collection: string,
      filter: Record<string, unknown>,
      terminal: string,
    ) => {
      const rows = await db
        .collection(collection)
        .aggregate(
          [
            { $match: filter },
            {
              $group: {
                _id: null,
                pending: {
                  $sum: { $cond: [{ $eq: ['$state', 'PENDING'] }, 1, 0] },
                },
                processing: {
                  $sum: { $cond: [{ $eq: ['$state', 'PROCESSING'] }, 1, 0] },
                },
                retrying: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$state', terminal] },
                          { $gt: ['$attempts', 1] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                repeatedFailures: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$state', terminal] },
                          { $gte: ['$attempts', 5] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                expiredClaims: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$state', 'PROCESSING'] },
                          { $lte: ['$leaseUntil', now] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                oldestPendingAt: {
                  $min: {
                    $cond: [
                      { $in: ['$state', ['PENDING', 'PROCESSING']] },
                      '$occurredAt',
                      null,
                    ],
                  },
                },
              },
            },
            { $project: { _id: 0 } },
          ],
          { maxTimeMS: 10000 },
        )
        .toArray();
      return (
        rows[0] ?? {
          pending: 0,
          processing: 0,
          retrying: 0,
          repeatedFailures: 0,
          expiredClaims: 0,
          oldestPendingAt: null,
        }
      );
    };
    const [
      audit,
      policy,
      queueDepth,
      heldSlots,
      promotion,
      notifications,
      latency,
    ] = await Promise.all([
      migration.auditSnapshot(),
      db
        .collection<{ _id: string; state: string; migrationVersion: number }>(
          'booking_policy',
        )
        .findOne(
          { _id: BOOKING_POLICY_ID },
          { projection: { _id: 0, state: 1, migrationVersion: 1 } },
        ),
      db
        .collection('waitlists')
        .countDocuments({ status: { $in: ['ACTIVE', 'NOTIFICATION_ONLY'] } }),
      db
        .collection('booking_gates')
        .countDocuments({ allocationPending: true }),
      backlog('appointment_events', { type: 'SLOT_RELEASED' }, 'PROCESSED'),
      backlog('notification_outbox', {}, 'DELIVERED'),
      db
        .collection('appointment_events')
        .aggregate(
          [
            {
              $match: {
                type: 'SLOT_RELEASED',
                result: 'PROMOTED',
                processedAt: { $gte: new Date(+now - 86400000) },
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                averageMs: {
                  $avg: { $subtract: ['$processedAt', '$occurredAt'] },
                },
                maximumMs: {
                  $max: { $subtract: ['$processedAt', '$occurredAt'] },
                },
              },
            },
            { $project: { _id: 0 } },
          ],
          { maxTimeMS: 10000 },
        )
        .toArray(),
    ]);
    const consistent =
      !!policy &&
      policy.state === 'READY' &&
      policy.migrationVersion === BOOKING_MIGRATION_VERSION &&
      audit.issues.length === 0 &&
      audit.ledgerMatches &&
      audit.metadataMatches;
    console.log(
      JSON.stringify({
        checkedAt: now,
        policy,
        consistent,
        reconciliation: audit.summary,
        queueDepth,
        heldSlots,
        promotion,
        notifications,
        promotionLatencyLast24Hours: latency[0] ?? {
          count: 0,
          averageMs: null,
          maximumMs: null,
        },
      }),
    );
    if (!consistent) process.exitCode = 2;
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error(
      'Booking status unavailable. Check database configuration and the rehearsal record limit.',
    );
    process.exitCode = 1;
  });
