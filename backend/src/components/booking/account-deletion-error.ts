import { HttpException } from '@nestjs/common';

export type AccountDeletionReason =
  | 'ACCOUNT_DELETION_BLOCKED'
  | 'ACCOUNT_DELETION_DATA_UNRESOLVED'
  | 'ACCOUNT_DELETION_CHANGED'
  | 'ACCOUNT_DELETION_UNAVAILABLE'
  | 'ACCOUNT_DELETION_INVALID_INPUT'
  | 'ACCOUNT_DELETION_ROLE_FORBIDDEN';

export class AccountDeletionException extends HttpException {
  readonly accountDeletion: {
    reason: AccountDeletionReason;
    appointmentCount?: number;
    waitlistCount?: number;
    asOf?: string;
  };

  constructor(
    reason: AccountDeletionReason,
    status: number,
    counts?: { appointmentCount: number; waitlistCount: number; asOf: Date },
  ) {
    super('Account deletion cannot proceed', status);
    this.accountDeletion = {
      reason,
      ...(counts
        ? {
            appointmentCount: counts.appointmentCount,
            waitlistCount: counts.waitlistCount,
            asOf: counts.asOf.toISOString(),
          }
        : {}),
    };
  }
}
