import { NotificationService } from '../notification/notification.service.js';
import {
  WAITLIST_CLEANUP,
  WaitlistCleanupSchema,
} from '../../schemas/waitlist-cleanup.model.js';
import type { InferSchemaType } from 'mongoose';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ACTIVE_WAITLIST_STATUSES,
  WAITLIST,
} from '../../schemas/waitlist.model.js';
import {
  WaitlistStatus,
  CommitmentKind,
} from '../../libs/enum/appointment.enum.js';
import { MemberType } from '../../libs/enum/member.enum.js';
import type {
  BookingTarget,
  BookingSlot,
  BookingTransaction,
  WaitlistRecord,
} from '../../libs/types/booking.types.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';
import type { MyWaitlistInput } from '../../libs/dto/waitlist/waitlist.input.js';
import { BookingConflictException } from '../booking/booking-error.js';
import { MemberService } from '../member/member.service.js';

const fields = {
  _id: 1,
  patientId: 1,
  clinicId: 1,
  doctorId: 1,
  specialty: 1,
  startsAt: 1,
  endsAt: 1,
  status: 1,
  version: 1,
  automaticBookingConsent: 1,
  consentedAt: 1,
  consentPolicyVersion: 1,
  queueSequence: 1,
  appointmentId: 1,
  closedReason: 1,
  createdAt: 1,
  updatedAt: 1,
};

@Injectable()
export class WaitlistService {
  private initialization?: Promise<void>;
  constructor(
    private readonly members: MemberService,
    @Optional()
    @InjectModel(WAITLIST)
    private readonly entries?: Model<Omit<WaitlistRecord, '_id'>>,
    @Optional() private readonly notifications?: NotificationService,
    @Optional()
    @InjectModel(WAITLIST_CLEANUP)
    private readonly cleanup?: Model<
      InferSchemaType<typeof WaitlistCleanupSchema>
    >,
  ) {}

  async prepare() {
    if (!this.entries)
      throw new ServiceUnavailableException('Waitlist is unavailable');
    this.initialization ??= (async () => {
      await this.entries!.createCollection();
      await this.entries!.createIndexes();
      await this.cleanup?.createCollection();
      await this.notifications?.prepare();
    })().catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    await this.initialization;
  }

  private model() {
    if (!this.entries)
      throw new ServiceUnavailableException('Waitlist is unavailable');
    return this.entries;
  }

  async get(id: string, member: MemberPrincipal, tx?: BookingTransaction) {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Invalid waitlist ID');
    const ownership =
      member.memberType === MemberType.USER
        ? { patientId: member._id }
        : member.memberType === MemberType.CLINIC
          ? { clinicId: member._id }
          : null;
    if (!ownership) throw new NotFoundException('Waitlist entry not found');
    const row = await this.model()
      .findOne({ _id: new Types.ObjectId(id), ...ownership })
      .select(fields)
      .session(tx?.session ?? null)
      .lean()
      .exec();
    if (!row) throw new NotFoundException('Waitlist entry not found');
    return row;
  }

  private async closedSequence(slot: BookingSlot, tx?: BookingTransaction) {
    return (
      (
        await this.cleanup
          ?.findById(`slot:${slot.doctorId}:${+slot.startsAt}`)
          .session(tx?.session ?? null)
          .lean()
          .exec()
      )?.sequenceMax ?? 0
    );
  }
  async isClosedByBooking(
    row: Pick<WaitlistRecord, 'doctorId' | 'startsAt' | 'queueSequence'>,
    tx: BookingTransaction,
  ) {
    return row.queueSequence <= (await this.closedSequence(row, tx));
  }

  async view(row: WaitlistRecord, member: MemberPrincipal) {
    const own =
      member.memberType === MemberType.USER &&
      String(row.patientId) === String(member._id);
    const closed = await this.closedSequence(row);
    const active =
      ACTIVE_WAITLIST_STATUSES.includes(row.status) &&
      row.queueSequence > closed;
    const position =
      own && active
        ? 1 +
          (await this.model().countDocuments({
            doctorId: row.doctorId,
            startsAt: row.startsAt,
            status: { $in: ACTIVE_WAITLIST_STATUSES },
            queueSequence: { $lt: row.queueSequence, $gt: closed },
          }))
        : null;
    return {
      ...row,
      queueSequence: own ? row.queueSequence : null,
      queuePosition: position,
      automaticBookingEligible:
        active &&
        row.status === WaitlistStatus.ACTIVE &&
        +row.startsAt - Date.now() >= 48 * 3600_000,
      automaticBookingEnabled: false,
    };
  }

