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

function apiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  // Existing installations can continue to use their GraphQL URL setting.
  const graphql = process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim();
  const base = configured || graphql?.replace(/\/graphql\/?$/, '');
  if (!base)
    throw new Error(
      'Sign-in is temporarily unavailable. Please try again later.',
    );
  return base.replace(/\/$/, '');
}

// Email/password auth only. OAuth can supply the same AuthResult later.
export async function authenticate(
  mode: 'signin' | 'signup',
  input: LoginInput | SignupInput,
  signal: AbortSignal,
): Promise<AuthResult> {
  const endpoint = `${apiBase()}/member/${mode === 'signup' ? 'signup' : 'login'}`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
    } catch {
      throw new Error(
        mode === 'signup'
          ? 'We couldn’t confirm whether your account was created. Try signing in before submitting again.'
          : 'We couldn’t reach sign-in. Check your connection and try again.',
      );
    }
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: 'Please check your details and try again.',
        401: 'The email or password is incorrect, or the account is unavailable.',
        403: 'This account cannot sign in right now.',
        409: 'An account with these details already exists. Try signing in.',
        429: 'Too many attempts. Please wait a moment before trying again.',
      };
      throw new Error(
        messages[response.status] ||
          'Sign-in is temporarily unavailable. Please try again later.',
      );
    }
    // Consume only the member and access token; do not persist refresh tokens.
    const result = await response.json().catch(() => null);
    if (
      !result ||
      typeof result.accessToken !== 'string' ||
      typeof result.member?._id !== 'string' ||
      typeof result.member?.memberNick !== 'string' ||
      !['USER', 'DOCTOR', 'CLINIC', 'ADMIN'].includes(result.member?.memberType)
    ) {
      throw new Error(
        'We couldn’t complete sign-in. Please try signing in again.',
      );
    }
    return {
      member: {
        _id: result.member._id,
        memberNick: result.member.memberNick,
        memberType: result.member.memberType,
        memberFullName:
          typeof result.member.memberFullName === 'string'
            ? result.member.memberFullName
            : undefined,
      },
      accessToken: result.accessToken,
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
