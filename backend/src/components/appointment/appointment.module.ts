import { WaitlistModule } from '../waitlist/waitlist.module.js';
import { AppointmentCommitmentService } from './appointment-commitment.service.js';
import { AppointmentCommitmentResolver } from './appointment-commitment.resolver.js';
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
  APPOINTMENT_EVENT,
  AppointmentEventSchema,
} from '../../schemas/appointment-event.model.js';
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
    WaitlistModule,
    ...(mongoUri
      ? [
          MongooseModule.forFeature([
            { name: MEMBER, schema: MemberSchema },
            { name: APPOINTMENT_MODEL_NAME, schema: AppointmentSchema },
            { name: APPOINTMENT_EVENT, schema: AppointmentEventSchema },
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
    AppointmentCommitmentService,
    AppointmentCommitmentResolver,
    AppointmentResolver,
    AppointmentScheduleService,
    AppointmentScheduleResolver,
  ],
})
export class AppointmentModule {}
