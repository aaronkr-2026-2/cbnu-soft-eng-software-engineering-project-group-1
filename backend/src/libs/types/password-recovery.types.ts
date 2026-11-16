import type { ObjectId } from 'mongodb';
import type { EmailSendPolicyState } from './email-send-policy.types.js';

export interface RecoverySendLimit extends EmailSendPolicyState {
  _id: string; // Normalized email, separate collection from signup limits.
  version: number;
}

export type RecoveryJobState =
  | 'QUEUED'
  | 'LEASED'
  | 'ACCEPTED'
  | 'AMBIGUOUS'
  | 'REJECTED'
  | 'SUPPRESSED'
  | 'EXPIRED'
  | 'CANCELED';

export interface RecoveryRequest {
  _id: string;
  email: string;
  requestId: string;
  state: RecoveryJobState;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  nextAttemptAt: Date;
  cleanupAt: Date;
  lease?: { id: string; until: Date };
}

// One current slot per member, including consumed state until cleanup/replacement.
export interface RecoveryToken {
  _id: ObjectId;
  email: string;
  jobId: string;
  generation: string;
  tokenHash: string;
  authVersion: number;
  createdAt: Date;
  expiresAt: Date;
  cleanupAt: Date;
  consumedAt?: Date;
}

// Created atomically with reset, never contains passwords or recovery tokens.
export interface RecoveryConfirmation {
  _id: string; // Deterministic reset generation, for deduplication.
  memberId: ObjectId;
  email: string;
  state: 'QUEUED' | 'LEASED' | 'SENT' | 'FAILED';
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
  nextAttemptAt: Date;
  cleanupAt: Date;
  lease?: { id: string; until: Date };
}

export type RecoveryReason =
  | 'INVALID_REQUEST'
  | 'PASSWORD_RECOVERY_INVALID'
  | 'PASSWORD_RECOVERY_THROTTLED'
  | 'PASSWORD_RECOVERY_UNAVAILABLE';
export interface RecoveryAccepted {
  accepted: true;
}
export interface RecoveryResetResult {
  passwordChanged: true;
}
