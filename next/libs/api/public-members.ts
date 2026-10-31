import { print } from 'graphql';
import { GET_MEMBER, GET_DOCTORS } from '../../apollo/user/query';

export interface PublicMember {
  _id: string;
  clinicId?: string | null;
  memberType?: string;
  doctorClinicStatus?: string;
  memberStatus?: string;
  memberNick: string;
  memberFullName?: string | null;
  memberImage?: string | null;
  memberAddress?: string | null;
  memberDesc?: string | null;
  clinicName?: string | null;
  clinicTimezone?: string | null;
  doctorSpecializations?: string[] | null;
}
export function memberName(member: PublicMember) {
  return member.clinicName || member.memberFullName || member.memberNick;
}
// Public discovery only. The API lists at most 100 approved doctors. Clinics
// are resolved from that list; no private clinic-affiliation endpoint is used.
export async function fetchMembers(
  clinicId: string | undefined,
  signal: AbortSignal,
  directory: 'clinics' | 'doctors' = 'clinics',
): Promise<PublicMember[]> {
  const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim();
  if (!endpoint)
    throw new Error(
      'Directory information is temporarily unavailable. Please try again later.',
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 10000);
  async function read(query: string, variables: object) {
    const response = await fetch(endpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error('HTTP error');
    const result = await response.json();
    if (result.errors?.length || !result.data) throw new Error('GraphQL error');
    return result.data;
  }
  try {
    const result = await read(print(GET_DOCTORS), {});
    if (!Array.isArray(result.getDoctors)) throw new Error('Invalid directory');
    const doctors: PublicMember[] = result.getDoctors.filter(
      (row: PublicMember) =>
        row &&
        typeof row._id === 'string' &&
        typeof row.memberNick === 'string',
    );
    if (clinicId) return doctors.filter((row) => row.clinicId === clinicId);
    if (directory === 'doctors') return doctors;
    const ids = [
      ...new Set(
        doctors
          .map((row) => row.clinicId)
          .filter(
            (id): id is string =>
              typeof id === 'string' && /^[a-f\d]{24}$/i.test(id),
          ),
      ),
    ];
    const clinics: PublicMember[] = [];
    // Bound fan-out rather than opening 100 simultaneous requests.
    for (let start = 0; start < ids.length; start += 8) {
      const batch = await Promise.all(
        ids.slice(start, start + 8).map(async (id) => {
          const value = (await read(print(GET_MEMBER), { id }))
            .getMember as PublicMember;
          return value?.memberType === 'CLINIC' ? value : undefined;
        }),
      );
      clinics.push(...batch.filter((row): row is PublicMember => !!row));
    }
    return clinics.sort((a, b) => memberName(a).localeCompare(memberName(b)));
  } catch {
    throw new Error('We couldn’t load this information. Please try again.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
