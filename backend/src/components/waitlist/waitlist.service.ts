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
  ) {}

  async prepare() {
    if (!this.entries)
      throw new ServiceUnavailableException('Waitlist is unavailable');
    this.initialization ??= (async () => {
      await this.entries!.createCollection();
      await this.entries!.createIndexes();
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

  async view(row: WaitlistRecord, member: MemberPrincipal) {
    const own =
      member.memberType === MemberType.USER &&
      String(row.patientId) === String(member._id);
    const active = ACTIVE_WAITLIST_STATUSES.includes(row.status);
    const position =
      own && active
        ? 1 +
          (await this.model().countDocuments({
            doctorId: row.doctorId,
            startsAt: row.startsAt,
            status: { $in: ACTIVE_WAITLIST_STATUSES },
            queueSequence: { $lt: row.queueSequence },
          }))
        : null;
    return {
      ...row,
      queueSequence: own ? row.queueSequence : null,
      queuePosition: position,
      automaticBookingEligible:
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
      .exists({
        patientId: member._id,
        doctorId: target.doctorId,
        clinicId: target.clinicId,
        specialty: target.specialty,
        startsAt: target.startsAt,
        status: { $in: ACTIVE_WAITLIST_STATUSES },
      })
      .session(tx.session);
    if (duplicate) throw new BookingConflictException('DUPLICATE_ENTRY');
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
    return result;
  }

  async firstForPromotion(slot: BookingSlot, tx?: BookingTransaction) {
    return this.model()
      .findOne({
        doctorId: slot.doctorId,
        startsAt: slot.startsAt,
        status: WaitlistStatus.ACTIVE,
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
      | WaitlistStatus.INELIGIBLE,
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
