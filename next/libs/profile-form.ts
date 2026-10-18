import type { MemberUpdate, SelfProfile } from './api/member';

export const profileFields = [
  ['memberFullName', 'Full name', 100],
  ['memberNick', 'Nickname', 40],
  ['memberPhone', 'Phone number', 16],
  ['memberAddress', 'Address', 300],
  ['memberDesc', 'About me', 2000],
] as const;
export type ProfileField =
  | typeof profileFields[number][0]
  | 'clinicName'
  | 'location';
export type ProfileDraft = Record<
  ProfileField | 'currentPassword' | 'newPassword' | 'confirmPassword',
  string
>;
export function profileDraft(profile: SelfProfile): ProfileDraft {
  return {
    memberFullName: profile.memberFullName || '',
    memberNick: profile.memberNick,
    memberPhone: profile.memberPhone || '',
    memberAddress: profile.memberAddress || '',
    memberDesc: profile.memberDesc || '',
    clinicName: profile.clinicName || '',
    location: profile.location || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
}
export function prepareProfileUpdate(
  profile: SelfProfile,
  draft: ProfileDraft,
) {
  const input: MemberUpdate = {};
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  const fields: ProfileField[] = profileFields.map(([key]) => key);
  if (profile.memberType === 'CLINIC') fields.push('clinicName', 'location');
  for (const key of fields) {
    const value = draft[key].trim();
    if (value !== (profile[key] || '')) input[key] = value;
  }
  const length = (value: string) => Array.from(value).length;
  for (const [key, , max] of profileFields) {
    if (input[key] !== undefined && length(input[key]!) > max)
      errors[key] = `Use up to ${max} characters.`;
  }
  if (input.memberFullName !== undefined && !input.memberFullName)
    errors.memberFullName = 'Enter your full name.';
  if (input.memberNick !== undefined && length(input.memberNick) < 2)
    errors.memberNick = 'Use 2–40 characters.';
  if (
    input.memberPhone !== undefined &&
    !/^\+[1-9]\d{7,14}$/.test(input.memberPhone)
  )
    errors.memberPhone = 'Include a country code, for example +821012345678.';
  if (
    input.clinicName !== undefined &&
    (!input.clinicName || length(input.clinicName) > 150)
  )
    errors.clinicName = 'Use 1–150 characters.';
  if (input.location === '') errors.location = 'Choose a location.';
  if (
    profile.canChangePassword &&
    (draft.currentPassword || draft.newPassword || draft.confirmPassword)
  ) {
    if (!draft.currentPassword || length(draft.currentPassword) > 128)
      errors.currentPassword =
        'Enter your current password (up to 128 characters).';
    if (length(draft.newPassword) < 8 || length(draft.newPassword) > 100)
      errors.newPassword = 'Use 8–100 characters.';
    if (!draft.confirmPassword || draft.newPassword !== draft.confirmPassword)
      errors.confirmPassword = 'Passwords must match.';
    // Passwords are never trimmed or copied from a server response.
    input.currentPassword = draft.currentPassword;
    input.newPassword = draft.newPassword;
    input.confirmPassword = draft.confirmPassword;
  }
  return { input, errors };
}
