import { Injectable, Optional, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, InferSchemaType, Model } from 'mongoose';
import {
  BOOKING_POLICY,
  BOOKING_POLICY_ID,
  BOOKING_MIGRATION_VERSION,
  BookingPolicySchema,
} from '../../schemas/booking-policy.model.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../../schemas/appointment.model.js';
import { BookingCoordinationService } from './booking-coordination.service.js';
import { BookingMigrationService } from './booking-migration.service.js';
import { bookingPolicyEnabled } from './booking.config.js';
import { BookingUnavailableException } from './booking-error.js';

@Injectable()
export class BookingPolicyService implements OnModuleInit {
  constructor(
    private readonly coordination: BookingCoordinationService,
    private readonly migration: BookingMigrationService,
    @Optional()
    @InjectModel(BOOKING_POLICY)
    private readonly policy?: Model<
      InferSchemaType<typeof BookingPolicySchema>
    >,
    @Optional()
    @InjectModel(APPOINTMENT_MODEL_NAME)
    private readonly appointments?: Model<
      InferSchemaType<typeof AppointmentSchema>
    >,
  ) {}

  async onModuleInit() {
    if (!bookingPolicyEnabled()) return;
    await this.coordination.prepare();
    if (!this.appointments)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    await this.appointments.createIndexes();
    await this.assertReady();
    const audit = await this.migration.auditSnapshot();
    if (audit.issues.length || !audit.ledgerMatches || !audit.metadataMatches)
      throw new BookingUnavailableException('MIGRATION_REQUIRED');
  }

  async assertReady(session?: ClientSession) {
    if (!bookingPolicyEnabled())
      throw new BookingUnavailableException('FEATURE_DISABLED');
    await this.assertMigrated(session);
  }

  // Existing commitments remain cancellable while new booking is paused.
  async assertMigrated(session?: ClientSession) {
    if (!this.policy)
      throw new BookingUnavailableException('BOOKING_UNAVAILABLE');
    const ready = await this.policy
      .exists({
        _id: BOOKING_POLICY_ID,
        state: 'READY',
        migrationVersion: BOOKING_MIGRATION_VERSION,
      })
      .session(session ?? null);
    if (!ready) throw new BookingUnavailableException('MIGRATION_REQUIRED');
  }
}
