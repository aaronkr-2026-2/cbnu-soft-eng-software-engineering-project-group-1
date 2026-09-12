import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  APPOINTMENT_MODEL_NAME,
  default as AppointmentSchema,
} from '../libs/schemas/appointment.model.js';
import {
  DOCTOR_AVAILABILITY_MODEL_NAME,
  default as DoctorAvailabilitySchema,
} from '../libs/schemas/doctor-availability.model.js';
import {
  DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME,
  default as DoctorAvailabilityOverrideSchema,
} from '../libs/schemas/doctor-availability-override.model.js';

const mongoUri = process.env.MONGO_URI ??
  (process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV);

@Module({
  imports: mongoUri
    ? [
        MongooseModule.forFeature([
          { name: APPOINTMENT_MODEL_NAME, schema: AppointmentSchema },
          { name: DOCTOR_AVAILABILITY_MODEL_NAME, schema: DoctorAvailabilitySchema },
          { name: DOCTOR_AVAILABILITY_OVERRIDE_MODEL_NAME, schema: DoctorAvailabilityOverrideSchema },
        ]),
      ]
    : [],
})
export class AppointmentsModule {}
