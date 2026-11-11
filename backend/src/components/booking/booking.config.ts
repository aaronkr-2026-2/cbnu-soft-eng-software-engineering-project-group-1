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

// Default off. Enable only after the staged patient-visible delivery rehearsal.
export function waitlistPromotionEnabled(env: NodeJS.ProcessEnv = process.env) {
  const requested = flag('WAITLIST_PROMOTION_ENABLED', env);
  if (
    requested &&
    (!waitlistEnrollmentEnabled(env) ||
      !waitlistNotificationsEnabled(env) ||
      !waitlistLifecycleEnabled(env))
  )
    throw new Error(
      'Waitlist promotion requires booking policy V2, enrollment, in-app delivery and lifecycle',
    );
  return requested;
}

export function waitlistNotificationsEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return flag('WAITLIST_NOTIFICATIONS_ENABLED', env);
}

export function waitlistLifecycleEnabled(env: NodeJS.ProcessEnv = process.env) {
  return flag('WAITLIST_LIFECYCLE_ENABLED', env);
}
