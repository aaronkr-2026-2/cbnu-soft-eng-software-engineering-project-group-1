import { ACCOUNT_DELETION_READINESS } from '../../apollo/user/account-deletion';
import { CANCEL, WITHDRAW } from '../../apollo/user/booking';
import { BookingError, careRequest } from './booking';
import { idPattern } from '../booking';
import type {
  DeletionBlocker,
  DeletionPageInput,
  DeletionReadiness,
} from '../../types/account-deletion';

export async function deletionReadiness(
  input: DeletionPageInput,
  signal: AbortSignal,
): Promise<DeletionReadiness> {
  const data = (
    await careRequest<{ accountDeletionReadiness: DeletionReadiness }>(
      ACCOUNT_DELETION_READINESS,
      { input },
      signal,
    )
  ).accountDeletionReadiness;
  const validCount = (count: number) =>
    Number.isSafeInteger(count) && count >= 0;
  if (
    !data ||
    typeof data.asOf !== 'string' ||
    !Number.isFinite(Date.parse(data.asOf)) ||
    ![
      data.appointmentCount,
      data.waitlistCount,
      data.affiliationImpactCount,
    ].every(validCount) ||
    typeof data.ready !== 'boolean' ||
    data.ready !== (data.appointmentCount === 0 && data.waitlistCount === 0)
  )
    throw new BookingError(
      'Account commitments could not be verified. Refresh to try again.',
    );
  for (const [name, count, kind] of [
    ['appointments', data.appointmentCount, 'APPOINTMENT'],
    ['waitlists', data.waitlistCount, 'WAITLIST'],
  ] as const) {
    const page = data[name];
    const after =
      name === 'appointments' ? input.appointmentAfter : input.waitlistAfter;
    if (
      !page ||
      !Array.isArray(page.entries) ||
      page.entries.length > count ||
      (!after && count > page.entries.length && !page.nextCursor) ||
      (page.nextCursor !== null &&
        (!idPattern.test(page.nextCursor) || !page.entries.length)) ||
      !page.entries.every(
        (row) =>
          row &&
          row.kind === kind &&
          idPattern.test(row.id) &&
          idPattern.test(row.doctorId) &&
          idPattern.test(row.clinicId) &&
          ['status', 'clinicName', 'doctorName', 'clinicTimezone'].every(
            (key) => typeof row[key as keyof DeletionBlocker] === 'string',
          ) &&
          Number.isFinite(Date.parse(row.startsAt)) &&
          Number.isFinite(Date.parse(row.endsAt)) &&
          [
            'NONE',
            kind === 'APPOINTMENT' ? 'CANCEL_BOOKING' : 'CANCEL_WAITLIST',
          ].includes(row.permittedAction),
      )
    )
      throw new BookingError(
        'Account commitments could not be verified. Refresh to try again.',
      );
  }
  return data;
}

export async function cancelDeletionBlocker(
  row: DeletionBlocker,
  signal: AbortSignal,
): Promise<void> {
  if (row.kind === 'APPOINTMENT' && row.permittedAction === 'CANCEL_BOOKING') {
    const data = await careRequest<{
      cancelAppointment: { _id: string; status: string };
    }>(CANCEL, { id: row.id }, signal, true, true);
    if (
      data.cancelAppointment?._id === row.id &&
      data.cancelAppointment.status === 'CANCELED'
    )
      return;
  } else if (
    row.kind === 'WAITLIST' &&
    row.permittedAction === 'CANCEL_WAITLIST'
  ) {
    const data = await careRequest<{
      leaveWaitlist: { _id: string; status: string };
    }>(WITHDRAW, { id: row.id }, signal, true, true);
    if (
      data.leaveWaitlist?._id === row.id &&
      data.leaveWaitlist.status === 'WITHDRAWN'
    )
      return;
  } else
    throw new BookingError(
      'This commitment must be resolved by the patient or clinic.',
      'FORBIDDEN',
    );
  throw new BookingError(
    'The cancellation could not be confirmed. Refresh current commitments.',
    '',
    undefined,
    true,
  );
}
