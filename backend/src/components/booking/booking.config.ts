import { configurationFor } from '../../libs/config/application-config.service.js';
export function bookingPolicyEnabled(env?: NodeJS.ProcessEnv) {
  return configurationFor(env).bookingEnabled;
}
export function waitlistEnrollmentEnabled(env?: NodeJS.ProcessEnv) {
  return configurationFor(env).enrollmentEnabled;
}
export function commitmentReplacementEnabled(env?: NodeJS.ProcessEnv) {
  return configurationFor(env).replacementEnabled;
}
export function waitlistPromotionEnabled(env?: NodeJS.ProcessEnv) {
  return configurationFor(env).promotionEnabled;
}
export function waitlistNotificationsEnabled(env?: NodeJS.ProcessEnv) {
  return configurationFor(env).notificationsEnabled;
}
export function waitlistLifecycleEnabled(env?: NodeJS.ProcessEnv) {
  return configurationFor(env).lifecycleEnabled;
}
export function validateWaitlistFlags(env?: NodeJS.ProcessEnv) {
  configurationFor(env).validateBookingFlags();
}
