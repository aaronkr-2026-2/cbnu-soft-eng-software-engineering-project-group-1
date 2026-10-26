import { gql } from '@apollo/client';

export const MEMBER_FIELDS = gql`
  fragment MemberFields on Member {
    _id
    memberType
    memberStatus
    memberNick
    memberFullName
    memberImage
    memberAddress
    memberDesc
    clinicId
    clinicName
    clinicTimezone
    doctorClinicStatus
    doctorSpecializations
  }
`;

export const APPOINTMENT_FIELDS = gql`
  fragment AppointmentFields on Appointment {
    _id
    doctorId
    clinicId
    patientId
    startsAt
    endsAt
    durationMinutes
    status
    doctorChangeRequest {
      type
      status
      proposedStartsAt
      proposedEndsAt
      reason
      requestedAt
      reviewedAt
      reviewedBy
    }
    lastChangedBy
    canceledBy
    canceledAt
    createdAt
    updatedAt
  }
`;
