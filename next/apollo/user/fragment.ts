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
