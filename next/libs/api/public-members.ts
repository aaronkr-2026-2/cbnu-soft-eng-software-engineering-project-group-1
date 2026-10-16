import { print } from 'graphql';
import { GET_CLINICS, GET_CLINIC_DOCTORS } from '../../apollo/user/query';

export interface PublicMember {
  _id: string;
  memberNick: string;
  memberFullName?: string | null;
  memberAddress?: string | null;
  memberDesc?: string | null;
  clinicName?: string | null;
  clinicTimezone?: string | null;
  doctorSpecializations?: string[] | null;
}

export function memberName(member: PublicMember) {
  return member.clinicName || member.memberFullName || member.memberNick;
}

// Public discovery only. No session credentials or private appointment cache.
export async function fetchMembers(
  clinicId: string | undefined,
  signal: AbortSignal,
): Promise<PublicMember[]> {
  const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim();
  if (!endpoint)
    throw new Error(
      'Clinic information is temporarily unavailable. Please try again later.',
    );

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        query: print(clinicId ? GET_CLINIC_DOCTORS : GET_CLINICS),
        variables: clinicId ? { clinicId } : {},
      }),
    });
    if (!response.ok) throw new Error('HTTP error');
    const result = await response.json();
    const members: unknown = clinicId
      ? result.data?.getClinicDoctors
      : result.data?.getClinics;
    if (result.errors?.length || !Array.isArray(members))
      throw new Error('GraphQL error');
    return members.filter(
      (member): member is PublicMember =>
        member !== null &&
        typeof member === 'object' &&
        typeof member._id === 'string' &&
        typeof member.memberNick === 'string',
    );
  } catch {
    // Do not expose raw API errors or response bodies to visitors.
    throw new Error('We couldn’t load this information. Please try again.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
