import { gql } from '@apollo/client';
import { BOOKING_APPOINTMENT, BOOKING_WAITLIST } from './booking';
export const NOTIFICATION_FIELDS = gql`
  fragment PatientNotice on NotificationOutput {
    _id
    type
    message
    waitlistId
    doctorId
    clinicId
    appointmentId
    startsAt
    endsAt
    occurredAt
    readAt
  }
`;
export const MY_NOTIFICATIONS = gql`
  query PatientNotifications($input: MyNotificationsInput!) {
    myNotifications(input: $input) {
      entries {
        ...PatientNotice
      }
      nextCursor
      unreadCount
    }
  }
  ${NOTIFICATION_FIELDS}
`;
export const GET_NOTIFICATION = gql`
  query PatientNotification($id: ID!) {
    getNotification(id: $id) {
      ...PatientNotice
    }
  }
  ${NOTIFICATION_FIELDS}
`;
export const NOTIFICATION_CONTEXT = gql`
  query PatientNotificationContext($id: ID!) {
    notificationContext(id: $id) {
      notification {
        ...PatientNotice
      }
      targetKind
      checkedAt
      appointment {
        ...BookingAppointment
      }
      waitlist {
        ...BookingWaitlist
      }
      slot {
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
  }
  ${NOTIFICATION_FIELDS}
  ${BOOKING_APPOINTMENT}
  ${BOOKING_WAITLIST}
`;
export const MARK_READ = gql`
  mutation ReadPatientNotification($id: ID!) {
    markNotificationRead(id: $id) {
      ...PatientNotice
    }
  }
  ${NOTIFICATION_FIELDS}
`;
