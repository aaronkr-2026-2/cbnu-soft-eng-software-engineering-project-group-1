import {
  BadRequestException,
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
import { MemberType } from '../../libs/enum/member.enum.js';
import type { MemberPrincipal } from '../../libs/types/member.types.js';

type AppointmentEntity = InferSchemaType<typeof AppointmentSchema>;

@Injectable()
export class AppointmentService {
  constructor(
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<AppointmentEntity>,
  ) {}

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
