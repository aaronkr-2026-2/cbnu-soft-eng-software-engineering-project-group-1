import { print, type DocumentNode } from 'graphql';
import {
  IMAGE_UPLOADER,
  MY_PROFILE,
  UPDATE_MEMBER,
} from '../../apollo/user/profile';
import type { AuthMember } from './auth';

export interface SelfProfile extends AuthMember {
  memberEmail?: string | null;
  memberPhone?: string | null;
  memberAddress?: string | null;
  memberDesc?: string | null;
  memberImage?: string | null;
  canChangePassword: boolean;
  clinicName?: string | null;
  location?: string | null;
  clinicTimezone?: string | null;
  doctorSpecializations?: string[] | null;
  doctorClinicStatus?: string | null;
}
export type MemberUpdate = Partial<
  Record<
    | 'memberFullName'
    | 'memberNick'
    | 'memberPhone'
    | 'memberAddress'
    | 'memberDesc'
    | 'memberImage'
    | 'clinicName'
    | 'location'
    | 'currentPassword'
    | 'newPassword'
    | 'confirmPassword',
    string
  >
>;
export class ProfileError extends Error {
  constructor(message: string, public code = '') {
    super(message);
  }
}
function endpoint() {
  const api = process.env.NEXT_PUBLIC_API_URL?.trim();
  const url =
    process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim() ||
    (api ? `${api.replace(/\/$/, '')}/graphql` : undefined);
  if (!url)
    throw new ProfileError('Profile information is temporarily unavailable.');
  return url;
}

async function request<T>(
  document: DocumentNode,
  variables: Record<string, unknown>,
  token: string,
  signal: AbortSignal,
  file?: File,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, file ? 60000 : 15000);
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    let body: string | FormData;
    if (file) {
      // GraphQL multipart request spec. The browser supplies the multipart boundary.
      headers['Apollo-Require-Preflight'] = 'true';
      body = new FormData();
      body.append(
        'operations',
        JSON.stringify({ query: print(document), variables }),
      );
      body.append('map', JSON.stringify({ '0': ['variables.file'] }));
      body.append('0', file);
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ query: print(document), variables });
    }
    const response = await fetch(endpoint(), {
      method: 'POST',
      body,
      headers,
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    const code = result?.errors?.[0]?.extensions?.code;
    if (response.status === 401 || code === 'UNAUTHENTICATED')
      throw new ProfileError(
        'Your session has ended. Please sign in again.',
        'UNAUTHENTICATED',
      );
    if (!response.ok || result?.errors?.length) {
      const messages: Record<string, string> = {
        BAD_USER_INPUT:
          'Check your details, current password, and selected image, then try again.',
        CONFLICT:
          'Your nickname or phone may already be in use, or your profile changed. Check your details or cancel and reload your profile.',
        FORBIDDEN: 'This change is unavailable for your account.',
      };
      throw new ProfileError(
        messages[code] || 'We couldn’t complete the request. Please try again.',
        code,
      );
    }
    if (!result?.data)
      throw new ProfileError(
        'We couldn’t read your profile. Please try again.',
      );
    return result.data as T;
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError(
      'We couldn’t confirm the request. Check your connection; reload your profile before trying to save again.',
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
export async function fetchMyProfile(token: string, signal: AbortSignal) {
  return (
    await request<{ myProfile: SelfProfile }>(MY_PROFILE, {}, token, signal)
  ).myProfile;
}
export async function updateMember(
  input: MemberUpdate,
  token: string,
  signal: AbortSignal,
) {
  return (
    await request<{
      updateMember: {
        member: SelfProfile;
        requiresLogin: boolean;
        imageCleanupPending: boolean;
      };
    }>(UPDATE_MEMBER, { input }, token, signal)
  ).updateMember;
}
export async function uploadProfileImage(
  file: File,
  clinic: boolean,
  token: string,
  signal: AbortSignal,
) {
  const data = await request<{ imageUploader: string }>(
    IMAGE_UPLOADER,
    { file: null, target: clinic ? 'clinic' : 'member' },
    token,
    signal,
    file,
  );
  if (!/^\/uploads\/(member|clinic)\//.test(data.imageUploader))
    throw new ProfileError(
      'The image could not be uploaded. Please try again.',
    );
  return data.imageUploader;
}
export function profileImageUrl(path?: string | null) {
  if (!path) return '/images/users/defaultUser.svg';
  try {
    const url = new URL(path, endpoint());
    return ['http:', 'https:'].includes(url.protocol)
      ? url.href
      : '/images/users/defaultUser.svg';
  } catch {
    return '/images/users/defaultUser.svg';
  }
}
