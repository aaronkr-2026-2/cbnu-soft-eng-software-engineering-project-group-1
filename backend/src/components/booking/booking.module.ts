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

@Module({
  imports: getMongoUri()
    ? [
        MongooseModule.forFeature([
          { name: BOOKING_GATE, schema: BookingGateSchema },
          { name: BOOKING_COMMITMENT, schema: BookingCommitmentSchema },
        ]),
      ]
    : [],
  providers: [BookingCoordinationService],
  exports: [BookingCoordinationService],
})
export class BookingModule {}
