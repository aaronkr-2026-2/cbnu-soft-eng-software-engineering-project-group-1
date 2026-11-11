import { SessionError } from './session';
import { print, type DocumentNode } from 'graphql';
import * as documents from '../../apollo/user/booking';
import { GET_MEMBER } from '../../apollo/user/query';
import { clearSession, getAccessToken } from '../auth-session';
import { parseProblem, sameTarget } from '../booking';
import type {
  Action,
  Appointment,
  BookingProblem,
  CommitmentKind,
  Page,
  Receipt,
  RecordItem,
  Slot,
  Target,
  Waitlist,
} from '../../types/booking';
import type { PublicMember } from './public-members';
export class BookingError extends Error {
  constructor(
    message: string,
    readonly code = '',
    readonly problem?: BookingProblem,
    readonly uncertain = false,
  ) {
    super(message);
  }
}
async function request<T>(
  doc: DocumentNode,
  variables: object,
  signal: AbortSignal,
  privateData = true,
  mutation = false,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const endpoint =
      process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim() ||
      (process.env.NEXT_PUBLIC_API_URL
        ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')}/graphql`
        : '');
    if (!endpoint)
      throw new BookingError('Care information is temporarily unavailable.');
    const token = privateData ? await getAccessToken() : undefined;
    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query: print(doc), variables }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    const issue = body?.errors?.[0];
    const code = String(issue?.extensions?.code || '');
    const problem = parseProblem(issue?.extensions?.booking);
    if (response.status === 401 || code === 'UNAUTHENTICATED') {
      clearSession();
      throw new BookingError(
        'Your session ended. Sign in again before continuing.',
        'UNAUTHENTICATED',
      );
    }
    if (!response.ok || issue || !body?.data) {
      const messages: Record<string, string> = {
        COMMITMENT_CONFLICT:
          'You already have a commitment within 24 hours at this clinic and specialty.',
        PATIENT_OVERLAP: 'This time overlaps another appointment.',
        SLOT_OCCUPIED:
          'Someone else has booked this time. Choose another slot.',
        SLOT_UNAVAILABLE: 'This time is no longer available.',
        DUPLICATE_ENTRY: 'You already have this commitment. Check My Care.',
        STALE_COMMITMENT:
          'The commitment or slot changed. Refresh before choosing again.',
        WAITLIST_CLOSED:
          'Waitlists require an occupied time at least 48 hours ahead.',
        FEATURE_DISABLED:
          'New bookings or waitlist changes are currently paused.',
        MIGRATION_REQUIRED: 'This service is temporarily unavailable.',
      };
      const uncertain =
        mutation &&
        !problem &&
        (response.status >= 500 || !code || code === 'INTERNAL_SERVER_ERROR');
      throw new BookingError(
        messages[problem?.reason || ''] ||
          {
            BAD_USER_INPUT: 'Check your selections and try again.',
            FORBIDDEN: 'This action is unavailable for your account.',
            NOT_FOUND: 'This commitment is no longer available.',
          }[code] ||
          'The request could not be completed. Check current state before trying again.',
        code,
        problem,
        uncertain,
      );
    }
    return body.data as T;
  } catch (error) {
    if (error instanceof BookingError) throw error;
    if (error instanceof SessionError)
      throw new BookingError(
        'Restore your session or sign in again before continuing.',
        'UNAUTHENTICATED',
      );
    throw new BookingError(
      'We could not confirm the request. Check current state before trying again.',
      '',
      undefined,
      mutation,
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
export async function publicMember(id: string, signal: AbortSignal) {
  return (
    await request<{ getMember: PublicMember }>(
      GET_MEMBER,
      { id },
      signal,
      false,
    )
  ).getMember;
}
export async function availableSlots(
  target: Omit<Target, 'startsAt'>,
  date: string,
  signal: AbortSignal,
) {
  return (
    await request<{ getAvailableSlots: Slot[] }>(
      documents.AVAILABLE_SLOTS,
      { input: { ...target, fromDate: date, toDate: date } },
      signal,
      false,
    )
  ).getAvailableSlots;
}
export async function myAppointments(input: object, signal: AbortSignal) {
  return (
    await request<{ myAppointments: Page<Appointment> }>(
      documents.OWN_APPOINTMENTS,
      { input },
      signal,
    )
  ).myAppointments;
}
export async function myWaitlist(input: object, signal: AbortSignal) {
  return (
    await request<{ myWaitlist: Page<Waitlist> }>(
      documents.OWN_WAITLIST,
      { input },
      signal,
    )
  ).myWaitlist;
}
export async function detail(
  kind: CommitmentKind,
  id: string,
  signal: AbortSignal,
): Promise<RecordItem> {
  return kind === 'APPOINTMENT'
    ? (
        await request<{ getAppointment: Appointment }>(
          documents.APPOINTMENT_DETAIL,
          { id },
          signal,
        )
      ).getAppointment
    : (
        await request<{ getWaitlist: Waitlist }>(
          documents.WAITLIST_DETAIL,
          { id },
          signal,
        )
      ).getWaitlist;
}
export async function execute(
  action: Action,
  signal: AbortSignal,
): Promise<Receipt> {
  if (action.operation === 'CANCEL')
    return {
      operation: action.operation,
      kind: 'APPOINTMENT',
      record: (
        await request<{ cancelAppointment: Appointment }>(
          documents.CANCEL,
          { id: action.original!.id },
          signal,
          true,
          true,
        )
      ).cancelAppointment,
    };
  if (action.operation === 'WITHDRAW')
    return {
      operation: action.operation,
      kind: 'WAITLIST',
      record: (
        await request<{ leaveWaitlist: Waitlist }>(
          documents.WITHDRAW,
          { id: action.original!.id },
          signal,
          true,
          true,
        )
      ).leaveWaitlist,
    };
  const destination = {
    ...action.target,
    ...(action.kind === 'WAITLIST' ? { automaticBookingConsent: true } : {}),
  };
  if (action.operation === 'REPLACE') {
    const result = (
      await request<{
        replaceCommitment: {
          kind: CommitmentKind;
          appointment: Appointment | null;
          waitlist: Waitlist | null;
        };
      }>(
        documents.REPLACE,
        {
          input: {
            originalKind: action.original!.kind,
            originalId: action.original!.id,
            originalVersion: action.original!.version,
            destinationKind: action.kind,
            destination,
          },
        },
        signal,
        true,
        true,
      )
    ).replaceCommitment;
    return {
      operation: action.operation,
      kind: result.kind,
      record: (result.appointment || result.waitlist)!,
    };
  }
  return action.kind === 'APPOINTMENT'
    ? {
        operation: action.operation,
        kind: action.kind,
        record: (
          await request<{ bookAppointment: Appointment }>(
            documents.CREATE_BOOKING,
            { input: destination },
            signal,
            true,
            true,
          )
        ).bookAppointment,
      }
    : {
        operation: action.operation,
        kind: action.kind,
        record: (
          await request<{ joinWaitlist: Waitlist }>(
            documents.JOIN_WAITLIST,
            { input: destination },
            signal,
            true,
            true,
          )
        ).joinWaitlist,
      };
}
// Bounded, patient-scoped reads only. Never replay a write after a lost response.
export async function targetRecords(
  kind: CommitmentKind,
  target: Target,
  signal: AbortSignal,
): Promise<RecordItem[]> {
  const found: RecordItem[] = [];
  let after: string | null = null;
  for (let n = 0; n < 50; n++) {
    const page: Page<RecordItem> =
      kind === 'APPOINTMENT'
        ? await myAppointments(
            {
              limit: 100,
              from: target.startsAt,
              to: new Date(+new Date(target.startsAt) + 1).toISOString(),
              ...(after ? { after } : {}),
            },
            signal,
          )
        : await myWaitlist({ limit: 100, ...(after ? { after } : {}) }, signal);
    found.push(...page.entries.filter((row) => sameTarget(row, target)));
    after = page.nextCursor;
    if (!after) return found;
  }
  throw new BookingError(
    'There is too much history to verify this request safely. Review My Care before continuing.',
  );
}

// Reuse the authenticated, no-store transport and no-replay error semantics for
// clinic/doctor operations; Nest remains the authorization boundary.
export { request as careRequest };
