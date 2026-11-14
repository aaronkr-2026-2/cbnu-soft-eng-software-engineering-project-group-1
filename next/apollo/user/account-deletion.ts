import { gql } from '@apollo/client';

export const ACCOUNT_DELETION_READINESS = gql`
  query AccountDeletionReadiness($input: AccountDeletionPageInput!) {
    accountDeletionReadiness(input: $input) {
      asOf
      ready
      appointmentCount
      waitlistCount
      affiliationImpactCount
      appointments {
        nextCursor
        entries {
          ...DeletionBlockerFields
        }
      }
      waitlists {
        nextCursor
        entries {
          ...DeletionBlockerFields
        }
      }
    }
  }
  fragment DeletionBlockerFields on AccountDeletionEntry {
    id
    kind
    status
    startsAt
    endsAt
    clinicId
    doctorId
    clinicName
    doctorName
    clinicTimezone
    permittedAction
    resolutionReason
  }
`;