  async list(input: MyWaitlistInput, member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException('Only patients can list their waitlist');
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('Choose a limit from 1 to 100');
    const rows = await this.model()
      .find({
        patientId: member._id,
        ...(input.after
          ? { _id: { $gt: new Types.ObjectId(input.after) } }
          : {}),
        ...(input.status ? { status: input.status } : {}),
      })
      .select(fields)
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return {
      entries: await Promise.all(
        rows.slice(0, limit).map((row) => this.view(row, member)),
      ),
      nextCursor: rows.length > limit ? String(rows[limit - 1]._id) : null,
    };
  }

  async count(doctorId: string, startsAt: Date, member: MemberPrincipal) {
    if (!/^[a-f\d]{24}$/i.test(doctorId) || !Number.isFinite(+startsAt))
      throw new BadRequestException('Invalid doctor or slot');
    const doctor = await this.members.getMember(doctorId);
    const allowed =
      (member.memberType === MemberType.DOCTOR &&
        String(member._id) === doctorId.toLowerCase()) ||
      (member.memberType === MemberType.CLINIC &&
        String(member._id) === String(doctor.clinicId));
    if (!allowed || doctor.memberType !== MemberType.DOCTOR)
      throw new NotFoundException('Waitlist not found');
    return this.model().countDocuments({
      doctorId: new Types.ObjectId(doctorId),
      clinicId: doctor.clinicId,
      startsAt,
      status: { $in: ACTIVE_WAITLIST_STATUSES },
    });
  }

  async enter(
    target: BookingTarget,
    member: MemberPrincipal,
    consent: boolean | undefined,
    tx: BookingTransaction,
  ) {
    if (consent !== true)
      throw new BadRequestException(
        'Explicit automatic-booking consent is required',
      );
    if (+target.startsAt - Date.now() < 48 * 3600_000)
      throw new BookingConflictException('WAITLIST_CLOSED');
    const duplicate = await this.model()
      .findOne({
        patientId: member._id,
        doctorId: target.doctorId,
        clinicId: target.clinicId,
        specialty: target.specialty,
        startsAt: target.startsAt,
        status: { $in: ACTIVE_WAITLIST_STATUSES },
      })
      .select(fields)
      .session(tx.session)
      .lean()
      .exec();
    if (duplicate) {
      if (await this.isClosedByBooking(duplicate, tx))
        await this.close(
          duplicate,
          WaitlistStatus.EXPIRED,
          tx,
          undefined,
          'SLOT_TAKEN',
        );
      else throw new BookingConflictException('DUPLICATE_ENTRY');
    }
    const _id = new Types.ObjectId(),
      version = randomUUID();
    await tx.reserve({
      ...target,
      kind: 'WAITLIST',
      commitmentId: _id,
      patientId: member._id,
      version,
      status: 'ACTIVE',
    });
    const queueSequence = await tx.nextQueueSequence(target);
    if (+target.startsAt - Date.now() < 48 * 3600_000)
      throw new BookingConflictException('WAITLIST_CLOSED');
    const [row] = await this.model().create(
      [
        {
          ...target,
          _id,
          patientId: member._id,
          version,
          status: WaitlistStatus.ACTIVE,
          automaticBookingConsent: true,
          consentedAt: new Date(Date.now()),
          consentPolicyVersion: 'waitlist-v1',
          queueSequence,
        },
      ],
      { session: tx.session },
    );
    const { __v, ...result } = row.toObject();
    await this.notice(result, 'WAITLIST_JOINED', `waitlist-joined:${_id}`, tx);
    return result;
  }

  async firstForPromotion(slot: BookingSlot, tx?: BookingTransaction) {
    const closed = await this.cleanup
      ?.findById(`slot:${slot.doctorId}:${+slot.startsAt}`)
      .session(tx?.session ?? null)
      .lean()
      .exec();
    return this.model()
      .findOne({
        doctorId: slot.doctorId,
        startsAt: slot.startsAt,
        status: WaitlistStatus.ACTIVE,
        queueSequence: { $gt: closed?.sequenceMax ?? 0 },
      })
      .select(fields)
      .sort({ queueSequence: 1, _id: 1 })
      .session(tx?.session ?? null)
      .lean()
      .exec();
  }

