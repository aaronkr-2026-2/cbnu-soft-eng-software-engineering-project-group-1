import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { useUsernameCheck } from '../../libs/use-username-check';
import { clearSession, updateSessionMember } from '../../libs/auth-session';
import {
  fetchMyProfile,
  ProfileError,
  updateMember,
  uploadProfileImage,
  type SelfProfile,
} from '../../libs/api/member';
import {
  prepareProfileUpdate,
  profileDraft,
  type ProfileDraft,
} from '../../libs/profile-form';
import { useProfileImage } from './useProfileImage';

export function usePersonalInfo(token: string, onSessionEnded: () => void) {
  const router = useRouter();
  const username = useUsernameCheck(token);
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState<
    Partial<Record<keyof ProfileDraft, string>>
  >({});
  const [reload, setReload] = useState(0);
  const request = useRef<AbortController | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (!busy && username.state.status === 'taken')
      form.current
        ?.querySelector<HTMLInputElement>('[name="memberNick"]')
        ?.focus();
  }, [busy, username.state.status]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchMyProfile(token, controller.signal)
      .then((member) => {
        if (controller.signal.aborted) return;
        setProfile(member);
        setDraft(profileDraft(member));
        updateSessionMember(token, member);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ProfileError && cause.code === 'UNAUTHENTICATED')
          onSessionEnded();
        else
          setError(
            cause instanceof Error
              ? cause.message
              : 'Your profile is unavailable.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Session callbacks may change when profile display data is updated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reload]);
  useEffect(() => () => request.current?.abort(), []);
  const image = useProfileImage(profile?.memberImage);
  const {
    file,
    cropFile,
    removeImage,
    uploadedImage,
    setFile,
    setRemoveImage,
  } = image;
  useEffect(() => {
    if (editing) firstField.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function reset() {
    username.check.reset();
    if (profile) setDraft(profileDraft(profile));
    image.reset();
    setErrors({});
    setError('');
  }
  function change(key: keyof ProfileDraft, value: string) {
    if (key === 'memberNick') username.check.reset();
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || !draft || request.current || cropFile) return;
    const { input, errors: validation } = prepareProfileUpdate(profile, draft);
    if (
      input.memberNick !== undefined &&
      !validation.memberNick &&
      !username.check.available(draft.memberNick)
    )
      validation.memberNick =
        'Check username availability before saving your new username.';
    setErrors(validation);
    setError('');
    setSuccess('');
    if (Object.keys(validation).length) {
      form.current
        ?.querySelector<HTMLInputElement>(
          `[name="${Object.keys(validation)[0]}"]`,
        )
        ?.focus();
      return;
    }
    if (!Object.keys(input).length && !file && !removeImage) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      if (file) {
        if (!uploadedImage.current)
          uploadedImage.current = await uploadProfileImage(
            file,
            profile.memberType === 'CLINIC',
            token,
            controller.signal,
          );
        input.memberImage = uploadedImage.current;
      } else if (removeImage) input.memberImage = '';
      if (controller.signal.aborted) return;
      const result = await updateMember(input, token, controller.signal);
      if (controller.signal.aborted) return;
      if (result.requiresLogin) {
        clearSession();
        void router.replace('/auth?passwordChanged=1');
        return;
      }
      setProfile(result.member);
      setDraft(profileDraft(result.member));
      updateSessionMember(token, result.member);
      setFile(null);
      uploadedImage.current = '';
      setRemoveImage(false);
      setEditing(false);
      setSuccess('Your information has been updated.');
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ProfileError && cause.code === 'UNAUTHENTICATED')
        onSessionEnded();
      else if (cause instanceof ProfileError && cause.usernameTaken) {
        username.check.taken(draft.memberNick);
        setErrors((previous) => ({
          ...previous,
          memberNick: undefined,
        }));
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : 'Your changes could not be saved.',
        );
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return {
    profile,
    draft,
    editing,
    loading,
    busy,
    error,
    success,
    errors,
    username,
    image,
    form,
    firstField,
    editButton,
    reset,
    change,
    save,
    setEditing,
    setSuccess,
    setReload,
    setErrors,
  };
}

export type PersonalInfoState = ReturnType<typeof usePersonalInfo>;
export type LoadedPersonalInfo = PersonalInfoState & {
  profile: SelfProfile;
  draft: ProfileDraft;
};
