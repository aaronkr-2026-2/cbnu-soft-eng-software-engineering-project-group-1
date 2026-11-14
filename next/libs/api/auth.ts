import {
  verificationMessage,
  type VerificationReason,
} from '../email-verification-contract';
import { sessionRequest, SessionError } from './session';
export class AuthError extends Error {
  constructor(
    message: string,
    readonly usernameTaken = false,
    readonly verificationReason?: VerificationReason,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
export interface AuthMember {
  _id: string;
  memberNick: string;
  memberType: 'USER' | 'DOCTOR' | 'CLINIC' | 'ADMIN';
  memberFullName?: string | null;
  memberImage?: string | null;
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
  emailVerificationToken: string;
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
    const usernameTaken = error instanceof SessionError && error.usernameTaken;
    const verificationReason =
      error instanceof SessionError ? error.verificationReason : undefined;
    throw new AuthError(
      usernameTaken
        ? 'Username already taken.'
        : verificationReason
          ? verificationReason === 'EMAIL_VERIFICATION_INVALID'
            ? 'Your email verification has expired. Request a new code and verify again.'
            : verificationMessage(verificationReason)
          : messages[status] ||
            (mode === 'signup'
              ? 'We could not confirm account creation. Try signing in before submitting again.'
              : 'Sign-in is unavailable. Check your connection and try again.'),
      usernameTaken,
      verificationReason,
      error instanceof SessionError ? error.retryAfterSeconds : undefined,
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
