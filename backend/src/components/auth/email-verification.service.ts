import { HttpException, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type { ClientSession, Collection } from 'mongodb';
import type { Model } from 'mongoose';
import { MEMBER } from '../../schemas/member.model.js';
import {
  EMAIL_LIMITS,
  EMAIL_VERIFICATIONS,
  assertEmailVerificationStorage,
} from '../../schemas/email-verification.model.js';
import type { MemberEntity } from '../../libs/types/member.types.js';
import type {
  EmailSendLimit,
  EmailVerification,
} from '../../libs/types/email-verification.types.js';
import type {
  EmailVerificationRequestDto,
  EmailVerificationVerifyDto,
} from '../../libs/dto/member/email-verification.dto.js';
import {
  EmailDeliveryException,
  EmailDeliveryService,
} from './email-delivery.service.js';
import { verificationError as fail } from './email-verification-error.js';
import {
  DAY,
  LEASE,
  LIFETIME,
  MINUTE,
  countSend,
  resetInactive,
  seconds,
} from './email-verification-policy.js';

const opaque = () => randomBytes(32).toString('base64url');
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const invalid = () => fail(400, 'EMAIL_VERIFICATION_INVALID');
const unavailable = () => fail(503, 'EMAIL_VERIFICATION_UNAVAILABLE', 30);

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly delivery: EmailDeliveryService,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
  ) {}

  // Overridden only by controlled test clocks; never uses browser timestamps.
  now(): Date {
    return new Date();
  }
  private async storage() {
    const db = this.members?.db?.db;
    if (!db) throw unavailable();
    await assertEmailVerificationStorage(db);
    return {
      limits: db.collection<EmailSendLimit>(EMAIL_LIMITS),
      challenges: db.collection<EmailVerification>(EMAIL_VERIFICATIONS),
    };
  }
  private codeHash(email: string, id: string, code: string) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) throw unavailable();
    const key = createHmac('sha256', secret)
      .update('medconnect:email-code:v1')
      .digest();
    return createHmac('sha256', key)
      .update(JSON.stringify(['signup', email, id, code]))
      .digest('hex');
  }
  private async transaction<T>(
    callback: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    if (!this.members) throw unavailable();
    const session = await this.members.db.startSession();
    try {
      return await session.withTransaction(() => callback(session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        timeoutMS: 5_000,
      });
    } finally {
      await session.endSession();
    }
  }
  private async saveLimit(
    limits: Collection<EmailSendLimit>,
    limit: EmailSendLimit,
    session: ClientSession,
  ) {
    const version = limit.version;
    limit.version++;
    const result = await limits.replaceOne({ _id: limit._id, version }, limit, {
      session,
    });
    if (!result.modifiedCount) throw unavailable();
  }
  private async settle(
    limits: Collection<EmailSendLimit>,
    challenges: Collection<EmailVerification>,
    limit: EmailSendLimit,
    id: string,
    state: 'ACCEPTED' | 'AMBIGUOUS' | 'REJECTED',
    now: Date,
    session: ClientSession,
  ) {
    if (limit.pending?.id !== id) return;
    const row = await challenges.findOne(
      { _id: id, delivery: 'PENDING' },
      { session },
    );
    if (!row) throw unavailable();
    await challenges.updateOne(
      { _id: id, delivery: 'PENDING' },
      { $set: { delivery: state } },
      { session },
    );
    if (state !== 'REJECTED') {
      // A recovered lease uses its deadline, not the later recovery call's time.
      countSend(limit, now);
      limit.activeChallengeId = id;
    }
    delete limit.pending;
    await this.saveLimit(limits, limit, session);
  }

  async request(input: EmailVerificationRequestDto) {
    try {
      return await this.requestCode(input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw unavailable();
    }
  }
  private async requestCode(input: EmailVerificationRequestDto) {
    const email = input.memberEmail.trim().toLowerCase();
    const { limits, challenges } = await this.storage();
    const id = opaque();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = this.codeHash(email, id, code);
    // Seed once outside the transaction: duplicate concurrent upserts are harmless.
    try {
      await limits.updateOne(
        { _id: email },
        {
          $setOnInsert: {
            version: 0,
            initialSent: false,
            groupCount: 0,
            blockLevel: 0,
            blockedUntil: new Date(0),
            nextSendAt: new Date(0),
            lastSendAttemptAt: new Date(0),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    const reservation = await this.transaction(async (session) => {
      const now = this.now();
      let limit = (await limits.findOne({ _id: email }, { session }))!;
      if (limit.pending && +limit.pending.until <= +now) {
        await this.settle(
          limits,
          challenges,
          limit,
          limit.pending.id,
          'AMBIGUOUS',
          limit.pending.until,
          session,
        );
        limit = (await limits.findOne({ _id: email }, { session }))!;
      }
      resetInactive(limit, now);
      limit.lastSendAttemptAt = now;
      const old = await challenges.findOne(
        { email, requestId: input.requestId },
        { session },
      );
      let result: {
        send: boolean;
        row?: EmailVerification;
        error?: HttpException;
      };
      if (old) {
        if (old.delivery === 'PENDING')
          result = {
            send: false,
            error: fail(
              503,
              'EMAIL_VERIFICATION_UNAVAILABLE',
              Math.max(
                1,
                seconds(limit.pending?.until ?? limit.nextSendAt, now),
              ),
            ),
          };
        else if (old.delivery === 'REJECTED')
          result = {
            send: false,
            error: fail(
              503,
              'EMAIL_VERIFICATION_UNAVAILABLE',
              Math.max(1, seconds(limit.nextSendAt, now)),
            ),
          };
        else if (
          limit.activeChallengeId !== old._id ||
          +old.expiresAt <= +now ||
          old.verifiedAt
        )
          result = { send: false, error: invalid() };
        else result = { send: false, row: old };
      } else {
        const wait = Math.max(
          seconds(limit.blockedUntil, now),
          seconds(limit.nextSendAt, now),
          limit.pending ? seconds(limit.pending.until, now) : 0,
        );
        if (wait > 0)
          result = {
            send: false,
            error: fail(429, 'EMAIL_VERIFICATION_THROTTLED', wait),
          };
        else {
          limit.nextSendAt = new Date(+now + MINUTE);
          limit.pending = { id, until: new Date(+now + LEASE) };
          const row: EmailVerification = {
            _id: id,
            email,
            requestId: input.requestId,
            codeHash,
            createdAt: now,
            expiresAt: new Date(+now + LIFETIME),
            attempts: 0,
            delivery: 'PENDING',
            cleanupAt: new Date(+now + DAY),
          };
          await challenges.insertOne(row, { session });
          result = { send: true, row };
        }
      }
      await this.saveLimit(limits, limit, session);
      return {
        ...result,
        retryAfterSeconds: Math.max(
          seconds(limit.nextSendAt, now),
          seconds(limit.blockedUntil, now),
        ),
      };
    });
    if (reservation.error) throw reservation.error;
    if (!reservation.send)
      return this.challengeResponse(
        reservation.row!,
        reservation.retryAfterSeconds,
      );
    let state: 'ACCEPTED' | 'AMBIGUOUS' | 'REJECTED' = 'ACCEPTED';
    try {
      await this.delivery.sendVerificationCode(email, code);
    } catch (error) {
      state =
        error instanceof EmailDeliveryException &&
        error.deliveryOutcome !== 'UNKNOWN'
          ? 'REJECTED'
          : 'AMBIGUOUS';
    }
    const finalized = await this.transaction(async (session) => {
      const limit = (await limits.findOne({ _id: email }, { session }))!;
      const now = this.now();
      // Expired callbacks cannot re-finalize a recovered or newer reservation.
      if (limit.pending?.id === id) {
        const expired = +limit.pending.until <= +now;
        await this.settle(
          limits,
          challenges,
          limit,
          id,
          expired ? 'AMBIGUOUS' : state,
          expired ? limit.pending.until : now,
          session,
        );
      }
      const row = (await challenges.findOne({ _id: id }, { session }))!;
      return {
        row,
        active: limit.activeChallengeId === id,
        retry: Math.max(
          1,
          seconds(limit.nextSendAt, now),
          seconds(limit.blockedUntil, now),
        ),
      };
    });
    if (
      state !== 'ACCEPTED' ||
      !finalized.active ||
      finalized.row.delivery !== 'ACCEPTED'
    )
      throw fail(503, 'EMAIL_VERIFICATION_UNAVAILABLE', finalized.retry);
    return this.challengeResponse(finalized.row, finalized.retry);
  }
  private challengeResponse(row: EmailVerification, retryAfterSeconds: number) {
    return {
      challengeId: row._id,
      expiresInSeconds: seconds(row.expiresAt, this.now()),
      retryAfterSeconds,
    };
  }

  async verify(input: EmailVerificationVerifyDto) {
    try {
      const email = input.memberEmail.trim().toLowerCase();
      const { limits, challenges } = await this.storage();
      const expected = this.codeHash(email, input.challengeId, input.code);
      const token = opaque();
      const result = await this.transaction(async (session) => {
        const now = this.now();
        const limit = await limits.findOne({ _id: email }, { session });
        const row = await challenges.findOne(
          { _id: input.challengeId, email },
          { session },
        );
        if (
          !limit ||
          limit.activeChallengeId !== input.challengeId ||
          !row ||
          !['ACCEPTED', 'AMBIGUOUS'].includes(row.delivery) ||
          +row.expiresAt <= +now ||
          row.verifiedAt
        )
          return { error: invalid() };
        if (row.attempts >= 5)
          return { error: fail(400, 'EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED') };
        // Serialize against resend promotion, parallel guesses and verification.
        await this.saveLimit(limits, limit, session);
        if (
          !timingSafeEqual(
            Buffer.from(expected, 'hex'),
            Buffer.from(row.codeHash, 'hex'),
          )
        ) {
          await challenges.updateOne(
            { _id: row._id },
            { $inc: { attempts: 1 } },
            { session },
          );
          return {
            error:
              row.attempts === 4
                ? fail(400, 'EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED')
                : invalid(),
          };
        }
        await challenges.updateOne(
          { _id: row._id },
          {
            $set: {
              verifiedAt: now,
              proofHash: hash(token),
              proofExpiresAt: new Date(+now + LIFETIME),
              cleanupAt: new Date(Math.max(+row.cleanupAt, +now + LIFETIME)),
            },
          },
          { session },
        );
        return { token };
      });
      if (result.error) throw result.error;
      return {
        emailVerificationToken: result.token!,
        expiresInSeconds: LIFETIME / 1000,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw unavailable();
    }
  }

  async createVerifiedMember<T>(
    email: string,
    token: string | undefined,
    create: (session: ClientSession, verifiedAt: Date) => Promise<T>,
  ): Promise<T> {
    if (token === undefined) throw fail(400, 'EMAIL_VERIFICATION_REQUIRED');
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw invalid();
    try {
      const { challenges } = await this.storage();
      return await this.transaction(async (session) => {
        const now = this.now();
        const row = await challenges.findOneAndUpdate(
          {
            email: email.trim().toLowerCase(),
            proofHash: hash(token),
            proofExpiresAt: { $gt: now },
            consumedAt: { $exists: false },
            verifiedAt: { $exists: true },
          },
          { $set: { consumedAt: now } },
          { session, returnDocument: 'after' },
        );
        if (!row) throw invalid();
        return create(session, row.verifiedAt!);
      });
    } catch (error) {
      if (
        error instanceof HttpException ||
        (error as { code?: number }).code === 11000
      )
        throw error;
      throw unavailable();
    }
  }
}
