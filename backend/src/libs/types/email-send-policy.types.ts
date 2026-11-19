// Shared policy shape; signup and recovery persist separate purpose-specific rows.
export interface EmailSendPolicyState {
  initialSent: boolean;
  groupCount: number;
  blockLevel: number;
  blockedUntil: Date;
  nextSendAt: Date;
  lastSendAttemptAt: Date;
  pending?: { id: string; until: Date };
}
