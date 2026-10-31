import { appointmentFields } from '../../libs/types/appointment.types.js';
import {
  PromotionIneligible,
  PromotionCutoff,
} from './appointment-promotion-error.js';
import type { WaitlistRecord } from '../../libs/types/booking.types.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Model,
  Types,
  type InferSchemaType,
  type ClientSession,
} from 'mongoose';
import { randomUUID } from 'node:crypto';
import { BookingCoordinationService } from '../booking/booking-coordination.service.js';
import { BookingPolicyService } from '../booking/booking-policy.service.js';
import {
  BookingConflictException,
  BookingUnavailableException,
} from '../booking/booking-error.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import {
  MemberType,
  MemberStatus,
  DoctorClinicStatus,
  DoctorSpecialization,
} from '../../libs/enum/member.enum.js';
import { MEMBER } from '../../schemas/member.model.js';
import type { MemberEntity } from '../../libs/types/member.types.js';
import DoctorAvailabilitySchema, {
  DOCTOR_AVAILABILITY_MODEL_NAME,
} from '../../schemas/doctor-availability.model.js';
import DoctorAvailabilityOverrideSchema, {
  DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME,
} from '../../schemas/doctor-availability-override.model.js';
import {
  AppointmentStatus,
  AppointmentSource,
  AvailabilityOverrideType,
  AppointmentOutcome,
  ClinicBookingSource,
  AppointmentEventType,
  SlotReleaseMode,
} from '../../libs/enum/appointment.enum.js';
import type { BookAppointmentDto } from '../../libs/dto/appointment/book-appointment.dto.js';
import type { ClinicAppointmentInput } from '../../libs/dto/appointment/clinic-appointment.input.js';
import type { MyAppointmentsInput } from '../../libs/dto/appointment/my-appointments.input.js';
import {
  APPOINTMENT_EVENT,
  AppointmentEventSchema,
} from '../../schemas/appointment-event.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../../schemas/booking-commitment.model.js';
import { appointmentSlot, slotFitsSchedule } from './appointment-slot.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';
import type {
  BookingTransaction,
  BookingTarget,
} from '../../libs/types/booking.types.js';
import { WaitlistService } from '../waitlist/waitlist.service.js';

type AppointmentEntity = InferSchemaType<typeof AppointmentSchema>;
type AppointmentRecord = AppointmentEntity & { _id: Types.ObjectId };

@Injectable()
export class AppointmentService {
  private outboxInitialization?: Promise<void>;
  constructor(
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<AppointmentEntity>,
    @Optional()
    @InjectModel(MEMBER)
    private readonly members?: Model<MemberEntity>,
    @Optional()
    @InjectModel(DOCTOR_AVAILABILITY_MODEL_NAME)
    private readonly availability?: Model<
      InferSchemaType<typeof DoctorAvailabilitySchema>
    >,
    @Optional()
    @InjectModel(DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME)
    private readonly overrides?: Model<
      InferSchemaType<typeof DoctorAvailabilityOverrideSchema>
    >,
    @Optional() private readonly coordination?: BookingCoordinationService,
    @Optional() private readonly policy?: BookingPolicyService,
    @Optional() private readonly waitlists?: WaitlistService,
    @Optional()
    @InjectModel(APPOINTMENT_EVENT)
    private readonly outbox?: Model<
      InferSchemaType<typeof AppointmentEventSchema>
    >,
    @Optional()
    @InjectModel(BOOKING_COMMITMENT)
    private readonly commitments?: Model<
      InferSchemaType<typeof BookingCommitmentSchema>
    >,
  ) {}

  async bookAppointment(input: BookAppointmentDto, member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException('Only users can book appointments');

    return this.createBooking(
      input,
      member._id,
      member,
      AppointmentSource.ONLINE,
    );
  }

