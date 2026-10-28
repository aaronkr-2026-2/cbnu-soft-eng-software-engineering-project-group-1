import { AppointmentResolver } from './appointment.resolver.js';
import MemberSchema, { MEMBER } from '../../schemas/member.model.js';
import { MemberModule } from '../member/member.module.js';
import { AppointmentController } from './appointment.controller.js';
import { AppointmentService } from './appointment.service.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getMongoUri } from '../../database/database.config.js';
import { BookingModule } from '../booking/booking.module.js';
import { AppointmentScheduleService } from './appointment-schedule.service.js';
import { AppointmentScheduleResolver } from './appointment-schedule.resolver.js';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../../schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../../schemas/booking-commitment.model.js';
import {
  APPOINTMENT_MODEL_NAME,
  default as AppointmentSchema,
} from '../../schemas/appointment.model.js';
import {
  DOCTOR_AVAILABILITY_MODEL_NAME,
  default as DoctorAvailabilitySchema,
} from '../../schemas/doctor-availability.model.js';
import {
  DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME,
  default as DoctorAvailabilityOverrideSchema,
} from '../../schemas/doctor-availability-override.model.js';

const mongoUri = getMongoUri();

@Module({
  imports: [
    MemberModule,
    BookingModule,
    ...(mongoUri
      ? [
          MongooseModule.forFeature([
            { name: MEMBER, schema: MemberSchema },
            { name: APPOINTMENT_MODEL_NAME, schema: AppointmentSchema },
            { name: BOOKING_GATE, schema: BookingGateSchema },
            { name: BOOKING_COMMITMENT, schema: BookingCommitmentSchema },
            {
              name: DOCTOR_AVAILABILITY_MODEL_NAME,
              schema: DoctorAvailabilitySchema,
            },
            {
              name: DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME,
              schema: DoctorAvailabilityOverrideSchema,
            },
          ]),
        ]
      : []),
  ],
  controllers: [AppointmentController],
  providers: [
    AppointmentService,
    AppointmentResolver,
    AppointmentScheduleService,
    AppointmentScheduleResolver,
  ],
})
export class AppointmentModule {}
