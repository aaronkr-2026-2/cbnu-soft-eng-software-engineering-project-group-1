import { gql } from '@apollo/client';
import { MEMBER_FIELDS } from './fragment';

// Member discovery is public.
export const GET_MEMBER = gql`
  query GetMember($id: ID!) {
    getMember(id: $id) {
      ...MemberFields
    }
  }
  ${MEMBER_FIELDS}
`;

export const GET_DOCTORS = gql`
  query GetDoctors {
    getDoctors {
      ...MemberFields
    }
  }
  ${MEMBER_FIELDS}
`;

export const GET_CLINIC_DOCTORS = gql`
  query GetClinicDoctors($clinicId: ID!) {
    getClinicDoctors(clinicId: $clinicId) {
      ...MemberFields
    }
  }
  ${MEMBER_FIELDS}
`;
