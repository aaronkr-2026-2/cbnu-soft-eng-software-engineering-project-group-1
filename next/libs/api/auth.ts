import { sessionRequest, SessionError } from './session';
export interface AuthMember {
  _id: string;
  memberNick: string;
  memberType: 'USER' | 'DOCTOR' | 'CLINIC' | 'ADMIN';
  memberFullName?: string | null;
}

export interface AuthResult {
  member: AuthMember;
  accessToken: string;
}

export interface LoginInput {
  memberEmail: string;
  memberPassword: string;
}

export interface SignupInput extends LoginInput {
  memberType: 'USER';
  memberNick: string;
  memberPhone: string;
  memberFullName?: string;
}

// Authentication passes through the same-origin HttpOnly refresh-cookie bridge.
export async function authenticate(
  mode: 'signin' | 'signup' | 'google',
  input: LoginInput | SignupInput | { idToken: string },
  signal: AbortSignal,
): Promise<AuthResult> {
  try {
    return await sessionRequest<AuthResult>(
      mode === 'signin' ? 'login' : mode,
      input,
      signal,
    );
  } catch (error) {
    const status = error instanceof SessionError ? error.status : 0;
    const messages: Record<number, string> = {
      400: 'Check your details and try again.',
      401: 'The credentials expired or the account is unavailable. Please sign in again.',
      403: 'This account cannot sign in right now.',
      409: 'An account with these details already exists. Use its original sign-in method.',
      429: 'Too many attempts. Please wait a moment.',
    };
    throw new Error(
      messages[status] ||
        (mode === 'signup'
          ? 'We could not confirm account creation. Try signing in before submitting again.'
          : 'Sign-in is unavailable. Check your connection and try again.'),
    );
  }
}
export async function getGoogleNonce(signal: AbortSignal): Promise<string> {
  try {
    const data = await sessionRequest<{ nonce: string }>('nonce', {}, signal);
    if (!data.nonce) throw new Error();
    return data.nonce;
  } catch {
    throw new Error('Google sign-in is unavailable. Please try again.');
  }
}
