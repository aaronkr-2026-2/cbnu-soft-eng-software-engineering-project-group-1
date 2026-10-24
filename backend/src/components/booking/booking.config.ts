export function bookingPolicyEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.BOOKING_POLICY_V2_ENABLED ?? 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error('BOOKING_POLICY_V2_ENABLED must be true or false');
  }
  return value === 'true';
}
