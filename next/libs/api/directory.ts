import { print, type DocumentNode } from 'graphql';
import {
  SEARCH_DOCTORS,
  SUGGEST_DOCTOR_NAMES,
} from '../../apollo/user/directory';
import type { PublicMember } from './public-members';
import type { DirectoryFilters } from '../directory';

export type DirectoryPage = {
  entries: PublicMember[];
  total: number;
  page: number;
  limit: number;
};
async function read(doc: DocumentNode, input: object, signal: AbortSignal) {
  const endpoint = process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 10000);
  try {
    if (!endpoint) throw new Error('Missing directory endpoint');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({ query: print(doc), variables: { input } }),
    });
    const body = await response.json();
    if (!response.ok || body.errors?.length || !body.data)
      throw new Error('Directory request failed');
    return body.data;
  } catch {
    throw new Error('We couldn’t load this information. Please try again.');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
function filterInput(
  filters: Pick<DirectoryFilters, 'name' | 'city' | 'specialty'>,
) {
  return {
    ...(filters.name ? { name: filters.name.trim() } : {}),
    ...(filters.city ? { city: filters.city } : {}),
    ...(filters.specialty ? { specialty: filters.specialty } : {}),
  };
}
export async function searchDoctors(
  filters: DirectoryFilters,
  signal: AbortSignal,
): Promise<DirectoryPage> {
  const result = (
    await read(
      SEARCH_DOCTORS,
      {
        ...filterInput(filters),
        sort: filters.sort,
        page: filters.page,
        limit: 12,
      },
      signal,
    )
  ).searchDoctors;
  if (
    !result ||
    !Array.isArray(result.entries) ||
    result.entries.some(
      (row: PublicMember) =>
        !row ||
        typeof row._id !== 'string' ||
        typeof row.memberNick !== 'string',
    ) ||
    !Number.isInteger(result.total) ||
    result.total < 0 ||
    result.page !== filters.page ||
    result.limit !== 12 ||
    result.entries.length > 12
  )
    throw new Error('Invalid directory response. Please try again.');
  return result;
}
export async function suggestDoctorNames(
  filters: Pick<DirectoryFilters, 'name' | 'city' | 'specialty'>,
  signal: AbortSignal,
): Promise<string[]> {
  if (Array.from(filters.name.trim()).length < 2) return [];
  const result = (
    await read(SUGGEST_DOCTOR_NAMES, filterInput(filters), signal)
  ).suggestDoctorNames;
  if (
    !Array.isArray(result) ||
    result.length > 8 ||
    result.some((name) => typeof name !== 'string')
  )
    throw new Error('Invalid suggestions');
  return result;
}
