import {
  bookingPolicyEnabled,
  waitlistEnrollmentEnabled,
  commitmentReplacementEnabled,
  validateWaitlistFlags,
  waitlistPromotionEnabled,
  waitlistNotificationsEnabled,
  waitlistLifecycleEnabled,
} from './booking.config.js';
import { parseBookingResolutions } from './booking-migration.js';
import { ConflictException } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { graphqlConfig } from '../../libs/graphql/graphql.config.js';

describe('Booking activation and migration inputs', () => {
  it('keeps lifecycle and in-app delivery independently default off and accepts strict boolean flags', () => {
    expect(waitlistNotificationsEnabled({})).toBe(false);
    expect(waitlistLifecycleEnabled({})).toBe(false);
    expect(
      waitlistNotificationsEnabled({ WAITLIST_NOTIFICATIONS_ENABLED: 'true' }),
    ).toBe(true);
    expect(
      waitlistLifecycleEnabled({ WAITLIST_LIFECYCLE_ENABLED: 'true' }),
    ).toBe(true);
    expect(() =>
      validateWaitlistFlags({ WAITLIST_NOTIFICATIONS_ENABLED: 'yes' }),
    ).toThrow('true or false');
    expect(() =>
      validateWaitlistFlags({ WAITLIST_LIFECYCLE_ENABLED: 'yes' }),
    ).toThrow('true or false');
  });
  it('keeps promotion off until patient-visible delivery is integrated and verified', () => {
    expect(waitlistPromotionEnabled({})).toBe(false);
    expect(() =>
      waitlistPromotionEnabled({ WAITLIST_PROMOTION_ENABLED: 'true' }),
    ).toThrow('patient-visible');
    expect(() =>
      validateWaitlistFlags({ WAITLIST_PROMOTION_ENABLED: 'true' }),
    ).toThrow('patient-visible');
    expect(() =>
      waitlistPromotionEnabled({ WAITLIST_PROMOTION_ENABLED: '1' }),
    ).toThrow('true or false');
  });
  it('defaults queues and replacement off and validates flag dependencies', () => {
    expect(waitlistEnrollmentEnabled({})).toBe(false);
    expect(commitmentReplacementEnabled({})).toBe(false);
    expect(() =>
      validateWaitlistFlags({ WAITLIST_ENROLLMENT_ENABLED: 'true' }),
    ).toThrow('requires booking');
    expect(() =>
      validateWaitlistFlags({
        BOOKING_POLICY_V2_ENABLED: 'true',
        COMMITMENT_REPLACEMENT_ENABLED: 'true',
      }),
    ).toThrow('requires waitlist');
    expect(() =>
      validateWaitlistFlags({ WAITLIST_ENROLLMENT_ENABLED: 'yes' }),
    ).toThrow('true or false');
    expect(
      commitmentReplacementEnabled({
        BOOKING_POLICY_V2_ENABLED: 'true',
        WAITLIST_ENROLLMENT_ENABLED: 'true',
        COMMITMENT_REPLACEMENT_ENABLED: 'true',
      }),
    ).toBe(true);
  });
  it('does not forward arbitrary exception payloads as structured booking details', () => {
    const originalError = new ConflictException({
      message: 'Conflict',
      booking: { patientId: 'must-stay-private' },
      password: 'must-stay-private',
    });
    const error = new GraphQLError('Conflict', {
      originalError,
      path: ['bookAppointment'],
    });
    const result = graphqlConfig.formatError!(error.toJSON(), error);
    expect(result.extensions).toEqual({ code: 'CONFLICT' });
    expect(JSON.stringify(result)).not.toContain('must-stay-private');
  });
  it('defaults booking writes off and accepts only explicit boolean configuration', () => {
    expect(bookingPolicyEnabled({})).toBe(false);
    expect(bookingPolicyEnabled({ BOOKING_POLICY_V2_ENABLED: 'false' })).toBe(
      false,
    );
    expect(bookingPolicyEnabled({ BOOKING_POLICY_V2_ENABLED: 'true' })).toBe(
      true,
    );
    expect(() =>
      bookingPolicyEnabled({ BOOKING_POLICY_V2_ENABLED: '1' }),
    ).toThrow('must be true or false');
  });

  it.each([
    [{ appointmentId: 'invalid', evidenceRef: 'review' }],
    [
      {
        appointmentId: '012345678901234567890123',
        specialty: 'INVALID',
        evidenceRef: 'review',
      },
    ],
    [{ appointmentId: '012345678901234567890123', status: 'CONFIRMED' }],
    [
      {
        appointmentId: '012345678901234567890123',
        status: 'CONFIRMED',
        evidenceRef: 'review',
        patientId: 'injected',
      },
    ],
  ])('rejects malformed or unreviewed migration decisions %j', (entry) => {
    expect(() => parseBookingResolutions([entry])).toThrow(
      'Invalid booking resolution',
    );
  });

  it('rejects duplicate decisions even with differently cased IDs', () => {
    const entry = {
      appointmentId: 'abcdefabcdefabcdefabcdef',
      evidenceRef: 'review',
    };
    expect(() =>
      parseBookingResolutions([
        entry,
        { ...entry, appointmentId: entry.appointmentId.toUpperCase() },
      ]),
    ).toThrow('Duplicate appointment resolution');
  });
});
