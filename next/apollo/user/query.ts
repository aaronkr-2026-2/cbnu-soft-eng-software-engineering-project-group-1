import { gql } from '@apollo/client';
import { APPOINTMENT_FIELDS, MEMBER_FIELDS } from './fragment';

// Member discovery is public; appointment queries require an access token.
export const GET_MEMBER = gql`
  query GetMember($id: ID!) {
    getMember(id: $id) {
      ...MemberFields
    }
  }
  ${MEMBER_FIELDS}
`;

export const GET_CLINICS = gql`
  query GetClinics {
    getClinics {
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

export const GET_APPOINTMENT = gql`
  query GetAppointment($id: ID!) {
    getAppointment(id: $id) {
      ...AppointmentFields
    }
  }
  ${APPOINTMENT_FIELDS}
`;

export const MY_APPOINTMENTS = gql`
  query MyAppointments {
    myAppointments {
      ...AppointmentFields
    }
  }
  ${APPOINTMENT_FIELDS}
`;
