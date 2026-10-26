import { gql } from '@apollo/client';

const SELF_FIELDS = gql`
  fragment SelfFields on MemberSelf {
    _id
    memberType
    memberNick
    memberFullName
    memberEmail
    memberPhone
    memberAddress
    memberDesc
    memberImage
    canChangePassword
    clinicName
    location
    clinicTimezone
    doctorSpecializations
    doctorClinicStatus
  }
`;
export const MY_PROFILE = gql`
  query MyProfile {
    myProfile {
      ...SelfFields
    }
  }
  ${SELF_FIELDS}
`;
export const UPDATE_MEMBER = gql`
  mutation UpdateMember($input: MemberUpdateInput!) {
    updateMember(input: $input) {
      member {
        ...SelfFields
      }
      requiresLogin
      imageCleanupPending
    }
  }
  ${SELF_FIELDS}
`;
export const IMAGE_UPLOADER = gql`
  mutation ImageUploader($file: Upload!, $target: String!) {
    imageUploader(file: $file, target: $target)
  }
`;
