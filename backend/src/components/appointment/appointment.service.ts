import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type InferSchemaType } from 'mongoose';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import {
  MemberType,
  MemberStatus,
  DoctorClinicStatus,
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
  ) {}

  async bookAppointment(input: BookAppointmentDto, member: MemberPrincipal) {
    if (member.memberType !== MemberType.USER)
      throw new ForbiddenException('Only users can book appointments');

    const models = this.bookingModels();
    const startsAt = new Date(input.startsAt);
    this.requireFutureStart(startsAt);

    const timezone = await this.requireApprovedDoctor(input, models.members);
    const slot = appointmentSlot(startsAt, timezone);
    await this.requireWorkingHours(input, slot, models);
    await this.requireFreeSlot(
      input.doctorId,
      startsAt,
      slot.endsAt,
      models.appointments,
    );

    // Availability checks may take time; recheck immediately before saving.
    this.requireFutureStart(startsAt);
    return this.createBooking(
      input,
      member._id,
      startsAt,
      slot.endsAt,
      models.appointments,
    );
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
  ) {
    const [clinic, doctor] = await Promise.all([
      members
        .findOne({
          _id: input.clinicId,
          memberType: MemberType.CLINIC,
          memberStatus: MemberStatus.ACTIVE,
          deletedAt: null,
        })
        .select({ clinicTimezone: 1 })
        .lean()
        .exec(),
      members
        .findOne({
          _id: input.doctorId,
          memberType: MemberType.DOCTOR,
          memberStatus: MemberStatus.ACTIVE,
          deletedAt: null,
          clinicId: input.clinicId,
          doctorClinicStatus: DoctorClinicStatus.APPROVED,
        })
        .select({ _id: 1 })
        .lean()
        .exec(),
    ]);
    if (!clinic || !doctor)
      throw new BadRequestException(
        'An active clinic and its approved doctor are required',
      );
    return clinic.clinicTimezone;
  }

  private async requireWorkingHours(
    { doctorId, clinicId }: Pick<BookAppointmentDto, 'doctorId' | 'clinicId'>,
    slot: ReturnType<typeof appointmentSlot>,
    {
      availability,
      overrideModel,
    }: ReturnType<AppointmentService['bookingModels']>,
  ) {
    const scope = { doctorId, clinicId };
    const overrides = await overrideModel
      .find({ ...scope, date: slot.date })
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
      throw new ConflictException('Doctor is unavailable for this slot');
    }
  }

  private async requireFreeSlot(
    doctorId: string,
    startsAt: Date,
    endsAt: Date,
    appointments: Model<AppointmentEntity>,
  ) {
    // Ensure model initialization (including the unique active-slot index) completes.
    await appointments.init();
    const occupied = await appointments.exists({
      doctorId,
      status: { $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
    });
    if (occupied)
      throw new ConflictException('Appointment slot is already booked');
  }

  private async createBooking(
    input: BookAppointmentDto,
    patientId: Types.ObjectId,
    startsAt: Date,
    endsAt: Date,
    appointments: Model<AppointmentEntity>,
  ) {
    try {
      const appointment = await appointments.create({
        doctorId: input.doctorId,
        clinicId: input.clinicId,
        patientId,
        startsAt,
        endsAt,
        status: AppointmentStatus.PENDING,
        lastChangedBy: patientId,
      });
      const { __v, ...result } = appointment.toObject();
      return result;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException('Appointment slot is already booked');
      }
      throw error;
    }
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
    return appointment;
  }
}
