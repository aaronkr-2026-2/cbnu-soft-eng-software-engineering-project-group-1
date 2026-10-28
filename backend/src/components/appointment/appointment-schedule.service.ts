import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Types,
  type Model,
  type InferSchemaType,
  type ClientSession,
} from 'mongoose';
import { MEMBER } from '../../schemas/member.model.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import WeeklySchema, {
  DOCTOR_AVAILABILITY_MODEL_NAME,
} from '../../schemas/doctor-availability.model.js';
import OverrideSchema, {
  DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME,
} from '../../schemas/doctor-availability-override.model.js';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../../schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../../schemas/booking-commitment.model.js';
import {
  AppointmentStatus,
  AppointmentSlotState,
  AvailabilityOverrideType,
} from '../../libs/enum/appointment.enum.js';
import {
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../../libs/enum/member.enum.js';
import type {
  MemberEntity,
  MemberPrincipal,
} from '../../libs/types/member.types.js';
import type {
  AvailableSlotsInput,
  DoctorDateOverridesInput,
  DoctorWeeklyHoursInput,
} from '../../libs/dto/appointment/schedule.input.js';
import { BookingCoordinationService } from '../booking/booking-coordination.service.js';
import {
  appointmentCandidates,
  appointmentDateRange,
  appointmentSlot,
  slotFitsSchedule,
} from './appointment-slot.js';

@Injectable()
export class AppointmentScheduleService {
  constructor(
    private readonly coordination: BookingCoordinationService,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
    @Optional()
    @InjectModel(DOCTOR_AVAILABILITY_MODEL_NAME)
    private readonly weekly?: Model<InferSchemaType<typeof WeeklySchema>>,
    @Optional()
    @InjectModel(DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME)
    private readonly overrides?: Model<InferSchemaType<typeof OverrideSchema>>,
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<
      InferSchemaType<typeof AppointmentSchema>
    >,
    @Optional()
    @InjectModel(BOOKING_COMMITMENT)
    private readonly commitments?: Model<
      InferSchemaType<typeof BookingCommitmentSchema>
    >,
    @Optional()
    @InjectModel(BOOKING_GATE)
    private readonly gates?: Model<InferSchemaType<typeof BookingGateSchema>>,
  ) {}

  private models() {
    if (
      !this.members ||
      !this.weekly ||
      !this.overrides ||
      !this.appointments ||
      !this.commitments ||
      !this.gates
    )
      throw new ServiceUnavailableException('Scheduling is unavailable');
    return {
      members: this.members,
      weekly: this.weekly,
      overrides: this.overrides,
      appointments: this.appointments,
      commitments: this.commitments,
      gates: this.gates,
    };
  }

  private async doctor(
    doctorId: string,
    clinicId: string,
    session?: ClientSession,
    specialty?: DoctorSpecialization,
  ) {
    const { members } = this.models();
    if (![doctorId, clinicId].every((id) => /^[a-f\d]{24}$/i.test(id)))
      throw new BadRequestException('Invalid clinic or doctor ID');
    const clinic = await members
      .findOne({
        _id: clinicId,
        memberType: MemberType.CLINIC,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({ clinicTimezone: 1, authVersion: 1 })
      .session(session ?? null)
      .lean()
      .exec();
    const doctor = await members
      .findOne({
        _id: doctorId,
        clinicId,
        memberType: MemberType.DOCTOR,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
        doctorClinicStatus: DoctorClinicStatus.APPROVED,
      })
      .select({ doctorSpecializations: 1 })
      .session(session ?? null)
      .lean()
      .exec();
    if (
      !clinic ||
      !doctor ||
      typeof clinic.clinicTimezone !== 'string' ||
      !clinic.clinicTimezone
    )
      throw new BadRequestException(
        'An active clinic and approved doctor with a valid timezone are required',
      );
    if (
      specialty !== undefined &&
      (!Array.isArray(doctor.doctorSpecializations) ||
        !doctor.doctorSpecializations.includes(specialty))
    )
      throw new BadRequestException('Doctor does not offer this specialty');
    return clinic;
  }

  async getAvailableSlots(input: AvailableSlotsInput) {
    const { from, to } = appointmentDateRange(input.fromDate, input.toDate);
    const models = this.models();
    const clinic = await this.doctor(
      input.doctorId,
      input.clinicId,
      undefined,
      input.specialty,
    );
    const scope = { doctorId: input.doctorId, clinicId: input.clinicId };
    const weekly = await models.weekly.find(scope).lean().exec();
    const overrides = await models.overrides
      .find({ ...scope, date: { $gte: input.fromDate, $lte: input.toDate } })
      .lean()
      .exec();
    const occupied = await models.appointments
      .find({
        doctorId: input.doctorId,
        status: {
          $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        startsAt: { $lt: new Date(to + 2 * 86400_000) },
        endsAt: { $gt: new Date(from - 86400_000) },
      })
      .select({ startsAt: 1, endsAt: 1, _id: 0 })
      .lean()
      .exec();
    const now = Date.now();
    const candidates = [
      ...appointmentCandidates(
        input.fromDate,
        input.toDate,
        clinic.clinicTimezone,
      ),
    ].filter(
      (slot) =>
        +slot.startsAt > now &&
        slotFitsSchedule(
          slot,
          weekly.filter((row) => row.weekday === slot.weekday),
          overrides.filter((row) => row.date === slot.date),
        ),
    );
    const held = await models.gates
      .find({
        _id: {
          $in: candidates.map(
            (slot) => `slot:${input.doctorId.toLowerCase()}:${+slot.startsAt}`,
          ),
        },
        allocationPending: true,
      })
      .select({ _id: 1 })
      .lean()
      .exec();
    const holds = new Set(held.map((row) => row._id));
    return candidates.map((slot) => {
      const taken = occupied.some(
        (row) => row.startsAt < slot.endsAt && row.endsAt > slot.startsAt,
      );
      const pending = holds.has(
        `slot:${input.doctorId.toLowerCase()}:${+slot.startsAt}`,
      );
      return {
        doctorId: input.doctorId,
        clinicId: input.clinicId,
        specialty: input.specialty,
        clinicTimezone: clinic.clinicTimezone,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        state: pending
          ? AppointmentSlotState.UNAVAILABLE
          : taken
            ? AppointmentSlotState.OCCUPIED
            : AppointmentSlotState.AVAILABLE,
        waitlistEligible:
          taken && !pending && +slot.startsAt - now >= 48 * 3600_000,
        canJoinWaitlist: false, // Actual enrollment is delivered in Step 6.
      };
    });
  }

  private validateIntervals(
    rows: { startMinute: number; endMinute: number }[],
  ) {
    const sorted = [...rows].sort((a, b) => a.startMinute - b.startMinute);
    if (
      sorted.some(
        (row, i) =>
          !Number.isInteger(row.startMinute) ||
          !Number.isInteger(row.endMinute) ||
          row.startMinute < 0 ||
          row.endMinute > 1440 ||
          row.endMinute <= row.startMinute ||
          row.startMinute % 30 ||
          row.endMinute % 30 ||
          (i > 0 && sorted[i - 1].endMinute > row.startMinute),
      )
    )
      throw new BadRequestException(
        'Hours must be non-overlapping, positive 30-minute intervals',
      );
  }

  private async preserveCommitments(
    doctorId: string,
    clinicId: Types.ObjectId,
    timezone: string,
    weekly: DoctorWeeklyHoursInput['intervals'],
    changedDate: string | undefined,
    replacements: DoctorDateOverridesInput['overrides'],
    session: ClientSession,
  ) {
    const models = this.models();
    const scope = { doctorId, clinicId, endsAt: { $gt: new Date() } };
    const appointments = await models.appointments
      .find({
        ...scope,
        status: {
          $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
      })
      .select({ startsAt: 1 })
      .session(session)
      .lean()
      .exec();
    const waiting = await models.commitments
      .find({ ...scope, kind: 'WAITLIST' })
      .select({ startsAt: 1 })
      .session(session)
      .lean()
      .exec();
    const slots = [...appointments, ...waiting].map((row) =>
      appointmentSlot(row.startsAt, timezone),
    );
    const existing = await models.overrides
      .find({
        doctorId,
        clinicId,
        date: { $in: [...new Set(slots.map((slot) => slot.date))] },
      })
      .session(session)
      .lean()
      .exec();
    for (const slot of slots) {
      if (changedDate && slot.date !== changedDate) continue;
      const overrides = changedDate
        ? replacements
        : existing.filter((row) => row.date === slot.date);
      if (
        !slotFitsSchedule(
          slot,
          weekly.filter((row) => row.weekday === slot.weekday),
          overrides,
        )
      )
        throw new ConflictException(
          'Resolve existing bookings or waitlists before removing their working hours',
        );
    }
  }

  async setWeeklyHours(
    input: DoctorWeeklyHoursInput,
    principal: MemberPrincipal,
  ) {
    if (principal.memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can manage schedules');
    if (
      input.intervals.some(
        (row) =>
          !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6,
      )
    )
      throw new BadRequestException('Invalid weekday');
    for (let day = 0; day < 7; day++)
      this.validateIntervals(
        input.intervals.filter((row) => row.weekday === day),
      );
    const models = this.models();
    return this.coordination.run(
      {
        doctorIds: [new Types.ObjectId(input.doctorId)],
        patientIds: [],
        slots: [],
      },
      async ({ session }) => {
        const clinic = await this.doctor(
          input.doctorId,
          String(principal._id),
          session,
        );
        if ((clinic.authVersion ?? 0) !== (principal.authVersion ?? 0))
          throw new UnauthorizedException('Invalid access token');
        await this.preserveCommitments(
          input.doctorId,
          principal._id,
          clinic.clinicTimezone,
          input.intervals,
          undefined,
          [],
          session,
        );
        const scope = { doctorId: input.doctorId, clinicId: principal._id };
        const keys = input.intervals.map((row) => ({
          weekday: row.weekday,
          startMinute: row.startMinute,
        }));
        await models.weekly.deleteMany(
          { ...scope, ...(keys.length ? { $nor: keys } : {}) },
          { session },
        );
        for (const row of input.intervals)
          await models.weekly.updateOne(
            { ...scope, weekday: row.weekday, startMinute: row.startMinute },
            { $set: { endMinute: row.endMinute } },
            { session, upsert: true },
          );
        return true;
      },
    );
  }

  async setDateOverrides(
    input: DoctorDateOverridesInput,
    principal: MemberPrincipal,
  ) {
    if (principal.memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can manage schedules');
    appointmentDateRange(input.date, input.date);
    const starts = new Set<number | undefined>();
    for (const row of input.overrides) {
      if (starts.has(row.startMinute ?? undefined))
        throw new BadRequestException(
          'Date overrides must have distinct start minutes',
        );
      starts.add(row.startMinute ?? undefined);
      if (row.startMinute == null || row.endMinute == null) {
        if (
          row.type !== AvailabilityOverrideType.UNAVAILABLE ||
          row.startMinute != null ||
          row.endMinute != null
        )
          throw new BadRequestException(
            'Only full-day unavailability can omit both interval limits',
          );
      } else
        this.validateIntervals([
          { startMinute: row.startMinute, endMinute: row.endMinute },
        ]);
    }
    for (const type of [
      AvailabilityOverrideType.CUSTOM_HOURS,
      AvailabilityOverrideType.UNAVAILABLE,
    ])
      this.validateIntervals(
        input.overrides
          .filter((row) => row.type === type && row.startMinute != null)
          .map((row) => ({
            startMinute: row.startMinute!,
            endMinute: row.endMinute!,
          })),
      );
    const models = this.models();
    return this.coordination.run(
      {
        doctorIds: [new Types.ObjectId(input.doctorId)],
        patientIds: [],
        slots: [],
      },
      async ({ session }) => {
        const clinic = await this.doctor(
          input.doctorId,
          String(principal._id),
          session,
        );
        if ((clinic.authVersion ?? 0) !== (principal.authVersion ?? 0))
          throw new UnauthorizedException('Invalid access token');
        const scope = { doctorId: input.doctorId, clinicId: principal._id };
        const weekly = await models.weekly
          .find(scope)
          .session(session)
          .lean()
          .exec();
        await this.preserveCommitments(
          input.doctorId,
          principal._id,
          clinic.clinicTimezone,
          weekly,
          input.date,
          input.overrides,
          session,
        );
        const keys = input.overrides.map((row) => ({
          startMinute: row.startMinute ?? null,
        }));
        await models.overrides.deleteMany(
          {
            ...scope,
            date: input.date,
            ...(keys.length ? { $nor: keys } : {}),
          },
          { session },
        );
        for (const row of input.overrides)
          await models.overrides.updateOne(
            {
              ...scope,
              date: input.date,
              startMinute: row.startMinute ?? null,
            },
            row.startMinute == null
              ? {
                  $set: { type: row.type },
                  $unset: { startMinute: 1, endMinute: 1 },
                }
              : {
                  $set: {
                    type: row.type,
                    startMinute: row.startMinute,
                    endMinute: row.endMinute,
                  },
                },
            { session, upsert: true },
          );
        return true;
      },
    );
  }
}
