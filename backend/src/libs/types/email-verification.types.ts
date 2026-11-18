import type { EmailSendPolicyState } from './email-send-policy.types.js';
export type DeliveryState = 'PENDING' | 'ACCEPTED' | 'AMBIGUOUS' | 'REJECTED';
export interface EmailSendLimit extends EmailSendPolicyState {
  _id: string;
  version: number;
  activeChallengeId?: string;
}
export interface EmailVerification {
  _id: string;
  email: string;
  requestId: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  delivery: DeliveryState;
  verifiedAt?: Date;
  proofHash?: string;
  proofExpiresAt?: Date;
  consumedAt?: Date;
  cleanupAt: Date;
}
