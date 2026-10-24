import { bookingPolicyEnabled } from './booking.config.js';
import { parseBookingResolutions } from './booking-migration.js';
import { ConflictException } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { graphqlConfig } from '../../libs/graphql/graphql.config.js';

describe('Booking activation and migration inputs', () => {
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
