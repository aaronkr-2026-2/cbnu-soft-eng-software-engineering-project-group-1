import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';
import type MemberSchema from '../../schemas/member.model.js';

export type MemberEntity = InferSchemaType<typeof MemberSchema> & {
  _id: Types.ObjectId;
};

export type MemberDocument = HydratedDocument<MemberEntity>;

export type MemberPublic = Pick<
  MemberEntity,
  | '_id'
  | 'memberEmail'
  | 'memberNick'
  | 'memberType'
  | 'memberStatus'
  | 'memberFullName'
  | 'memberImage'
  | 'location'
  | 'clinicId'
  | 'clinicName'
  | 'clinicTimezone'
  | 'doctorClinicStatus'
>;
export type MemberAuthResponse = {
  member: MemberPublic;
  accessToken: string;
  refreshToken: string;
};

export interface GoogleIdentity {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export type MemberPrincipal = Pick<
  MemberEntity,
  '_id' | 'memberType' | 'authVersion'
>;

export type MemberProfile = Pick<
  MemberEntity,
  | '_id'
  | 'memberType'
  | 'memberStatus'
  | 'memberNick'
  | 'memberFullName'
  | 'memberImage'
  | 'memberAddress'
  | 'memberDesc'
  | 'location'
  | 'clinicId'
  | 'clinicName'
  | 'clinicTimezone'
  | 'doctorClinicStatus'
  | 'doctorSpecializations'
>;

export type MemberSelfProfile = MemberProfile &
  Pick<MemberEntity, 'memberPhone' | 'memberEmail'> & {
    canChangePassword: boolean;
  };

export type MemberUpdateResponse = {
  member: MemberSelfProfile;
  requiresLogin: boolean;
  imageCleanupPending: boolean;
};
