import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentService } from './appointment.service.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';
import { BookingCoordinationService } from '../booking/booking-coordination.service.js';
import { BookingPolicyService } from '../booking/booking-policy.service.js';
import {
  BookingConflictException,
  BookingUnavailableException,
} from '../booking/booking-error.js';
import {
  commitmentReplacementEnabled,
  waitlistEnrollmentEnabled,
} from '../booking/booking.config.js';
import {
  AppointmentSource,
  AppointmentStatus,
  CommitmentKind,
  WaitlistStatus,
} from '../../libs/enum/appointment.enum.js';
import { MemberType } from '../../libs/enum/member.enum.js';
import { ACTIVE_WAITLIST_STATUSES } from '../../schemas/waitlist.model.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';
import type { BookingTransaction } from '../../libs/types/booking.types.js';
import type {
  JoinWaitlistInput,
  ReplaceCommitmentInput,
} from '../../libs/dto/waitlist/waitlist.input.js';

@Injectable()
export class AppointmentCommitmentService {
  constructor(
    private readonly appointments: AppointmentService,
    private readonly waitlists: WaitlistService,
    private readonly coordination: BookingCoordinationService,
    private readonly policy: BookingPolicyService,
  ) {}

  private patient(member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException(
        'Only patients can change their waitlist commitments',
      );
  }

  private slot(input: { doctorId: string; startsAt: string }) {
    if (
      !/^[a-f\d]{24}$/i.test(input.doctorId) ||
      !Number.isFinite(+new Date(input.startsAt))
    )
      throw new BadRequestException('Invalid doctor or slot');
    return {
      doctorId: new Types.ObjectId(input.doctorId),
      startsAt: new Date(input.startsAt),
    };
  }

  async join(input: JoinWaitlistInput, member: MemberPrincipal) {
    this.patient(member);
    if (!waitlistEnrollmentEnabled())
      throw new BookingUnavailableException('FEATURE_DISABLED');
    await this.policy.assertReady();
    await this.waitlists.prepare();
    const slot = this.slot(input);
    const entry = await this.coordination.run(
      { doctorIds: [slot.doctorId], patientIds: [member._id], slots: [slot] },
      async (tx) => {
        const target = await this.appointments.validateSlot(input, member, tx);
        await this.appointments.requireOccupied(target, tx);
        return this.waitlists.enter(
          target,
          member,
          input.automaticBookingConsent,
          tx,
        );
      },
    );
    return this.waitlists.view(entry, member);
  }

  async leave(id: string, member: MemberPrincipal) {
    this.patient(member);
    await this.policy.assertMigrated();
    const original = await this.waitlists.get(id, member);
    const entry = await this.coordination.run(
      {
        doctorIds: [original.doctorId],
        patientIds: [member._id],
        slots: [original],
      },
      async (tx) => {
        await this.policy.assertMigrated(tx.session);
        await this.appointments.requireCurrentMember(member, tx.session);
        const current = await this.waitlists.get(id, member, tx);
        if (current.status === WaitlistStatus.WITHDRAWN) return current;
        return this.waitlists.close(current, WaitlistStatus.WITHDRAWN, tx);
      },
    );
    return this.waitlists.view(entry, member);
  }

  async replace(input: ReplaceCommitmentInput, member: MemberPrincipal) {
    this.patient(member);
    if (!commitmentReplacementEnabled())
      throw new BookingUnavailableException('FEATURE_DISABLED');
    if (
      !Object.values(CommitmentKind).includes(input.originalKind) ||
      !Object.values(CommitmentKind).includes(input.destinationKind)
    )
      throw new BadRequestException('Invalid commitment kind');
    await this.policy.assertReady();
    await this.waitlists.prepare();
    const original = await this.original(input, member);
    const destination = this.slot(input.destination);
    if (input.originalKind === CommitmentKind.APPOINTMENT)
      await this.appointments.prepareLifecycle();
    const result = await this.coordination.run(
      {
        doctorIds: [original.doctorId, destination.doctorId],
        patientIds: [member._id],
        slots: [original, destination],
      },
      async (tx) => {
        await this.appointments.requireCurrentMember(member, tx.session);
        const current = await this.original(input, member, tx);
        if (
          current.version !== input.originalVersion ||
          +current.startsAt <= Date.now() ||
          (input.originalKind === CommitmentKind.APPOINTMENT
            ? current.status !== AppointmentStatus.CONFIRMED
            : !ACTIVE_WAITLIST_STATUSES.includes(
                current.status as WaitlistStatus,
              ))
        )
          throw new BookingConflictException('STALE_COMMITMENT');
        const target = await this.appointments.validateSlot(
          input.destination,
          member,
          tx,
        );
        const sameTarget =
          String(current.doctorId) === String(target.doctorId) &&
          String(current.clinicId) === String(target.clinicId) &&
          current.specialty === target.specialty &&
          +current.startsAt === +target.startsAt;
        if (sameTarget && input.originalKind === input.destinationKind)
          throw new BadRequestException('Choose a different commitment');
        const fulfillOriginal =
          input.originalKind === CommitmentKind.WAITLIST &&
          input.destinationKind === CommitmentKind.APPOINTMENT &&
          sameTarget;
        if (input.originalKind === CommitmentKind.APPOINTMENT)
          await this.appointments.cancelInTransaction(
            await this.appointments.getAppointment(
              input.originalId,
              member,
              tx,
            ),
            input.originalVersion,
            member,
            tx,
          );
        else if (!fulfillOriginal)
          await this.waitlists.close(
            await this.waitlists.get(input.originalId, member, tx),
            WaitlistStatus.WITHDRAWN,
            tx,
          );
        if (input.destinationKind === CommitmentKind.APPOINTMENT)
          return {
            kind: CommitmentKind.APPOINTMENT,
            appointment: await this.appointments.bookInTransaction(
              input.destination,
              member._id,
              member,
              AppointmentSource.ONLINE,
              tx,
              undefined,
              undefined,
              fulfillOriginal,
            ),
          };
        await this.appointments.requireOccupied(target, tx);
        return {
          kind: CommitmentKind.WAITLIST,
          waitlist: await this.waitlists.enter(
            target,
            member,
            input.destination.automaticBookingConsent,
            tx,
          ),
        };
      },
    );
    return result.waitlist
      ? {
          ...result,
          waitlist: await this.waitlists.view(result.waitlist, member),
        }
      : result;
  }

  private original(
    input: ReplaceCommitmentInput,
    member: MemberPrincipal,
    tx?: BookingTransaction,
  ) {
    return input.originalKind === CommitmentKind.APPOINTMENT
      ? this.appointments.getAppointment(input.originalId, member, tx)
      : this.waitlists.get(input.originalId, member, tx);
  }
}
