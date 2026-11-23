import { gql } from '@apollo/client';
import { MEMBER_FIELDS } from './fragment';
import { BOOKING_APPOINTMENT } from './booking';
export const CALENDAR = gql`
  query WorkspaceCalendar($input: CalendarInput!) {
    myCalendar(input: $input) {
      entries {
        _id
        patientId
        doctorId
        clinicId
        specialty
        startsAt
        endsAt
        status
        source
        version
        clinicTimezone
      }
      revision
      nextCursor
      clinicTimezone
    }
  }
`;
export const CALENDAR_UPDATES = gql`
  query WorkspaceUpdates($input: CalendarUpdatesInput!) {
    calendarUpdates(input: $input) {
      revision
      changed
      pollAfterSeconds
    }
  }
`;
export const CLINIC_TEAM = gql`
  query WorkspaceTeam {
    myClinicDoctors {
      ...MemberFields
    }
  }
  ${MEMBER_FIELDS}
`;
export const REVIEW_DOCTOR = gql`
  mutation WorkspaceReviewDoctor($doctorId: ID!, $approve: Boolean!) {
    reviewDoctorAffiliation(doctorId: $doctorId, approve: $approve)
  }
`;
export const WEEKLY_HOURS = gql`
  mutation WorkspaceWeeklyHours($input: DoctorWeeklyHoursInput!) {
    setDoctorWeeklyHours(input: $input)
  }
`;
export const DATE_OVERRIDES = gql`
  mutation WorkspaceDateOverrides($input: DoctorDateOverridesInput!) {
    setDoctorDateOverrides(input: $input)
  }
`;
export const STAFF_BOOKING = gql`
  mutation WorkspaceStaffBooking($input: ClinicAppointmentInput!) {
    createClinicAppointment(input: $input) {
      ...BookingAppointment
    }
  }
  ${BOOKING_APPOINTMENT}
`;
export const APPOINTMENT_OUTCOME = gql`
  mutation WorkspaceOutcome($id: ID!, $outcome: AppointmentOutcome!) {
    setAppointmentOutcome(id: $id, outcome: $outcome) {
      ...BookingAppointment
    }
  }
  ${BOOKING_APPOINTMENT}
`;
