import type { CommitmentKind, Page } from './booking';

export interface DeletionBlocker {
  id: string;
  kind: CommitmentKind;
  status: string;
  startsAt: string;
  endsAt: string;
  clinicId: string;
  doctorId: string;
  clinicName: string;
  doctorName: string;
  clinicTimezone: string;
  permittedAction: 'CANCEL_BOOKING' | 'CANCEL_WAITLIST' | 'NONE';
  resolutionReason: string | null;
}
export interface DeletionReadiness {
  asOf: string;
  ready: boolean;
  appointmentCount: number;
  waitlistCount: number;
  affiliationImpactCount: number;
  appointments: Page<DeletionBlocker>;
  waitlists: Page<DeletionBlocker>;
}
export type DeletionList = 'appointments' | 'waitlists';
export interface DeletionPageInput {
  appointmentAfter?: string;
  waitlistAfter?: string;
  appointmentLimit?: number;
  waitlistLimit?: number;
}
