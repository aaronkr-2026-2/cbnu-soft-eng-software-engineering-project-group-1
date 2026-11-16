import type { Collection } from 'mongodb';
import type { RecoveryConfirmation } from '../../libs/types/password-recovery.types.js';
import {
  EmailDeliveryService,
  EmailDeliveryException,
} from './email-delivery.service.js';
import {
  LEASE,
  MINUTE,
  RECOVERY_MAX_DELIVERY_ATTEMPTS,
  newRecoveryToken,
} from './password-recovery-policy.js';

// Single-document leases make notification delivery independent of password writes.
// Unknown SMTP outcomes and expired leases are terminal to avoid automatic duplicates.
export async function deliverRecoveryConfirmation(
  jobs: Collection<RecoveryConfirmation>,
  delivery: EmailDeliveryService,
  clock: () => Date,
): Promise<'SENT' | 'FAILED' | 'RETRY' | null> {
  const now = clock();
  const abandoned = await jobs.findOneAndUpdate(
    {
      $or: [
        { state: 'LEASED', 'lease.until': { $lte: now } },
        { state: 'QUEUED', expiresAt: { $lte: now } },
        { state: 'QUEUED', attempts: { $gte: RECOVERY_MAX_DELIVERY_ATTEMPTS } },
      ],
    },
    { $set: { state: 'FAILED' }, $unset: { lease: '' } },
    { returnDocument: 'after' },
  );
  if (abandoned) return 'FAILED';
  const leaseId = newRecoveryToken();
  const job = await jobs.findOneAndUpdate(
    {
      state: 'QUEUED',
      nextAttemptAt: { $lte: now },
      expiresAt: { $gt: now },
      attempts: { $lt: RECOVERY_MAX_DELIVERY_ATTEMPTS },
    },
    {
      $set: {
        state: 'LEASED',
        lease: { id: leaseId, until: new Date(+now + LEASE) },
      },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1, _id: 1 }, returnDocument: 'after' },
  );
  if (!job) return null;
  let outcome: 'SENT' | 'FAILED' | 'RETRY' = 'SENT';
  try {
    await delivery.sendPasswordChanged(job.email);
  } catch (error) {
    outcome =
      error instanceof EmailDeliveryException &&
      error.deliveryOutcome !== 'UNKNOWN'
        ? 'RETRY'
        : 'FAILED';
  }
  const finished = clock();
  if (+finished >= +job.lease!.until || +finished >= +job.expiresAt)
    outcome = 'FAILED';
  const nextAttemptAt = new Date(+finished + MINUTE * job.attempts);
  if (
    outcome === 'RETRY' &&
    (job.attempts >= RECOVERY_MAX_DELIVERY_ATTEMPTS ||
      +nextAttemptAt >= +job.expiresAt)
  )
    outcome = 'FAILED';
  const saved = await jobs.updateOne(
    { _id: job._id, state: 'LEASED', 'lease.id': leaseId },
    {
      $set: { state: outcome === 'RETRY' ? 'QUEUED' : outcome, nextAttemptAt },
      $unset: { lease: '' },
    },
  );
  return saved.modifiedCount ? outcome : null;
}
