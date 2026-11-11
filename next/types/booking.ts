export type CommitmentKind = 'APPOINTMENT' | 'WAITLIST';
export interface Target {
  doctorId: string;
  clinicId: string;
  specialty: string;
  startsAt: string;
}
export interface Slot extends Target {
  endsAt: string;
  clinicTimezone: string;
  state: 'AVAILABLE' | 'OCCUPIED' | 'UNAVAILABLE';
  waitlistEligible: boolean;
  canJoinWaitlist: boolean;
}
export interface Appointment extends Target {
  _id: string;
  specialty: string;
  endsAt: string;
  version: string | null;
  status: string;
  source: string;
  patientId: string;
}
export interface Waitlist extends Target {
  _id: string;
  endsAt: string;
  version: string;
  status: string;
  queuePosition: number | null;
  automaticBookingEnabled: boolean;
  automaticBookingEligible: boolean;
  automaticBookingConsent: boolean;
  appointmentId: string | null;
  consentedAt: string;
  consentPolicyVersion: string;
}
export type RecordItem = Appointment | Waitlist;
export interface Commitment extends Target {
  kind: CommitmentKind;
  id: string;
  version: string | null;
  endsAt: string;
  status: string;
}
export interface BookingProblem {
  reason: string;
  existingCommitments: Commitment[];
  choices: string[];
}
export interface Page<T> {
  entries: T[];
  nextCursor: string | null;
}
export interface Action {
  operation: 'CREATE' | 'REPLACE' | 'CANCEL' | 'WITHDRAW';
  kind: CommitmentKind;
  target: Target;
  original?: Commitment;
}
export interface Receipt {
  kind: CommitmentKind;
  record: RecordItem;
  operation: Action['operation'];
}
