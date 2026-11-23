import { gql } from '@apollo/client';
import { MEMBER_FIELDS } from './fragment';

export const SEARCH_DOCTORS = gql`
  query SearchDoctors($input: DirectorySearchInput!) {
    searchDoctors(input: $input) {
      entries {
        ...MemberFields
        location
      }
      total
      page
      limit
    }
  }
  ${MEMBER_FIELDS}
`;
export const SUGGEST_DOCTOR_NAMES = gql`
  query SuggestDoctorNames($input: DirectoryNameSuggestionsInput!) {
    suggestDoctorNames(input: $input)
  }
`;

export const SEARCH_CLINICS = gql`
  query SearchClinics($input: DirectorySearchInput!) {
    searchClinics(input: $input) {
      entries {
        ...MemberFields
        location
      }
      total
      page
      limit
    }
  }
  ${MEMBER_FIELDS}
`;

export const SUGGEST_CLINIC_NAMES = gql`
  query SuggestClinicNames($input: DirectoryNameSuggestionsInput!) {
    suggestClinicNames(input: $input)
  }
`;
