import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { BookingCommitment } from '../../libs/types/booking.types.js';
import { commitmentReplacementEnabled } from './booking.config.js';

export type BookingConflictReason =
  | 'COMMITMENT_CONFLICT'
  | 'PATIENT_OVERLAP'
  | 'SLOT_OCCUPIED'
  | 'SLOT_UNAVAILABLE'
  | 'DUPLICATE_ENTRY'
  | 'STALE_COMMITMENT'
  | 'WAITLIST_CLOSED';

// Constructed only from patient-scoped service queries. Never spread raw errors,
// member documents or persistence rows into transport responses.
export class BookingConflictException extends ConflictException {
  readonly booking: {
    reason: BookingConflictReason;
    existingCommitments: Array<{
      kind: string;
      id: string;
      version: string | null;
      doctorId: string;
      clinicId: string;
      specialty: string;
      startsAt: string;
      endsAt: string;
      status: string;
    }>;
    choices: string[];
  };

  constructor(
    reason: BookingConflictReason,
    entries: BookingCommitment[] = [],
  ) {
    const booking = {
      reason,
      existingCommitments: entries.map((entry) => ({
        kind: entry.kind,
        id: String(entry.commitmentId),
        version: entry.version ?? null,
        doctorId: String(entry.doctorId),
        clinicId: String(entry.clinicId),
        specialty: entry.specialty,
        startsAt: entry.startsAt.toISOString(),
        endsAt: entry.endsAt.toISOString(),
        status:
          entry.status ?? (entry.kind === 'WAITLIST' ? 'ACTIVE' : 'CONFIRMED'),
      })),
      choices: entries.length
        ? [
            'KEEP',
            ...(entries.length === 1 &&
            +entries[0].startsAt > Date.now() &&
            entries[0].status !== 'PENDING' &&
            commitmentReplacementEnabled()
              ? ['REPLACE']
              : []),
          ]
        : [],
    };
    const messages: Record<BookingConflictReason, string> = {
      COMMITMENT_CONFLICT: 'Patient already has a commitment within 24 hours',
      PATIENT_OVERLAP: 'Patient appointments overlap',
      SLOT_OCCUPIED: 'Appointment slot is already booked',
      SLOT_UNAVAILABLE: 'Doctor is unavailable for this slot',
      DUPLICATE_ENTRY: 'Commitment already exists',
      WAITLIST_CLOSED:
        'Waitlist enrollment requires an occupied slot at least 48 hours ahead',
      STALE_COMMITMENT: 'Slot allocation is pending or generation is stale',
    };
    super({
      statusCode: 409,
      error: 'Conflict',
      message: messages[reason],
      booking,
    });
    this.booking = booking;
  }
}

export class BookingUnavailableException extends ServiceUnavailableException {
  readonly booking: {
    reason: 'FEATURE_DISABLED' | 'MIGRATION_REQUIRED' | 'BOOKING_UNAVAILABLE';
    existingCommitments: never[];
    choices: never[];
  };
  constructor(reason: BookingUnavailableException['booking']['reason']) {
    const booking = {
      reason,
      existingCommitments: [],
      choices: [],
    } as BookingUnavailableException['booking'];
    super({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Booking is unavailable',
      booking,
    });
    this.booking = booking;
  }
}
