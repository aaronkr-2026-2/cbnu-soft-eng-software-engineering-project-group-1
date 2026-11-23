import {
  ApplicationConfig,
  environmentConfig,
} from '../../libs/config/application-config.service.js';
import {
  WorkerScheduler,
  type WorkerLoop,
} from '../../libs/scheduling/worker-scheduler.service.js';
import {
  Injectable,
  HttpException,
  Logger,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { ClientSession, Collection } from 'mongodb';
import { MEMBER } from '../../schemas/member.model.js';
import {
  RECOVERY_ADMISSION,
  RECOVERY_LIMITS,
  RECOVERY_REQUESTS,
  RECOVERY_TOKENS,
  RECOVERY_CONFIRMATIONS,
  assertPasswordRecoveryStorage,
} from '../../schemas/password-recovery.model.js';
import type { MemberEntity } from '../../libs/types/member.types.js';
import type {
  RecoveryAccepted,
  RecoveryRequest,
  RecoverySendLimit,
  RecoveryToken,
  RecoveryConfirmation,
  RecoveryResetResult,
} from '../../libs/types/password-recovery.types.js';
import type { RecoveryRequestDto } from '../../libs/dto/member/password-recovery.dto.js';
import { AuthProvider, MemberStatus } from '../../libs/enum/member.enum.js';
import {
  EmailDeliveryException,
  EmailDeliveryService,
} from './email-delivery.service.js';
import { recoveryError } from './password-recovery-error.js';
import {
  countSend,
  resetInactive,
  MINUTE,
  DAY,
  LEASE,
  RECOVERY_LIFETIME,
  RECOVERY_RETENTION,
  RECOVERY_MAX_DELIVERY_ATTEMPTS,
  newRecoveryToken,
  recoveryTokenHash,
  RECOVERY_TOKEN_PATTERN,
} from './password-recovery-policy.js';
import { deliverRecoveryConfirmation } from './password-recovery-confirmation.js';

const unavailable = () => recoveryError(503, 'PASSWORD_RECOVERY_UNAVAILABLE');
const accepted = (): RecoveryAccepted => ({ accepted: true });
type Storage = {
  admission: Collection<{ _id: string; version: number }>;
  limits: Collection<RecoverySendLimit>;
  requests: Collection<RecoveryRequest>;
  tokens: Collection<RecoveryToken>;
  confirmations: Collection<RecoveryConfirmation>;
};
type Outcome = 'ACCEPTED' | 'AMBIGUOUS' | 'REJECTED';

@Injectable()
export class PasswordRecoveryService
  implements OnModuleInit, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private ready?: Promise<Storage>;
  private loop?: WorkerLoop;
  private stopping = false;
  private inFlight?: Promise<void>;
  private readonly metrics = {
    queued: 0,
    accepted: 0,
    ambiguous: 0,
    rejected: 0,
    failures: 0,
    confirmationSent: 0,
    confirmationFailed: 0,
  };
  private preferConfirmation = true;

  constructor(
    private readonly scheduler: WorkerScheduler,
    private readonly delivery: EmailDeliveryService,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
    @Optional() private readonly config: ApplicationConfig = environmentConfig,
  ) {}

  now() {
    return new Date();
  }
  admissionCapacity() {
    return { limits: 10_000, requests: 20_000 };
  }
  getMetrics() {
    return { ...this.metrics };
  }

  private enabled() {
    try {
      return this.config.recoveryEnabled;
    } catch {
      throw unavailable();
    }
  }

  private collections(): Storage {
    const db = this.members?.db.db;
    if (!db) throw unavailable();
    return {
      admission: db.collection<{ _id: string; version: number }>(
        RECOVERY_ADMISSION,
      ),
      limits: db.collection<RecoverySendLimit>(RECOVERY_LIMITS),
      requests: db.collection<RecoveryRequest>(RECOVERY_REQUESTS),
      tokens: db.collection<RecoveryToken>(RECOVERY_TOKENS),
      confirmations: db.collection<RecoveryConfirmation>(
        RECOVERY_CONFIRMATIONS,
      ),
    };
  }

  private async storage() {
    if (!this.enabled()) throw unavailable();
    void this.config.recoveryOrigin;
    this.delivery.assertConfigured();
    this.ready ??= (async () => {
      const storage = this.collections();
      await assertPasswordRecoveryStorage(this.members!.db.db!);
      return storage;
    })();
    try {
      return await this.ready;
    } catch {
      this.ready = undefined;
      throw unavailable();
    }
  }

  private async transaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!this.members) throw unavailable();
    const session = await this.members.db.startSession();
    try {
      return await session.withTransaction(() => work(session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        timeoutMS: 5_000,
      });
    } finally {
      await session.endSession();
    }
  }

  private async saveLimit(
    storage: Storage,
    limit: RecoverySendLimit,
    session: ClientSession,
  ) {
    const version = limit.version;
    limit.version++;
    const result = await storage.limits.replaceOne(
      { _id: limit._id, version },
      limit,
      { session },
    );
    if (result.modifiedCount !== 1) throw unavailable();
  }

  // Same guard write serializes admissions before bounded counts across processes.
  // TTL deletions can free capacity; they cannot cause admission above the cap.
  private async guardCapacity(storage: Storage, session: ClientSession) {
    const guard = await storage.admission.updateOne(
      { _id: 'global' },
      { $inc: { version: 1 } },
      { session },
    );
    if (!guard.matchedCount) throw unavailable();
    const cap = this.admissionCapacity();
    const jobs = await storage.requests.countDocuments(
      {},
      { session, limit: cap.requests, hint: '_id_' },
    );
    const limits = await storage.limits.countDocuments(
      {},
      { session, limit: cap.limits, hint: '_id_' },
    );
    // This check precedes address lookups and applies even to idempotent retries.
    if (jobs >= cap.requests || limits >= cap.limits) throw unavailable();
  }

  async request(input: RecoveryRequestDto): Promise<RecoveryAccepted> {
    try {
      const storage = await this.storage();
      const email = input.memberEmail.trim().toLowerCase();
      const requestId = input.requestId.toLowerCase();
      const id = newRecoveryToken();
      const queued = await this.transaction(async (session) => {
        await this.guardCapacity(storage, session);
        const now = this.now();
        let limit = await storage.limits.findOne({ _id: email }, { session });
        const fresh = !limit;
        limit ??= {
          _id: email,
          version: 0,
          initialSent: false,
          groupCount: 0,
          blockLevel: 0,
          blockedUntil: new Date(0),
          nextSendAt: new Date(0),
          lastSendAttemptAt: new Date(0),
        };
        if (limit.pending && +limit.pending.until <= +now) {
          const pending = await storage.requests.findOne(
            { _id: limit.pending.id },
            { session },
          );
          if (pending?.state === 'LEASED') {
            countSend(limit, pending.lease!.until);
            await storage.requests.updateOne(
              { _id: pending._id, state: 'LEASED' },
              { $set: { state: 'AMBIGUOUS' }, $unset: { lease: '' } },
              { session },
            );
          } else if (pending?.state === 'QUEUED') {
            await storage.requests.updateOne(
              { _id: pending._id, state: 'QUEUED' },
              { $set: { state: 'EXPIRED' } },
              { session },
            );
          }
          delete limit.pending;
        }
        resetInactive(limit, now);
        limit.lastSendAttemptAt = now;
        const previous = await storage.requests.findOne(
          { email, requestId },
          { session },
        );
        let send = false;
        if (!previous) {
          send =
            !limit.pending &&
            +limit.blockedUntil <= +now &&
            +limit.nextSendAt <= +now;
          const row: RecoveryRequest = {
            _id: id,
            email,
            requestId,
            state: send ? 'QUEUED' : 'SUPPRESSED',
            attempts: 0,
            createdAt: now,
            expiresAt: new Date(+now + RECOVERY_LIFETIME),
            nextAttemptAt: now,
            cleanupAt: new Date(+now + RECOVERY_RETENTION),
          };
          await storage.requests.insertOne(row, { session });
          if (send) {
            limit.pending = { id, until: row.expiresAt };
            limit.nextSendAt = new Date(+now + MINUTE);
          }
        }
        if (fresh) await storage.limits.insertOne(limit, { session });
        else await this.saveLimit(storage, limit, session);
        return send;
      });
      if (queued) this.metrics.queued++;
      return accepted();
    } catch {
      throw unavailable();
    }
  }

  // The callback boundary keeps member/session writes with their owning feature.
  // Hash once outside retrying transactions, only after cheap token/account checks.
  async consumeReset(
    token: string,
    preparePassword: () => Promise<string>,
    replaceCredentials: (
      record: RecoveryToken,
      encoded: string,
      session: ClientSession,
    ) => Promise<boolean>,
  ): Promise<RecoveryResetResult> {
    const invalid = () => recoveryError(400, 'PASSWORD_RECOVERY_INVALID');
    try {
      const storage = await this.storage();
      if (!RECOVERY_TOKEN_PATTERN.test(token)) throw invalid();
      const digest = recoveryTokenHash(token);
      const current = () => ({
        tokenHash: digest,
        consumedAt: { $exists: false },
        expiresAt: { $gt: this.now() },
      });
      const initial = await storage.tokens.findOne(current());
      if (
        !initial ||
        !(await this.members!.exists({
          _id: initial._id,
          memberEmail: initial.email,
          authProvider: AuthProvider.EMAIL,
          memberStatus: MemberStatus.ACTIVE,
          deletedAt: null,
          $expr: {
            $eq: [{ $ifNull: ['$authVersion', 0] }, initial.authVersion],
          },
        }))
      )
        throw invalid();
      const encoded = await preparePassword();
      return await this.transaction(async (session) => {
        const now = this.now();
        const record = await storage.tokens.findOne(current(), { session });
        if (!record) throw invalid();
        const consumed = await storage.tokens.updateOne(
          { _id: record._id, ...current(), generation: record.generation },
          { $set: { consumedAt: now } },
          { session },
        );
        if (
          consumed.modifiedCount !== 1 ||
          !(await replaceCredentials(record, encoded, session))
        )
          throw invalid();
        const limit = await storage.limits.findOne(
          { _id: record.email },
          { session },
        );
        if (limit?.pending) {
          const pending = await storage.requests.findOne(
            { _id: limit.pending.id, state: 'LEASED' },
            { session },
          );
          // A link can be used after SMTP acceptance but before worker finalization.
          // Count that send once before canceling the lease, preserving resend policy.
          if (pending)
            countSend(limit, new Date(Math.min(+now, +pending.lease!.until)));
          delete limit.pending;
          await this.saveLimit(storage, limit, session);
        }
        await storage.requests.updateMany(
          { email: record.email, state: { $in: ['QUEUED', 'LEASED'] } },
          { $set: { state: 'CANCELED' }, $unset: { lease: '' } },
          { session },
        );
        await storage.confirmations.insertOne(
          {
            _id: record.generation,
            memberId: record._id,
            email: record.email,
            state: 'QUEUED',
            attempts: 0,
            createdAt: now,
            nextAttemptAt: now,
            expiresAt: new Date(+now + DAY),
            cleanupAt: new Date(+now + RECOVERY_RETENTION),
          },
          { session },
        );
        return { passwordChanged: true };
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        (error.getResponse() as { reason?: string })?.reason ===
          'PASSWORD_RECOVERY_INVALID'
      )
        throw invalid();
      // A final unknown commit outcome stays ambiguous; never claim a rollback.
      throw unavailable();
    }
  }

  private async claim(storage: Storage) {
    return this.transaction(async (session) => {
      const now = this.now();
      const job = await storage.requests.findOne(
        { state: 'QUEUED', nextAttemptAt: { $lte: now } },
        { session, sort: { nextAttemptAt: 1, _id: 1 } },
      );
      if (!job) return null;
      const limit = await storage.limits.findOne(
        { _id: job.email },
        { session },
      );
      if (!limit || limit.pending?.id !== job._id) {
        await storage.requests.updateOne(
          { _id: job._id, state: 'QUEUED' },
          { $set: { state: 'CANCELED' } },
          { session },
        );
        return null;
      }
      if (
        +job.expiresAt <= +now ||
        job.attempts >= RECOVERY_MAX_DELIVERY_ATTEMPTS
      ) {
        await storage.requests.updateOne(
          { _id: job._id },
          { $set: { state: 'EXPIRED' } },
          { session },
        );
        delete limit.pending;
        await this.saveLimit(storage, limit, session);
        return null;
      }
      limit.nextSendAt = new Date(+now + MINUTE);
      const member = await this.members!.findOne({
        memberEmail: job.email,
        authProvider: AuthProvider.EMAIL,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
        .select({ _id: 1, memberEmail: 1, authVersion: 1 })
        .session(session)
        .lean()
        .exec();
      if (!member) {
        // Count the virtual send too: quota state must not reveal account eligibility.
        countSend(limit, now);
        delete limit.pending;
        await storage.requests.updateOne(
          { _id: job._id },
          { $set: { state: 'SUPPRESSED' } },
          { session },
        );
        await this.saveLimit(storage, limit, session);
        return null;
      }
      const token = newRecoveryToken();
      const generation = newRecoveryToken();
      const until = new Date(+now + LEASE);
      const record: RecoveryToken = {
        _id: member._id,
        email: job.email,
        jobId: job._id,
        generation,
        tokenHash: recoveryTokenHash(token),
        authVersion: member.authVersion ?? 0,
        createdAt: now,
        expiresAt: job.expiresAt,
        cleanupAt: job.cleanupAt,
      };
      await storage.tokens.replaceOne({ _id: member._id }, record, {
        upsert: true,
        session,
      });
      await storage.requests.updateOne(
        { _id: job._id, state: 'QUEUED' },
        {
          $set: { state: 'LEASED', lease: { id: generation, until } },
          $inc: { attempts: 1 },
        },
        { session },
      );
      limit.pending = { id: job._id, until };
      limit.nextSendAt = new Date(+now + MINUTE);
      await this.saveLimit(storage, limit, session);
      return { job, token, generation };
    });
  }

  private async finish(
    storage: Storage,
    id: string,
    generation: string,
    outcome: Outcome,
    at?: Date,
  ) {
    return this.transaction(async (session) => {
      const now = at ?? this.now();
      const job = await storage.requests.findOne(
        { _id: id, state: 'LEASED', 'lease.id': generation },
        { session },
      );
      if (!job) return false;
      const limit = await storage.limits.findOne(
        { _id: job.email },
        { session },
      );
      if (!limit || limit.pending?.id !== id) return false;
      // Any stale completion after the lease deadline is ambiguous, never definitive.
      const expired = +job.lease!.until <= +now;
      const result = expired ? 'AMBIGUOUS' : outcome;
      if (result !== 'REJECTED')
        countSend(limit, expired ? job.lease!.until : now);
      const retryAt = new Date(Math.max(+now + MINUTE, +limit.nextSendAt));
      const retry =
        result === 'REJECTED' &&
        job.attempts < RECOVERY_MAX_DELIVERY_ATTEMPTS &&
        +retryAt < +job.expiresAt;
      if (retry) limit.pending = { id, until: job.expiresAt };
      else delete limit.pending;
      await storage.requests.updateOne(
        { _id: id, state: 'LEASED', 'lease.id': generation },
        {
          $set: { state: retry ? 'QUEUED' : result, nextAttemptAt: retryAt },
          $unset: { lease: '' },
        },
        { session },
      );
      if (result === 'REJECTED')
        await storage.tokens.deleteOne({ jobId: id, generation }, { session });
      await this.saveLimit(storage, limit, session);
      return result;
    });
  }

  private async processOne() {
    const storage = await this.storage();
    const confirm = async () => {
      const result = await deliverRecoveryConfirmation(
        storage.confirmations,
        this.delivery,
        () => this.now(),
      );
      if (result === 'SENT') this.metrics.confirmationSent++;
      if (result === 'FAILED') this.metrics.confirmationFailed++;
      return result !== null;
    };
    const first = this.preferConfirmation;
    this.preferConfirmation = !first;
    if (first && (await confirm())) return;
    const now = this.now();
    // Inactivity resets this policy after 24 hours, so obsolete rows can be reclaimed
    // without losing an active block/reservation. Native delete filters fence races.
    await storage.limits.deleteOne({
      lastSendAttemptAt: { $lte: new Date(+now - DAY) },
      blockedUntil: { $lte: now },
      pending: { $exists: false },
    });
    const stale = await storage.requests.findOne(
      { state: 'LEASED', 'lease.until': { $lte: now } },
      { sort: { 'lease.until': 1 } },
    );
    if (stale) {
      if (
        await this.finish(storage, stale._id, stale.lease!.id, 'AMBIGUOUS', now)
      )
        this.metrics.ambiguous++;
      return;
    }
    const claim = await this.claim(storage);
    if (!claim) {
      if (!first) await confirm();
      return;
    }
    let outcome: Outcome = 'ACCEPTED';
    try {
      await this.delivery.sendRecoveryLink(claim.job.email, claim.token);
    } catch (error) {
      outcome =
        error instanceof EmailDeliveryException &&
        error.deliveryOutcome !== 'UNKNOWN'
          ? 'REJECTED'
          : 'AMBIGUOUS';
    }
    const finalized = await this.finish(
      storage,
      claim.job._id,
      claim.generation,
      outcome,
    );
    if (finalized) {
      if (finalized === 'ACCEPTED') this.metrics.accepted++;
      else if (finalized === 'AMBIGUOUS') this.metrics.ambiguous++;
      else this.metrics.rejected++;
    }
  }

  runOnce(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.processOne()
      .catch(() => {
        this.metrics.failures++;
        this.logger.warn(
          'Password recovery worker could not process its next job',
        );
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  async onModuleInit() {
    if (!this.enabled()) return;
    await this.storage();
    this.loop = this.scheduler.start(
      'password-recovery-delivery',
      () => this.runOnce(),
      () =>
        this.logger.warn(
          'Password recovery worker could not process its next job',
        ),
      0,
    );
  }

  async onModuleDestroy() {
    await this.onApplicationShutdown();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    await this.loop?.stop();
    await this.inFlight;
  }
}
