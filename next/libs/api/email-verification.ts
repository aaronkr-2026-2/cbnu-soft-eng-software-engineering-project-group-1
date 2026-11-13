import { emailChallenge, emailProof } from '../email-verification-contract';
import { sessionRequest, SessionError } from './session';
export async function requestEmailCode(
  memberEmail: string,
  requestId: string,
  signal: AbortSignal,
) {
  const raw = await sessionRequest<unknown>(
    'email-request',
    { memberEmail, requestId },
    signal,
  );
  const result = emailChallenge(raw);
  if (!result)
    throw new SessionError(503, false, 'EMAIL_VERIFICATION_UNAVAILABLE', 30);
  return result;
}
export async function verifyEmailCode(
  memberEmail: string,
  challengeId: string,
  code: string,
  signal: AbortSignal,
) {
  const raw = await sessionRequest<unknown>(
    'email-verify',
    { memberEmail, challengeId, code },
    signal,
  );
  const result = emailProof(raw);
  if (!result)
    throw new SessionError(503, false, 'EMAIL_VERIFICATION_UNAVAILABLE', 30);
  return result;
}
