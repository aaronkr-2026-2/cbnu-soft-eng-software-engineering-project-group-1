import type { Notice } from '../../libs/types/notification.types.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import {
  Connection,
  Model,
  type ClientSession,
  type InferSchemaType,
} from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import {
  NOTIFICATION,
  NOTIFICATION_OUTBOX,
  NotificationSchema,
  NotificationOutboxSchema,
} from '../../schemas/notification.model.js';
import { BookingPolicyService } from '../booking/booking-policy.service.js';
import { waitlistNotificationsEnabled } from '../booking/booking.config.js';
import { MemberType } from '../../libs/enum/member.enum.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';
import type { MyNotificationsInput } from '../../libs/dto/notification/notification.js';

const projection = {
  _id: 1,
  type: 1,
  waitlistId: 1,
  doctorId: 1,
  clinicId: 1,
  startsAt: 1,
  endsAt: 1,
  appointmentId: 1,
  occurredAt: 1,
  readAt: 1,
};
const messages: Record<string, string> = {
  WAITLIST_JOINED:
    'You joined the waitlist. This does not reserve an appointment.',
  WAITLIST_BOOKING_CREATED:
    'Your waitlisted slot was booked. Open the appointment to check its current status.',
  SLOT_OPEN_FOR_MANUAL_BOOKING:
    'A slot opened for manual booking. It is not reserved for you; check current availability before booking.',
  WAITLIST_EXPIRED:
    'Your waitlist entry closed. Check current availability before booking.',
};
@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private initialization?: Promise<void>;
  private readonly logger = new Logger(NotificationService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private stopped = false;
  constructor(
    private readonly policy: BookingPolicyService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional()
    @InjectModel(NOTIFICATION_OUTBOX)
    private readonly outbox?: Model<
      InferSchemaType<typeof NotificationOutboxSchema>
    >,
    @Optional()
    @InjectModel(NOTIFICATION)
    private readonly inbox?: Model<InferSchemaType<typeof NotificationSchema>>,
  ) {}
  isEnabled() {
    return waitlistNotificationsEnabled();
  }
  async onModuleInit() {
    if (this.isEnabled()) {
      await this.policy.assertMigrated();
      await this.prepare();
      this.schedule();
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
  private schedule() {
    this.timer = setTimeout(() => {
      this.running = this.poll()
        .catch(() => {
          this.logger.error('WAITLIST_NOTICE_POLL_FAILED');
          return false;
        })
        .finally(() => {
          this.running = undefined;
          if (!this.stopped) this.schedule();
        });
    }, 1000);
    this.timer.unref();
  }
  private async poll() {
    let worked = false;
    for (let n = 0; n < 25 && !this.stopped; n++) {
      if (!(await this.runOnce())) break;
      worked = true;
    }
    return worked;
  }
  async prepare() {
    if (!this.outbox || !this.inbox)
      throw new ServiceUnavailableException('Notifications unavailable');
    this.initialization ??= (async () => {
      await this.outbox!.createCollection();
      await this.inbox!.createCollection();
      await this.outbox!.createIndexes();
      await this.inbox!.createIndexes();
    })().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    await this.initialization;
  }
  async emit(notices: Notice[], session: ClientSession) {
    if (!this.outbox)
      throw new ServiceUnavailableException('Notifications unavailable');
    if (!notices.length) return;
    await this.outbox.bulkWrite(
      notices.map(({ eventId, ...notice }) => ({
        updateOne: {
          filter: {
            _id: createHash('sha256')
              .update(`${eventId}:${notice.patientId}:IN_APP`)
              .digest('hex'),
          },
          update: {
            $setOnInsert: {
              ...notice,
              eventId,
              channel: 'IN_APP',
              state: 'PENDING',
              attempts: 0,
            },
          },
          upsert: true,
        },
      })),
      { session },
    );
  }
  private patient(member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException(
        'Only patients can read their notifications',
      );
    if (!this.inbox)
      throw new ServiceUnavailableException('Notifications unavailable');
    return this.inbox;
  }
  private view<T extends { type: string }>(row: T) {
    return {
      ...row,
      message:
        messages[row.type] ??
        'Open this notification to check current details.',
    };
  }
  async list(input: MyNotificationsInput, member: MemberPrincipal) {
    const model = this.patient(member),
      limit = input.limit ?? 20;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (input.after && !/^[a-f\d]{64}$/.test(input.after))
    )
      throw new BadRequestException('Invalid pagination');
    const cursor = input.after
      ? await model
          .findOne({ _id: input.after, patientId: member._id })
          .select({ occurredAt: 1 })
          .lean()
          .exec()
      : null;
    if (input.after && !cursor)
      throw new BadRequestException('Invalid pagination');
    const rows = await model
      .find({
        patientId: member._id,
        ...(input.unreadOnly ? { readAt: { $exists: false } } : {}),
        ...(cursor
          ? {
              $or: [
                { occurredAt: { $lt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, _id: { $lt: input.after } },
              ],
            }
          : {}),
      })
      .select(projection)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return {
      entries: rows.slice(0, limit).map((row) => this.view(row)),
      nextCursor: rows.length > limit ? rows[limit - 1]._id : null,
      unreadCount: await model.countDocuments({
        patientId: member._id,
        readAt: { $exists: false },
      }),
    };
  }
  async get(id: string, member: MemberPrincipal) {
    const model = this.patient(member);
    if (!/^[a-f\d]{64}$/.test(id))
      throw new BadRequestException('Invalid notification ID');
    const row = await model
      .findOne({ _id: id, patientId: member._id })
      .select(projection)
      .lean()
      .exec();
    if (!row) throw new NotFoundException('Notification not found');
    return this.view(row);
  }
  async read(id: string, member: MemberPrincipal) {
    const model = this.patient(member);
    if (!/^[a-f\d]{64}$/.test(id))
      throw new BadRequestException('Invalid notification ID');
    await model.updateOne(
      { _id: id, patientId: member._id, readAt: { $exists: false } },
      { $set: { readAt: new Date(Date.now()) } },
    );
    const row = await model
      .findOne({ _id: id, patientId: member._id })
      .select(projection)
      .lean()
      .exec();
    if (!row) throw new NotFoundException('Notification not found');
    return this.view(row);
  }
  async deliveryStatus(member: MemberPrincipal) {
    if (member.memberType !== MemberType.ADMIN)
      throw new ForbiddenException(
        'Only operators can inspect delivery status',
      );
    if (!this.outbox)
      throw new ServiceUnavailableException('Notifications unavailable');
    const [pending, processing, delivered, retrying, expiredClaims] =
      await Promise.all([
        this.outbox.countDocuments({ state: 'PENDING' }),
        this.outbox.countDocuments({ state: 'PROCESSING' }),
        this.outbox.countDocuments({ state: 'DELIVERED' }),
        this.outbox.countDocuments({
          state: 'PENDING',
          lastFailureCode: 'IN_APP_DELIVERY_RETRY',
        }),
        this.outbox.countDocuments({
          state: 'PROCESSING',
          leaseUntil: { $lte: new Date(Date.now()) },
        }),
      ]);
    return { pending, processing, delivered, retrying, expiredClaims };
  }
  async runOnce() {
    if (
      !this.isEnabled() ||
      this.stopped ||
      !this.outbox ||
      !this.inbox ||
      !this.connection
    )
      return false;
    await this.policy.assertMigrated();
    await this.prepare();
    const now = new Date(Date.now()),
      token = randomUUID();
    const row = await this.outbox
      .findOneAndUpdate(
        {
          $or: [
            {
              state: 'PENDING',
              $or: [
                { nextAttemptAt: { $exists: false } },
                { nextAttemptAt: { $lte: now } },
              ],
            },
            { state: 'PROCESSING', leaseUntil: { $lte: now } },
          ],
        },
        {
          $set: {
            state: 'PROCESSING',
            claimToken: token,
            leaseUntil: new Date(+now + 30_000),
          },
          $inc: { attempts: 1 },
        },
        { sort: { occurredAt: 1, _id: 1 }, returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!row) return false;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(
        async () => {
          const fenced = await this.outbox!.findOneAndUpdate(
            {
              _id: row._id,
              state: 'PROCESSING',
              claimToken: token,
              leaseUntil: { $gt: new Date(Date.now()) },
            },
            { $set: { leaseUntil: new Date(Date.now() + 30_000) } },
            { session, returnDocument: 'after' },
          )
            .lean()
            .exec();
          if (!fenced) return;
          const {
            _id,
            patientId,
            waitlistId,
            type,
            doctorId,
            clinicId,
            startsAt,
            endsAt,
            appointmentId,
            occurredAt,
          } = fenced;
          await this.inbox!.updateOne(
            { _id },
            {
              $setOnInsert: {
                patientId,
                waitlistId,
                type,
                doctorId,
                clinicId,
                startsAt,
                endsAt,
                appointmentId,
                occurredAt,
              },
            },
            { session, upsert: true },
          );
          await this.outbox!.updateOne(
            { _id, claimToken: token, state: 'PROCESSING' },
            {
              $set: { state: 'DELIVERED', deliveredAt: new Date(Date.now()) },
              $unset: {
                claimToken: 1,
                leaseUntil: 1,
                nextAttemptAt: 1,
                lastFailureCode: 1,
              },
            },
            { session },
          );
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          timeoutMS: 10000,
          maxCommitTimeMS: 5000,
        },
      );
    } catch {
      await this.outbox.updateOne(
        { _id: row._id, claimToken: token, state: 'PROCESSING' },
        {
          $set: {
            state: 'PENDING',
            lastFailureCode: 'IN_APP_DELIVERY_RETRY',
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(60000, 1000 * 2 ** Math.min(row.attempts ?? 1, 6)),
            ),
          },
          $unset: { claimToken: 1, leaseUntil: 1 },
        },
      );
    } finally {
      await session.endSession();
    }
    return true;
  }
}
