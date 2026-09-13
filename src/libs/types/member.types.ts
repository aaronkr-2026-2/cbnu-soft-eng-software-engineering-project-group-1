import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';
import type MemberSchema from '../schemas/member.model.js';

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