  async close(
    row: WaitlistRecord,
    status:
      | WaitlistStatus.WITHDRAWN
      | WaitlistStatus.FULFILLED
      | WaitlistStatus.INELIGIBLE
      | WaitlistStatus.EXPIRED,
    tx: BookingTransaction,
    appointmentId?: Types.ObjectId,
    reason?: string,
  ) {
    if (!ACTIVE_WAITLIST_STATUSES.includes(row.status))
      throw new BookingConflictException('STALE_COMMITMENT');
    await tx.release('WAITLIST', row._id);
    const changed = await this.model()
      .findOneAndUpdate(
        {
          _id: row._id,
          patientId: row.patientId,
          status: { $in: ACTIVE_WAITLIST_STATUSES },
          version: row.version,
        },
        {
          $set: {
            status,
            version: randomUUID(),
            closedReason: reason ?? status,
            ...(appointmentId ? { appointmentId } : {}),
          },
        },
        { session: tx.session, returnDocument: 'after', runValidators: true },
      )
      .select(fields)
      .lean()
      .exec();
    if (!changed) throw new BookingConflictException('STALE_COMMITMENT');
    if (status === WaitlistStatus.FULFILLED && appointmentId)
      await this.notice(
        row,
        'WAITLIST_BOOKING_CREATED',
        `waitlist-booked:${row._id}:${appointmentId}`,
        tx,
        appointmentId,
      );
    if (status === WaitlistStatus.EXPIRED)
      await this.notice(
        row,
        'WAITLIST_EXPIRED',
        `waitlist-expired:${row._id}`,
        tx,
      );
    if (status === WaitlistStatus.WITHDRAWN) {
      const remaining = await this.model()
        .exists({
          doctorId: row.doctorId,
          startsAt: row.startsAt,
          status: { $in: ACTIVE_WAITLIST_STATUSES },
        })
        .session(tx.session);
      const gate = await tx.slotState(row);
      if (!remaining && gate.allocationPending)
        await tx.resolveSlot(row, gate.generation);
    }
    return changed;
  }

  private async notice(
    row: WaitlistRecord,
    type: string,
    eventId: string,
    tx: BookingTransaction,
    appointmentId?: Types.ObjectId,
  ) {
    if (!this.notifications)
      throw new ServiceUnavailableException('Notifications unavailable');
    await this.notifications.emit(
      [
        {
          eventId,
          type,
          patientId: row.patientId,
          waitlistId: row._id,
          doctorId: row.doctorId,
          clinicId: row.clinicId,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          appointmentId,
          occurredAt: new Date(Date.now()),
        },
      ],
      tx.session,
    );
  }

  async recordSlotTaken(target: BookingTarget, tx: BookingTransaction) {
    if (!this.cleanup)
      throw new ServiceUnavailableException('Waitlist cleanup unavailable');
    const gate = await tx.slotState(target);
    if (!gate.queueSequence) return;
    await this.cleanup.updateOne(
      { _id: `slot:${target.doctorId}:${+target.startsAt}` },
      {
        $setOnInsert: { doctorId: target.doctorId, startsAt: target.startsAt },
        $max: { sequenceMax: gate.queueSequence },
      },
      { upsert: true, session: tx.session },
    );
  }

  async notifyOpening(
    target: BookingSlot,
    eventId: string,
    tx: BookingTransaction,
  ) {
    if (!this.cleanup || !this.notifications)
      throw new ServiceUnavailableException('Waitlist notices unavailable');
    const cutoff = await this.cleanup
      .findById(`slot:${target.doctorId}:${+target.startsAt}`)
      .session(tx.session)
      .lean()
      .exec();
    const recipients = await this.model()
      .find({
        doctorId: target.doctorId,
        startsAt: target.startsAt,
        status: { $in: ACTIVE_WAITLIST_STATUSES },
        queueSequence: { $gt: cutoff?.sequenceMax ?? 0 },
      })
      .select(fields)
      .session(tx.session)
      .lean()
      .exec();
    await this.notifications.emit(
      recipients.map((row) => ({
        eventId,
        patientId: row.patientId,
        waitlistId: row._id,
        type: 'SLOT_OPEN_FOR_MANUAL_BOOKING',
        doctorId: row.doctorId,
        clinicId: row.clinicId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        occurredAt: new Date(Date.now()),
      })),
      tx.session,
    );
  }

