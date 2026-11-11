import { WAITLIST, WaitlistSchema } from '../../schemas/waitlist.model.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getMongoUri } from '../../database/database.config.js';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../../schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../../schemas/booking-commitment.model.js';
import { BookingCoordinationService } from './booking-coordination.service.js';
import { BookingPolicyService } from './booking-policy.service.js';
import { BookingMigrationService } from './booking-migration.service.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import MemberSchema, { MEMBER } from '../../schemas/member.model.js';
import {
  BOOKING_POLICY,
  BookingPolicySchema,
} from '../../schemas/booking-policy.model.js';

@Module({
  imports: getMongoUri()
    ? [
        MongooseModule.forFeature([
          { name: BOOKING_GATE, schema: BookingGateSchema },
          { name: BOOKING_COMMITMENT, schema: BookingCommitmentSchema },
          { name: APPOINTMENT_MODEL_NAME, schema: AppointmentSchema },
          { name: MEMBER, schema: MemberSchema },
          { name: BOOKING_POLICY, schema: BookingPolicySchema },
          { name: WAITLIST, schema: WaitlistSchema },
        ]),
      ]
    : [],
  providers: [
    BookingCoordinationService,
    BookingMigrationService,
    BookingPolicyService,
  ],
  exports: [
    BookingCoordinationService,
    BookingPolicyService,
    BookingMigrationService,
  ],
})
export class BookingModule {}
