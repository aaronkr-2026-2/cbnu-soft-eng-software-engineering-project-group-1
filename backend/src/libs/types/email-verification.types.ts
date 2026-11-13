export type DeliveryState = 'PENDING' | 'ACCEPTED' | 'AMBIGUOUS' | 'REJECTED';
export interface EmailSendLimit {
  _id: string;
  version: number;
  initialSent: boolean;
  groupCount: number;
  blockLevel: number;
  blockedUntil: Date;
  nextSendAt: Date;
  lastSendAttemptAt: Date;
  activeChallengeId?: string;
  pending?: { id: string; until: Date };
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
