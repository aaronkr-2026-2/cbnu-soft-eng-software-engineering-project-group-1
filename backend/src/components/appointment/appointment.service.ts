import {
  BadRequestException,
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
} from '../../libs/enum/appointment.enum.js';
import type { BookAppointmentDto } from '../../libs/dto/appointment/book-appointment.dto.js';
import { appointmentSlot } from './appointment-slot.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';

type AppointmentEntity = InferSchemaType<typeof AppointmentSchema>;

@Injectable()
export class AppointmentService {
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
  ) {}

  async bookAppointment(input: BookAppointmentDto, member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException('Only users can book appointments');

    if (!this.coordination || !this.policy)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    await this.policy.assertReady();
    const models = this.bookingModels();
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
    const clinicId = new Types.ObjectId(input.clinicId);
    const _id = new Types.ObjectId();
    const version = randomUUID();
    try {
      return await this.coordination.run(
        { patientIds: [member._id], slots: [{ doctorId, startsAt }] },
        async (tx) => {
          await this.policy!.assertReady(tx.session);
          const patient = await models.members
            .findOne({
              _id: member._id,
              memberType: MemberType.USER,
              memberStatus: MemberStatus.ACTIVE,
              deletedAt: null,
            })
            .select({ _id: 1, authVersion: 1 })
            .session(tx.session)
            .lean()
            .exec();
          if (
            !patient ||
            (patient.authVersion ?? 0) !== (member.authVersion ?? 0)
          )
            throw new UnauthorizedException('Invalid access token');
          const timezone = await this.requireApprovedDoctor(
            input,
            models.members,
            tx.session,
          );
          const slot = appointmentSlot(startsAt, timezone);
          await this.requireWorkingHours(input, slot, models, tx.session);
          await tx.reserve({
            kind: 'APPOINTMENT',
            commitmentId: _id,
            version,
            status: 'CONFIRMED',
            patientId: member._id,
            doctorId,
            clinicId,
            specialty: input.specialty,
            startsAt,
            endsAt: slot.endsAt,
          });
          await this.requireFreeSlot(
            input.doctorId,
            startsAt,
            slot.endsAt,
            models.appointments,
            tx.session,
          );
          this.requireFutureStart(startsAt);
          const [appointment] = await models.appointments.create(
            [
              {
                _id,
                version,
                source: AppointmentSource.ONLINE,
                specialty: input.specialty,
                doctorId,
                clinicId,
                patientId: member._id,
                startsAt,
                endsAt: slot.endsAt,
                status: AppointmentStatus.CONFIRMED,
                lastChangedBy: member._id,
              },
            ],
            { session: tx.session },
          );
          const { __v, ...result } = appointment.toObject();
          return result;
        },
      );
    } catch (error) {
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
    const blocked = overrides.some(
      (item) =>
        item.type === AvailabilityOverrideType.UNAVAILABLE &&
        (item.startMinute == null ||
          item.endMinute == null ||
          (item.startMinute < slot.endMinute &&
            item.endMinute > slot.startMinute)),
    );
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
    if (
      blocked ||
      !hours.some(
        (item) =>
          item.startMinute != null &&
          item.endMinute != null &&
          item.startMinute <= slot.startMinute &&
          item.endMinute >= slot.endMinute,
      )
    ) {
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

  async getAppointment(id: string, member: MemberPrincipal) {
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
    const appointment = await this.appointments
      .findOne({
        _id: new Types.ObjectId(id),
        [ownershipField]: member._id,
      })
      .select({
        _id: 1,
        specialty: 1,
        source: 1,
        version: 1,
        startsAt: 1,
        endsAt: 1,
        durationMinutes: 1,
        status: 1,
        doctorId: 1,
        clinicId: 1,
        patientId: 1,
        doctorChangeRequest: 1,
        lastChangedBy: 1,
        canceledAt: 1,
        canceledBy: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean()
      .exec();
    if (!appointment) throw new NotFoundException('Appointment not found');
    return {
      ...appointment,
      source: appointment.source ?? AppointmentSource.LEGACY,
    };
  }

  async listMyAppointments(member: MemberPrincipal) {
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
    if (!ownershipField) return [];
    return this.appointments
      .find({ [ownershipField]: member._id })
      .select({
        _id: 1,
        startsAt: 1,
        endsAt: 1,
        durationMinutes: 1,
        status: 1,
        doctorId: 1,
        clinicId: 1,
        patientId: 1,
        doctorChangeRequest: 1,
        lastChangedBy: 1,
        canceledAt: 1,
        canceledBy: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ startsAt: -1 })
      .limit(200)
      .lean()
      .exec();
  }
}