  async createClinicAppointment(
    input: ClinicAppointmentInput,
    member: MemberPrincipal,
  ) {
    if (member.memberType !== MemberType.CLINIC)
      throw new ForbiddenException('Only clinics can create staff bookings');
    if (
      !/^[a-f\d]{24}$/i.test(input.patientId) ||
      !Object.values(ClinicBookingSource).includes(input.source)
    )
      throw new BadRequestException(
        'An existing patient ID and phone/walk-in source are required',
      );
    return this.createBooking(
      { ...input, clinicId: String(member._id) },
      new Types.ObjectId(input.patientId),
      member,
      input.source === ClinicBookingSource.PHONE
        ? AppointmentSource.PHONE
        : AppointmentSource.WALK_IN,
    );
  }

  async requireCurrentMember(member: MemberPrincipal, session: ClientSession) {
    const current = await this.bookingModels()
      .members.findOne({
        _id: member._id,
        memberType: member.memberType,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({ _id: 1, authVersion: 1 })
      .session(session)
      .lean()
      .exec();
    if (!current || (current.authVersion ?? 0) !== (member.authVersion ?? 0))
      throw new UnauthorizedException('Invalid access token');
  }

  private async createBooking(
    input: BookAppointmentDto,
    patientId: Types.ObjectId,
    member: MemberPrincipal,
    source: AppointmentSource,
  ) {
    if (!this.coordination || !this.policy)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    await this.policy.assertReady();
    await this.waitlists?.prepare();
    if (
      ![input.doctorId, input.clinicId].every((value) =>
        /^[a-f\d]{24}$/i.test(value),
      )
    )
      throw new BadRequestException('Invalid clinic or doctor ID');
    if (!Object.values(DoctorSpecialization).includes(input.specialty))
      throw new BadRequestException('Choose a supported specialty');
    const startsAt = new Date(input.startsAt);
    this.requireFutureStart(startsAt);
    const doctorId = new Types.ObjectId(input.doctorId);
    const _id = new Types.ObjectId();
    const version = randomUUID();
    try {
      return await this.coordination.run(
        {
          doctorIds: [doctorId],
          patientIds: [patientId],
          slots: [{ doctorId, startsAt }],
        },
        (tx) =>
          this.bookInTransaction(
            input,
            patientId,
            member,
            source,
            tx,
            _id,
            version,
          ),
      );
    } catch (error) {
      // Staff may enforce a patient's cross-clinic conflicts, but may not read
      // the other clinic's commitment details through this error response.
      if (
        member.memberType === MemberType.CLINIC &&
        error instanceof BookingConflictException
      ) {
        throw new BookingConflictException(error.booking.reason);
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      )
        throw new BookingConflictException('SLOT_OCCUPIED');
      throw error;
    }
  }

  async validateSlot(
    input: BookAppointmentDto,
    member: MemberPrincipal,
    tx: BookingTransaction,
  ): Promise<BookingTarget> {
    if (!this.policy)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    await this.policy.assertReady(tx.session);
    const models = this.bookingModels();
    if (
      ![input.doctorId, input.clinicId].every((value) =>
        /^[a-f\d]{24}$/i.test(value),
      ) ||
      !Object.values(DoctorSpecialization).includes(input.specialty)
    )
      throw new BadRequestException('Invalid doctor, clinic or specialty');
    const startsAt = new Date(input.startsAt);
    this.requireFutureStart(startsAt);
    await this.requireCurrentMember(member, tx.session);
    const timezone = await this.requireApprovedDoctor(
      input,
      models.members,
      tx.session,
    );
    const slot = appointmentSlot(startsAt, timezone);
    await this.requireWorkingHours(input, slot, models, tx.session);

    return {
      doctorId: new Types.ObjectId(input.doctorId),
      clinicId: new Types.ObjectId(input.clinicId),
      specialty: input.specialty,
      startsAt,
      endsAt: slot.endsAt,
    };
  }

  async requireOccupied(target: BookingTarget, tx: BookingTransaction) {
    const occupied = await this.bookingModels()
      .appointments.exists({
        doctorId: target.doctorId,
        clinicId: target.clinicId,
        startsAt: target.startsAt,
        endsAt: target.endsAt,
        status: {
          $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
      })
      .session(tx.session);
    if (!occupied) throw new BookingConflictException('WAITLIST_CLOSED');
  }

  async bookInTransaction(
    input: BookAppointmentDto,
    patientId: Types.ObjectId,
    member: MemberPrincipal,
    source: AppointmentSource,
    tx: BookingTransaction,
    _id = new Types.ObjectId(),
    version = randomUUID(),
    allowOwnWaitlist = true,
    allocationGeneration?: number,
  ) {
    if (
      member.memberType !== MemberType.USER &&
      member.memberType !== MemberType.CLINIC
    )
      throw new ForbiddenException('Booking is forbidden');
    if (
      member.memberType === MemberType.USER
        ? !patientId.equals(member._id)
        : input.clinicId !== String(member._id)
    )
      throw new ForbiddenException('Booking is outside the caller scope');
    const models = this.bookingModels();
    const startsAt = new Date(input.startsAt),
      doctorId = new Types.ObjectId(input.doctorId),
      clinicId = new Types.ObjectId(input.clinicId);

    if (member.memberType === MemberType.CLINIC) {
      const patient = await models.members
        .findOne({
          _id: patientId,
          memberType: MemberType.USER,
          memberStatus: MemberStatus.ACTIVE,
          deletedAt: null,
        })
        .select({ _id: 1 })
        .session(tx.session)
        .lean()
        .exec();
      if (!patient)
        throw new BadRequestException(
          'An active existing patient account is required',
        );
    }
    const target = await this.validateSlot(input, member, tx);
    await this.waitlists?.fulfillForBooking(
      target,
      patientId,
      _id,
      tx,
      allowOwnWaitlist,
    );
    await tx.reserve(
      {
        kind: 'APPOINTMENT',
        commitmentId: _id,
        version,
        status: 'CONFIRMED',
        patientId,
        doctorId,
        clinicId,
        specialty: input.specialty,
        startsAt,
        endsAt: target.endsAt,
      },
      allocationGeneration,
    );
    await this.requireFreeSlot(
      input.doctorId,
      startsAt,
      target.endsAt,
      models.appointments,
      tx.session,
    );
    this.requireFutureStart(startsAt);
    if (
      source === AppointmentSource.WAITLIST &&
      +startsAt - Date.now() < 48 * 3600_000
    )
      throw new PromotionCutoff();
    const [appointment] = await models.appointments.create(
      [
        {
          _id,
          version,
          source,
          specialty: input.specialty,
          doctorId,
          clinicId,
          patientId,
          startsAt,
          endsAt: target.endsAt,
          status: AppointmentStatus.CONFIRMED,
          lastChangedBy: member._id,
        },
      ],
      { session: tx.session },
    );
    await this.waitlists?.recordSlotTaken(target, tx);
    const { __v, ...result } = appointment.toObject();
    return result;
  }

  async isSlotOccupied(
    slot: { doctorId: Types.ObjectId; startsAt: Date },
    tx: BookingTransaction,
  ) {
    return Boolean(
      await this.bookingModels()
        .appointments.exists({
          doctorId: slot.doctorId,
          status: {
            $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
          },
          startsAt: { $lt: new Date(+slot.startsAt + 30 * 60_000) },
          endsAt: { $gt: slot.startsAt },
        })
        .session(tx.session),
    );
  }

  async checkPromotionEligibility(
    entry: WaitlistRecord,
    tx: BookingTransaction,
    generation: number,
  ) {
    if (+entry.startsAt - Date.now() < 48 * 3600_000)
      throw new PromotionCutoff();
    if (!this.policy)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    await this.policy.assertReady(tx.session);
    if (
      entry.automaticBookingConsent !== true ||
      entry.consentPolicyVersion !== 'waitlist-v1' ||
      !(entry.consentedAt instanceof Date) ||
      !Number.isFinite(+entry.consentedAt) ||
      +entry.startsAt - +entry.consentedAt < 48 * 3600_000 ||
      +entry.endsAt - +entry.startsAt !== 30 * 60_000
    )
      throw new PromotionIneligible('INVALID_CONSENT');
    const patient = await this.bookingModels()
      .members.findOne({
        _id: entry.patientId,
        memberType: MemberType.USER,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({ _id: 1, memberType: 1, authVersion: 1 })
      .session(tx.session)
      .lean()
      .exec();
    if (!patient) throw new PromotionIneligible('PATIENT_INACTIVE');
    const principal: MemberPrincipal = {
      _id: patient._id,
      memberType: MemberType.USER,
      authVersion: patient.authVersion ?? 0,
    };
    try {
      await this.validateSlot(
        {
          doctorId: String(entry.doctorId),
          clinicId: String(entry.clinicId),
          specialty: entry.specialty,
          startsAt: entry.startsAt.toISOString(),
        },
        principal,
        tx,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        (error instanceof BookingConflictException &&
          error.booking.reason === 'SLOT_UNAVAILABLE')
      )
        throw new PromotionIneligible('DOCTOR_OR_SCHEDULE');
      throw error;
    }
    try {
      await tx.checkReservation(
        {
          kind: 'APPOINTMENT',
          commitmentId: new Types.ObjectId(),
          patientId: entry.patientId,
          doctorId: entry.doctorId,
          clinicId: entry.clinicId,
          specialty: entry.specialty,
          startsAt: entry.startsAt,
          endsAt: entry.endsAt,
          status: 'CONFIRMED',
        },
        generation,
        entry._id,
      );
    } catch (error) {
      if (
        error instanceof BookingConflictException &&
        (error.booking.reason === 'COMMITMENT_CONFLICT' ||
          error.booking.reason === 'PATIENT_OVERLAP')
      )
        throw new PromotionIneligible(error.booking.reason);
      throw error;
    }
    return principal;
  }

  private bookingModels() {
    if (
      !this.appointments ||
      !this.members ||
      !this.availability ||
      !this.overrides
    ) {
      throw new ServiceUnavailableException('Booking is unavailable');
    }
    return {
      appointments: this.appointments,
      members: this.members,
      availability: this.availability,
      overrideModel: this.overrides,
    };
  }

  private requireFutureStart(startsAt: Date) {
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    )
      throw new BadRequestException('Appointment must start in the future');
  }

  private async requireApprovedDoctor(
    input: BookAppointmentDto,
    members: Model<MemberEntity>,
    session: ClientSession,
  ) {
    const clinic = await members
      .findOne({
        _id: input.clinicId,
        memberType: MemberType.CLINIC,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
      })
      .select({ clinicTimezone: 1 })
      .session(session)
      .lean()
      .exec();
    const doctor = await members
      .findOne({
        _id: input.doctorId,
        memberType: MemberType.DOCTOR,
        memberStatus: MemberStatus.ACTIVE,
        deletedAt: null,
        clinicId: input.clinicId,
        doctorClinicStatus: DoctorClinicStatus.APPROVED,
      })
      .select({ _id: 1, doctorSpecializations: 1 })
      .session(session)
      .lean()
      .exec();
    if (!clinic || !doctor)
      throw new BadRequestException(
        'An active clinic and its approved doctor are required',
      );
    if (
      !Array.isArray(doctor.doctorSpecializations) ||
      !doctor.doctorSpecializations.includes(input.specialty)
    )
      throw new BadRequestException(
        'Doctor does not offer the selected specialty',
      );
    if (
      typeof clinic.clinicTimezone !== 'string' ||
      !clinic.clinicTimezone.trim()
    )
      throw new BadRequestException('Clinic timezone is invalid');
    return clinic.clinicTimezone;
  }

  private async requireWorkingHours(
    { doctorId, clinicId }: Pick<BookAppointmentDto, 'doctorId' | 'clinicId'>,
    slot: ReturnType<typeof appointmentSlot>,
    {
      availability,
      overrideModel,
    }: ReturnType<AppointmentService['bookingModels']>,
    session: ClientSession,
  ) {
    const scope = { doctorId, clinicId };
    const overrides = await overrideModel
      .find({ ...scope, date: slot.date })
      .session(session)
      .lean()
      .exec();
    const custom = overrides.filter(
      (item) => item.type === AvailabilityOverrideType.CUSTOM_HOURS,
    );
    const hours = custom.length
      ? custom
      : await availability
          .find({ ...scope, weekday: slot.weekday })
          .session(session)
          .lean()
          .exec();
    if (!slotFitsSchedule(slot, hours, overrides)) {
      throw new BookingConflictException('SLOT_UNAVAILABLE');
    }
  }

  private async requireFreeSlot(
    doctorId: string,
    startsAt: Date,
    endsAt: Date,
    appointments: Model<AppointmentEntity>,
    session: ClientSession,
  ) {
    const occupied = await appointments
      .exists({
        doctorId,
        status: {
          $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        startsAt: { $lt: endsAt },
        endsAt: { $gt: startsAt },
      })
      .session(session);
    if (occupied) throw new BookingConflictException('SLOT_OCCUPIED');
  }

  async cancelAppointment(id: string, member: MemberPrincipal) {
    if (![MemberType.USER, MemberType.CLINIC].includes(member.memberType))
      throw new ForbiddenException(
        'Only patients or their clinic can cancel appointments',
      );
    return this.changeStatus(id, AppointmentStatus.CANCELED, member);
  }

  async setAppointmentOutcome(
    id: string,
    outcome: AppointmentOutcome,
    member: MemberPrincipal,
  ) {
    if (member.memberType !== MemberType.CLINIC)
      throw new ForbiddenException(
        'Only clinics can record appointment outcomes',
      );
    if (!Object.values(AppointmentOutcome).includes(outcome))
      throw new BadRequestException('Invalid appointment outcome');
    return this.changeStatus(
      id,
      outcome === AppointmentOutcome.COMPLETED
        ? AppointmentStatus.COMPLETED
        : AppointmentStatus.NO_SHOW,
      member,
    );
  }

  async canReopenSlot(
    target: Pick<
      AppointmentRecord,
      'doctorId' | 'clinicId' | 'specialty' | 'startsAt'
    >,
    tx: BookingTransaction,
  ) {
    return this.canReopen(target, this.bookingModels(), tx.session);
  }

  private async canReopen(
    appointment: Pick<
      AppointmentRecord,
      'doctorId' | 'clinicId' | 'specialty' | 'startsAt'
    >,
    models: ReturnType<AppointmentService['bookingModels']>,
    session: ClientSession,
  ) {
    if (!appointment.specialty) return false;
    try {
      const input = {
        doctorId: String(appointment.doctorId),
        clinicId: String(appointment.clinicId),
        specialty: appointment.specialty,
        startsAt: appointment.startsAt.toISOString(),
      };
      const timezone = await this.requireApprovedDoctor(
        input,
        models.members,
        session,
      );
      await this.requireWorkingHours(
        input,
        appointmentSlot(appointment.startsAt, timezone),
        models,
        session,
      );
      return true;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        (error instanceof BookingConflictException &&
          error.booking.reason === 'SLOT_UNAVAILABLE')
      )
        return false;
      throw error; // Infrastructure failures must roll back rather than mimic closures.
    }
  }

  private async changeStatus(
    id: string,
    status: AppointmentStatus,
    member: MemberPrincipal,
  ) {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Invalid appointment ID');
    if (!this.coordination || !this.policy || !this.outbox || !this.commitments)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    await this.policy.assertMigrated();
    const models = this.bookingModels();
    const scope = {
      _id: new Types.ObjectId(id),
      [member.memberType === MemberType.CLINIC ? 'clinicId' : 'patientId']:
        member._id,
    };
    const original = await models.appointments
      .findOne(scope)
      .select(appointmentFields)
      .lean()
      .exec();
    if (!original) throw new NotFoundException('Appointment not found');
    await this.prepareLifecycle();
    const version = randomUUID();
    return this.coordination.run(
      {
        doctorIds: [original.doctorId],
        patientIds: [original.patientId],
        slots: [{ doctorId: original.doctorId, startsAt: original.startsAt }],
      },
      (tx) =>
        this.transitionInTransaction(original, status, member, tx, version),
    );
  }

  async prepareLifecycle() {
    await this.waitlists?.prepare();
    if (!this.outbox)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    this.outboxInitialization ??= (async () => {
      await this.outbox!.createCollection();
      await this.outbox!.createIndexes();
    })().catch((error: unknown) => {
      this.outboxInitialization = undefined;
      throw error;
    });
    await this.outboxInitialization;
  }

  async cancelInTransaction(
    original: AppointmentRecord,
    expectedVersion: string,
    member: MemberPrincipal,
    tx: BookingTransaction,
  ) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException('Only patients can replace commitments');
    return this.transitionInTransaction(
      original,
      AppointmentStatus.CANCELED,
      member,
      tx,
      randomUUID(),
      expectedVersion,
    );
  }

  private async transitionInTransaction(
    original: AppointmentRecord,
    status: AppointmentStatus,
    member: MemberPrincipal,
    tx: BookingTransaction,
    version: string,
    expectedVersion?: string,
  ) {
    const models = this.bookingModels();
    const id = String(original._id);
    const scope = {
      _id: original._id,
      [member.memberType === MemberType.CLINIC ? 'clinicId' : 'patientId']:
        member._id,
    };

    await this.policy!.assertMigrated(tx.session);
    await this.requireCurrentMember(member, tx.session);
    const current = await models.appointments
      .findOne(scope)
      .select(appointmentFields)
      .session(tx.session)
      .lean()
      .exec();
    if (!current) throw new NotFoundException('Appointment not found');
    if (
      !['doctorId', 'clinicId', 'patientId'].every(
        (key) =>
          String(current[key as 'doctorId' | 'clinicId' | 'patientId']) ===
          String(original[key as 'doctorId' | 'clinicId' | 'patientId']),
      ) ||
      +current.startsAt !== +original.startsAt
    )
      throw new BookingConflictException('STALE_COMMITMENT');
    if (expectedVersion && current.version !== expectedVersion)
      throw new BookingConflictException('STALE_COMMITMENT');
    if (current.status === status)
      return {
        ...current,
        source: current.source ?? AppointmentSource.LEGACY,
      };
    const now = new Date(Date.now());
    if (
      current.status !== AppointmentStatus.CONFIRMED ||
      (status === AppointmentStatus.CANCELED
        ? current.startsAt <= now
        : current.endsAt > now)
    )
      throw new ConflictException('Unsupported appointment transition or time');
    if (!current.version)
      throw new BookingUnavailableException('MIGRATION_REQUIRED');
    await tx.release('APPOINTMENT', current._id);
    const changed = await models.appointments
      .findOneAndUpdate(
        {
          ...scope,
          version: current.version,
          status: AppointmentStatus.CONFIRMED,
        },
        {
          $set: {
            status,
            version,
            lastChangedBy: member._id,
            ...(status === AppointmentStatus.CANCELED
              ? { canceledAt: now, canceledBy: member._id }
              : {}),
          },
        },
        {
          session: tx.session,
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .select(appointmentFields)
      .lean()
      .exec();
    if (!changed) throw new BookingConflictException('STALE_COMMITMENT');
    const event = {
      appointmentId: current._id,
      appointmentVersion: version,
      appointmentStatus: status,
      patientId: current.patientId,
      clinicId: current.clinicId,
      doctorId: current.doctorId,
      actorId: member._id,
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      occurredAt: now,
      specialty: current.specialty,
    };
    let slotGeneration: number | undefined;
    let releaseMode: SlotReleaseMode | undefined;
    if (status === AppointmentStatus.CANCELED) {
      const slot = {
        doctorId: current.doctorId,
        startsAt: current.startsAt,
      };
      slotGeneration = await tx.holdSlot(slot);
      const queued =
        +current.startsAt - +now >= 48 * 3600_000 &&
        Boolean(
          await this.commitments!.exists({
            kind: 'WAITLIST',
            doctorId: current.doctorId,
            clinicId: current.clinicId,
            startsAt: current.startsAt,
            endsAt: current.endsAt,
          }).session(tx.session),
        );
      const available = await this.canReopen(current, models, tx.session);
      releaseMode = !available
        ? SlotReleaseMode.UNAVAILABLE
        : queued
          ? SlotReleaseMode.QUEUE
          : SlotReleaseMode.MANUAL;
      if (!queued) await tx.resolveSlot(slot, slotGeneration);
      if (available && +current.startsAt - +now < 48 * 3600_000)
        await this.waitlists?.notifyOpening(
          current,
          `release:${id.toLowerCase()}:${version}`,
          tx,
        );
    }
    await this.outbox!.create(
      [
        {
          ...event,
          _id: `status:${id.toLowerCase()}:${version}`,
          type: AppointmentEventType.STATUS_CHANGED,
        },
        ...(status === AppointmentStatus.CANCELED
          ? [
              {
                ...event,
                _id: `release:${id.toLowerCase()}:${version}`,
                type: AppointmentEventType.SLOT_RELEASED,
                slotGeneration,
                releaseMode,
              },
            ]
          : []),
      ],
      { session: tx.session, ordered: true },
    );
    return {
      ...changed,
      source: changed.source ?? AppointmentSource.LEGACY,
    };
  }

  async myAppointments(input: MyAppointmentsInput, member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException('Only patients can list their appointments');
    if (!this.appointments)
      throw new ServiceUnavailableException('Appointments are unavailable');
    const after = input.after ?? undefined;
    const status = input.status ?? undefined;
    const from = input.from ?? undefined;
    const to = input.to ?? undefined;
    const limit = input.limit ?? 20;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      (after !== undefined && !/^[a-f\d]{24}$/i.test(after)) ||
      (status !== undefined &&
        !Object.values(AppointmentStatus).includes(status)) ||
      [from, to].some(
        (value) =>
          value !== undefined &&
          (!(value instanceof Date) || !Number.isFinite(+value)),
      ) ||
      (from && to && from >= to)
    )
      throw new BadRequestException(
        'Invalid appointment pagination or filters',
      );

    // Cursor lookup is also patient scoped: foreign IDs cannot probe dates.
    const cursor = after
      ? await this.appointments
          .findOne({
            _id: new Types.ObjectId(after),
            patientId: member._id,
          })
          .select({ startsAt: 1 })
          .lean()
          .exec()
      : null;
    if (after && !cursor)
      throw new BadRequestException('Invalid appointment cursor');
    const rows = await this.appointments
      .find({
        patientId: member._id,
        ...(status ? { status: status } : {}),
        ...(from || to
          ? {
              startsAt: {
                ...(from ? { $gte: from } : {}),
                ...(to ? { $lt: to } : {}),
              },
            }
          : {}),
        ...(cursor
          ? {
              $or: [
                { startsAt: { $gt: cursor.startsAt } },
                {
                  startsAt: cursor.startsAt,
                  _id: { $gt: new Types.ObjectId(after!) },
                },
              ],
            }
          : {}),
      })
      .select(appointmentFields)
      .sort({ startsAt: 1, _id: 1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return {
      entries: rows.slice(0, limit).map((row) => ({
        ...row,
        source: row.source ?? AppointmentSource.LEGACY,
      })),
      nextCursor: rows.length > limit ? String(rows[limit - 1]._id) : null,
    };
  }

  async getAppointment(
    id: string,
    member: MemberPrincipal,
    tx?: BookingTransaction,
  ) {
    if (!/^[a-f\d]{24}$/i.test(id))
      throw new BadRequestException('Invalid appointment ID');
    if (!this.appointments)
      throw new ServiceUnavailableException('Appointments are unavailable');
    const ownershipField =
      member.memberType === MemberType.USER
        ? 'patientId'
        : member.memberType === MemberType.CLINIC
          ? 'clinicId'
          : member.memberType === MemberType.DOCTOR
            ? 'doctorId'
            : undefined;
    if (!ownershipField) throw new NotFoundException('Appointment not found');
    // Scope the database lookup itself: unrelated members cannot discover records.
    const query = this.appointments
      .findOne({
        _id: new Types.ObjectId(id),
        [ownershipField]: member._id,
      })
      .select(appointmentFields);
    if (tx) query.session(tx.session);
    const appointment = await query.lean().exec();
    if (!appointment) throw new NotFoundException('Appointment not found');
    return {
      ...appointment,
      source: appointment.source ?? AppointmentSource.LEGACY,
    };
  }
}
