export function bookingPolicyEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.BOOKING_POLICY_V2_ENABLED ?? 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error('BOOKING_POLICY_V2_ENABLED must be true or false');
  }
  return value === 'true';
}

function flag(name: string, env: NodeJS.ProcessEnv) {
  const value = env[name] ?? 'false';
  if (value !== 'true' && value !== 'false')
    throw new Error(`${name} must be true or false`);
  return value === 'true';
}

export function waitlistEnrollmentEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return flag('WAITLIST_ENROLLMENT_ENABLED', env) && bookingPolicyEnabled(env);
}

export function commitmentReplacementEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return (
    flag('COMMITMENT_REPLACEMENT_ENABLED', env) &&
    waitlistEnrollmentEnabled(env)
  );
}

export function validateWaitlistFlags(env: NodeJS.ProcessEnv = process.env) {
  waitlistPromotionEnabled(env);
  waitlistNotificationsEnabled(env);
  waitlistLifecycleEnabled(env);
  if (flag('WAITLIST_ENROLLMENT_ENABLED', env) && !bookingPolicyEnabled(env))
    throw new Error('Waitlist enrollment requires booking policy V2');
  if (
    flag('COMMITMENT_REPLACEMENT_ENABLED', env) &&
    !waitlistEnrollmentEnabled(env)
  )
    throw new Error('Commitment replacement requires waitlist enrollment');
}

// The delivery adapter is not implemented yet. A configuration switch alone
// cannot attest that a patient-visible channel has been integrated and verified.
export function waitlistPromotionEnabled(env: NodeJS.ProcessEnv = process.env) {
  const requested = flag('WAITLIST_PROMOTION_ENABLED', env);
  if (requested)
    throw new Error(
      'Waitlist promotion requires verified patient-visible notification delivery (Steps 8 and 11)',
    );
  return false;
}

export function waitlistNotificationsEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return flag('WAITLIST_NOTIFICATIONS_ENABLED', env);
}

export function waitlistLifecycleEnabled(env: NodeJS.ProcessEnv = process.env) {
  return flag('WAITLIST_LIFECYCLE_ENABLED', env);
}
