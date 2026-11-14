import { print } from 'graphql';
import { getAccessToken } from '../auth-session';
import { SessionError } from './session';
import {
  ACCOUNT_DELETION_READINESS,
  DELETE_ACCOUNT,
} from '../../apollo/user/account-deletion';
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

export class AccountDeletionError extends BookingError {
  constructor(
    message: string,
    code = '',
    readonly reason = '',
    uncertain = false,
  ) {
    super(message, code, undefined, uncertain);
  }
}

// Authentication errors must reach the persistent dialog before session cleanup.
// The normal care helper clears session state immediately on a rejected token.
export async function deleteAccount(
  signal: AbortSignal,
  memberId?: string,
): Promise<void> {
  const endpoint =
    process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim() ||
    (process.env.NEXT_PUBLIC_API_URL?.trim()
      ? `${process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/$/, '')}/graphql`
      : '');
  if (!endpoint)
    throw new AccountDeletionError(
      'Account deletion is temporarily unavailable.',
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  let sent = false;
  try {
    const token = await getAccessToken(memberId);
    controller.signal.throwIfAborted();
    sent = true;
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: print(DELETE_ACCOUNT),
        variables: {
          input: { memberStatus: 'DELETED', deletionAgreement: true },
        },
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    const issue = body?.errors?.[0];
    const code =
      response.status === 401
        ? 'UNAUTHENTICATED'
        : String(issue?.extensions?.code || '');
    if (!response.ok || body?.errors?.length) {
      const reason = String(issue?.extensions?.accountDeletion?.reason || '');
      const known = [
        'BAD_USER_INPUT',
        'GRAPHQL_VALIDATION_FAILED',
        'GRAPHQL_PARSE_FAILED',
        'CONFLICT',
        'FORBIDDEN',
        'UNAUTHENTICATED',
      ].includes(code);
      const messages: Record<string, string> = {
        ACCOUNT_DELETION_BLOCKED:
          'New commitments are blocking deletion. Review the refreshed lists.',
        ACCOUNT_DELETION_DATA_UNRESOLVED:
          'Some account records need attention. Refresh or ask the clinic for help.',
        ACCOUNT_DELETION_CHANGED:
          'Your account changed. Review its current state before trying again.',
        FORBIDDEN: 'Account deletion is unavailable for this account.',
        UNAUTHENTICATED:
          'Your session was rejected. Account deletion could not be confirmed.',
      };
      throw new AccountDeletionError(
        messages[reason] ||
          messages[code] ||
          'Account deletion could not be confirmed. Check account status before making another request.',
        code,
        [
          'ACCOUNT_DELETION_BLOCKED',
          'ACCOUNT_DELETION_DATA_UNRESOLVED',
          'ACCOUNT_DELETION_CHANGED',
        ].includes(reason)
          ? reason
          : '',
        response.status >= 500 ||
          !known ||
          code === 'UNAUTHENTICATED' ||
          !!body?.data?.updateMember,
      );
    }
    if (
      body?.data?.updateMember?.requiresLogin !== true ||
      body.data.updateMember.imageCleanupPending !== false
    )
      throw new AccountDeletionError(
        'Account deletion could not be confirmed. Check account status before making another request.',
        '',
        '',
        true,
      );
  } catch (error) {
    if (error instanceof AccountDeletionError) throw error;
    if (error instanceof SessionError)
      throw new AccountDeletionError(
        'Your session has ended or changed. Account deletion could not be confirmed.',
        'UNAUTHENTICATED',
        '',
        true,
      );
    throw new AccountDeletionError(
      'Account deletion could not be confirmed. Check account status before making another request.',
      '',
      '',
      sent,
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
