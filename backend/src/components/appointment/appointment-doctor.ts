import { BadRequestException } from '@nestjs/common';
import type { ClientSession, Model } from 'mongoose';
import {
  DoctorClinicStatus,
  DoctorSpecialization,
  MemberStatus,
  MemberType,
} from '../../libs/enum/member.enum.js';
import type { MemberEntity } from '../../libs/types/member.types.js';

/** Shared eligibility reads; callers retain authorization and transaction ownership. */
export async function requireAppointmentDoctor(
  members: Model<MemberEntity>,
  input: {
    doctorId: string;
    clinicId: string;
    specialty?: DoctorSpecialization;
  },
  purpose: 'booking' | 'schedule',
  session?: ClientSession,
) {
  if (
    purpose === 'schedule' &&
    ![input.doctorId, input.clinicId].every((id) => /^[a-f\d]{24}$/i.test(id))
  )
    throw new BadRequestException('Invalid clinic or doctor ID');

  const clinic = await members
    .findOne({
      _id: input.clinicId,
      memberType: MemberType.CLINIC,
      memberStatus: MemberStatus.ACTIVE,
      deletedAt: null,
    })
    .select({ clinicTimezone: 1, authVersion: 1 })
    .session(session ?? null)
    .lean()
    .exec();
  const doctor = await members
    .findOne({
      _id: input.doctorId,
      clinicId: input.clinicId,
      memberType: MemberType.DOCTOR,
      memberStatus: MemberStatus.ACTIVE,
      deletedAt: null,
      doctorClinicStatus: DoctorClinicStatus.APPROVED,
    })
    .select({ doctorSpecializations: 1 })
    .session(session ?? null)
    .lean()
    .exec();

  // Preserve each API's existing error text and validation order.
  const scheduleTimezoneInvalid =
    !clinic ||
    typeof clinic.clinicTimezone !== 'string' ||
    !clinic.clinicTimezone;
  if (!clinic || !doctor || (purpose === 'schedule' && scheduleTimezoneInvalid))
    throw new BadRequestException(
      purpose === 'booking'
        ? 'An active clinic and its approved doctor are required'
        : 'An active clinic and approved doctor with a valid timezone are required',
    );
  if (
    (purpose === 'booking' || input.specialty !== undefined) &&
    (!Array.isArray(doctor.doctorSpecializations) ||
      !doctor.doctorSpecializations.includes(input.specialty!))
  )
    throw new BadRequestException(
      purpose === 'booking'
        ? 'Doctor does not offer the selected specialty'
        : 'Doctor does not offer this specialty',
    );
  if (
    purpose === 'booking' &&
    (typeof clinic.clinicTimezone !== 'string' || !clinic.clinicTimezone.trim())
  )
    throw new BadRequestException('Clinic timezone is invalid');
  return clinic;
}
