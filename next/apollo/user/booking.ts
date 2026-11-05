import { gql } from '@apollo/client';
export const BOOKING_APPOINTMENT = gql`
  fragment BookingAppointment on Appointment {
    _id
    patientId
    doctorId
    clinicId
    specialty
    startsAt
    endsAt
    version
    status
    source
  }
`;
export const BOOKING_WAITLIST = gql`
  fragment BookingWaitlist on WaitlistEntry {
    _id
    doctorId
    clinicId
    specialty
    startsAt
    endsAt
    version
    status
    queuePosition
    automaticBookingEnabled
    automaticBookingEligible
    automaticBookingConsent
    consentedAt
    consentPolicyVersion
    appointmentId
  }
`;
export const AVAILABLE_SLOTS = gql`
  query BookingSlots($input: AvailableSlotsInput!) {
    getAvailableSlots(input: $input) {
      doctorId
      clinicId
      specialty
      startsAt
      endsAt
      clinicTimezone
      state
      waitlistEligible
      canJoinWaitlist
    }
  }
`;
export const OWN_APPOINTMENTS = gql`
  query PatientAppointments($input: MyAppointmentsInput!) {
    myAppointments(input: $input) {
      entries {
        ...BookingAppointment
      }
      nextCursor
    }
  }
  ${BOOKING_APPOINTMENT}
`;
export const OWN_WAITLIST = gql`
  query PatientWaitlist($input: MyWaitlistInput!) {
    myWaitlist(input: $input) {
      entries {
        ...BookingWaitlist
      }
      nextCursor
    }
  }
  ${BOOKING_WAITLIST}
`;
export const APPOINTMENT_DETAIL = gql`
  query PatientAppointment($id: ID!) {
    getAppointment(id: $id) {
      ...BookingAppointment
    }
  }
  ${BOOKING_APPOINTMENT}
`;
export const WAITLIST_DETAIL = gql`
  query PatientWaitlistEntry($id: ID!) {
    getWaitlist(id: $id) {
      ...BookingWaitlist
    }
  }
  ${BOOKING_WAITLIST}
`;
export const CREATE_BOOKING = gql`
  mutation PatientBook($input: BookAppointmentInput!) {
    bookAppointment(input: $input) {
      ...BookingAppointment
    }
  }
  ${BOOKING_APPOINTMENT}
`;
export const JOIN_WAITLIST = gql`
  mutation PatientJoin($input: JoinWaitlistInput!) {
    joinWaitlist(input: $input) {
      ...BookingWaitlist
    }
  }
  ${BOOKING_WAITLIST}
`;
export const REPLACE = gql`
  mutation PatientReplace($input: ReplaceCommitmentInput!) {
    replaceCommitment(input: $input) {
      kind
      appointment {
        ...BookingAppointment
      }
      waitlist {
        ...BookingWaitlist
      }
    }
  }
  ${BOOKING_APPOINTMENT}
  ${BOOKING_WAITLIST}
`;
export const CANCEL = gql`
  mutation PatientCancel($id: ID!) {
    cancelAppointment(id: $id) {
      ...BookingAppointment
    }
  }
  ${BOOKING_APPOINTMENT}
`;
export const WITHDRAW = gql`
  mutation PatientWithdraw($id: ID!) {
    leaveWaitlist(id: $id) {
      ...BookingWaitlist
    }
  }
  ${BOOKING_WAITLIST}
`;
