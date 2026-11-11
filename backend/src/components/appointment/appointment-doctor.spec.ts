import type { ClientSession, Model } from 'mongoose';
import { DoctorSpecialization } from '../../libs/enum/member.enum.js';
import type { MemberEntity } from '../../libs/types/member.types.js';
import { requireAppointmentDoctor } from './appointment-doctor.js';

const input = {
  doctorId: '000000000000000000000001',
  clinicId: '000000000000000000000002',
  specialty: DoctorSpecialization.CARDIOLOGIST,
};

function fixture(
  clinic: Record<string, unknown> | null = {
    clinicTimezone: 'Asia/Seoul',
    authVersion: 3,
  },
  doctor: Record<string, unknown> | null = {
    doctorSpecializations: [input.specialty],
  },
) {
  const queries = [clinic, doctor].map((row) => {
    const query = {
      select: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(row),
    };
    return query;
  });
  const findOne = jest
    .fn()
    .mockReturnValueOnce(queries[0])
    .mockReturnValueOnce(queries[1]);
  return {
    members: { findOne } as unknown as Model<MemberEntity>,
    queries,
    findOne,
  };
}

describe('shared appointment doctor eligibility', () => {
  it('keeps both booking reads in the caller transaction and scopes approved affiliation', async () => {
    const { members, queries, findOne } = fixture();
    const session = {} as ClientSession;
    await expect(
      requireAppointmentDoctor(members, input, 'booking', session),
    ).resolves.toMatchObject({ clinicTimezone: 'Asia/Seoul' });
    for (const query of queries)
      expect(query.session).toHaveBeenCalledWith(session);
    expect(findOne).toHaveBeenNthCalledWith(1, {
      _id: input.clinicId,
      memberType: 'CLINIC',
      memberStatus: 'ACTIVE',
      deletedAt: null,
    });
    expect(findOne).toHaveBeenNthCalledWith(2, {
      _id: input.doctorId,
      clinicId: input.clinicId,
      memberType: 'DOCTOR',
      memberStatus: 'ACTIVE',
      deletedAt: null,
      doctorClinicStatus: 'APPROVED',
    });
  });

  it('allows schedule management without a selected specialty and retains authVersion', async () => {
    const { members, queries } = fixture(undefined, {});
    await expect(
      requireAppointmentDoctor(
        members,
        { ...input, specialty: undefined },
        'schedule',
      ),
    ).resolves.toMatchObject({ authVersion: 3 });
    for (const query of queries)
      expect(query.session).toHaveBeenCalledWith(null);
  });

  it.each(['booking', 'schedule'] as const)(
    'rejects unsupported specialty for %s with its existing error',
    async (purpose) => {
      const { members } = fixture(undefined, { doctorSpecializations: [] });
      await expect(
        requireAppointmentDoctor(members, input, purpose),
      ).rejects.toThrow(
        purpose === 'booking'
          ? 'Doctor does not offer the selected specialty'
          : 'Doctor does not offer this specialty',
      );
    },
  );

  it.each(['booking', 'schedule'] as const)(
    'preserves missing-clinic errors for %s',
    async (purpose) => {
      const { members } = fixture(null);
      await expect(
        requireAppointmentDoctor(members, input, purpose),
      ).rejects.toThrow(
        purpose === 'booking'
          ? 'An active clinic and its approved doctor are required'
          : 'An active clinic and approved doctor with a valid timezone are required',
      );
    },
  );

  it('rejects a blank booking timezone without supplying a default', async () => {
    const { members } = fixture({ clinicTimezone: '   ' });
    await expect(
      requireAppointmentDoctor(members, input, 'booking'),
    ).rejects.toThrow('Clinic timezone is invalid');
  });

  it('propagates infrastructure failures rather than reporting ineligibility', async () => {
    const { members, queries } = fixture();
    const failure = new Error('database unavailable');
    queries[0].exec.mockRejectedValueOnce(failure);
    await expect(
      requireAppointmentDoctor(members, input, 'booking'),
    ).rejects.toBe(failure);
  });
});
