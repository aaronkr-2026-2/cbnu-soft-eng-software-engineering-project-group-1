import { Schema, type InferSchemaType } from 'mongoose';
import { MEMBER } from './member.model.js';

export const MEMBER_SESSION = 'MemberSession';
export const MemberSessionSchema = new Schema(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: MEMBER,
      required: true,
      index: true,
    },
    refreshTokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'member_sessions' },
);
MemberSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export type MemberSessionEntity = InferSchemaType<typeof MemberSessionSchema>;
