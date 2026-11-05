import { gql } from '@apollo/client';
import { APPOINTMENT_FIELDS } from './fragment';

// Requires a USER access token. The backend derives patientId from that token.
export const BOOK_APPOINTMENT = gql`
  mutation BookAppointment($input: BookAppointmentInput!) {
    bookAppointment(input: $input) {
      ...AppointmentFields
    }
  }
  ${APPOINTMENT_FIELDS}
`;