  async openingCandidate(slot: BookingSlot, tx: BookingTransaction) {
    const closed = await this.closedSequence(slot, tx);
    return this.model()
      .findOne({
        doctorId: slot.doctorId,
        startsAt: slot.startsAt,
        status: { $in: ACTIVE_WAITLIST_STATUSES },
        queueSequence: { $gt: closed },
      })
      .select(fields)
      .session(tx.session)
      .lean()
      .exec();
  }
  async lifecycleCurrent(row: WaitlistRecord, tx: BookingTransaction) {
    return this.model()
      .findOne({
        _id: row._id,
        version: row.version,
        status: { $in: ACTIVE_WAITLIST_STATUSES },
      })
      .select(fields)
      .session(tx.session)
      .lean()
      .exec();
  }
  async cleanupTarget() {
    return this.cleanup?.findOne().lean().exec();
  }
  async cleanupCandidate(
    target: { doctorId: Types.ObjectId; startsAt: Date; sequenceMax: number },
    tx?: BookingTransaction,
  ) {
    return this.model()
      .findOne({
        doctorId: target.doctorId,
        startsAt: target.startsAt,
        queueSequence: { $lte: target.sequenceMax },
        status: { $in: ACTIVE_WAITLIST_STATUSES },
      })
      .select(fields)
      .sort({ queueSequence: 1 })
      .session(tx?.session ?? null)
      .lean()
      .exec();
  }
  async finishCleanup(
    target: { _id: string; sequenceMax: number },
    tx: BookingTransaction,
  ) {
    await this.cleanup!.deleteOne(
      { _id: target._id, sequenceMax: target.sequenceMax },
      { session: tx.session },
    );
  }
  async timedCandidate(now: Date) {
    return this.model()
      .findOne({
        $or: [
          {
            status: { $in: ACTIVE_WAITLIST_STATUSES },
            startsAt: { $lte: now },
          },
          {
            status: WaitlistStatus.ACTIVE,
            startsAt: { $lt: new Date(+now + 48 * 3600_000) },
          },
        ],
      })
      .select(fields)
      .sort({ startsAt: 1, queueSequence: 1 })
      .lean()
      .exec();
  }
  async notificationOnly(row: WaitlistRecord, tx: BookingTransaction) {
    const version = randomUUID();
    const changed = await this.model().updateOne(
      { _id: row._id, version: row.version, status: WaitlistStatus.ACTIVE },
      { $set: { status: WaitlistStatus.NOTIFICATION_ONLY, version } },
      { session: tx.session },
    );
    if (changed.modifiedCount !== 1) return;
    await tx.updateWaitlistStatus(
      row._id,
      row.version,
      version,
      'NOTIFICATION_ONLY',
    );
  }

  // This releases only the booking patient's matching entry. Other patients'
  // expiry/notifications belong to the later worker, never a hidden cancellation.
  async fulfillForBooking(
    target: BookingTarget,
    patientId: Types.ObjectId,
    appointmentId: Types.ObjectId,
    tx: BookingTransaction,
    allow = true,
  ) {
    const row = await this.model()
      .findOne({
        patientId,
        doctorId: target.doctorId,
        clinicId: target.clinicId,
        specialty: target.specialty,
        startsAt: target.startsAt,
        status: { $in: ACTIVE_WAITLIST_STATUSES },
      })
      .select(fields)
      .session(tx.session)
      .lean()
      .exec();
    if (!row) return;
    if (await this.isClosedByBooking(row, tx)) {
      await this.close(
        row,
        WaitlistStatus.EXPIRED,
        tx,
        undefined,
        'SLOT_TAKEN',
      );
      return;
    }
    if (!allow)
      throw new BookingConflictException('COMMITMENT_CONFLICT', [
        {
          ...target,
          kind: CommitmentKind.WAITLIST,
          commitmentId: row._id,
          patientId,
          version: row.version,
          status: row.status as 'ACTIVE' | 'NOTIFICATION_ONLY',
        },
      ]);
    await this.close(row, WaitlistStatus.FULFILLED, tx, appointmentId);
  }
}
