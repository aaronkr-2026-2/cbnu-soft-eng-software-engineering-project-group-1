import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Alert,
  Avatar,
  Button,
  MenuItem,
  Skeleton,
  TextField,
} from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import {
  clearSession,
  updateSessionMember,
  useSession,
} from '../../libs/auth-session';
import {
  fetchMyProfile,
  ProfileError,
  profileImageUrl,
  updateMember,
  uploadProfileImage,
  type SelfProfile,
} from '../../libs/api/member';
import {
  prepareProfileUpdate,
  profileDraft,
  profileFields,
  type ProfileDraft,
} from '../../libs/profile-form';
import { SiteHeader } from '../layout/SiteHeader';
import { SiteFooter } from '../layout/SiteFooter';
import { PasswordField } from '../auth/PasswordField';

const locations = [
  'SEOUL',
  'INCHEON',
  'BUSAN',
  'JEJU',
  'DAEGU',
  'DAEJEON',
  'GWANGJU',
  'ULSAN',
  'SUWON',
  'SEJONG',
];

export function MyPage() {
  const session = useSession();
  const [notice, setNotice] = useState('');
  return (
    <div className="landing site-shell mypage">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="container mypage__main">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h1>My Page</h1>
        <p className="mypage__intro">
          Your personal details, all in one place.
        </p>
        {session ? (
          <PersonalInfo
            key={session.accessToken}
            token={session.accessToken}
            onSessionEnded={() => {
              setNotice('Your session has ended. Please sign in again.');
              clearSession();
            }}
          />
        ) : (
          <div className="mypage__card">
            <Alert severity="info">
              {notice || 'Sign in to view and edit your personal information.'}
            </Alert>
            <Button component={Link} href="/auth" variant="contained">
              Sign in
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function PersonalInfo({
  token,
  onSessionEnded,
}: {
  token: string;
  onSessionEnded: () => void;
}) {
  const router = useRouter();
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [brokenImage, setBrokenImage] = useState(false);
  const [reload, setReload] = useState(0);
  const request = useRef<AbortController | null>(null);
  const uploadedImage = useRef('');
  const form = useRef<HTMLFormElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

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
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    setBrokenImage(false);
  }, [profile?.memberImage, preview, removeImage]);
  useEffect(() => {
    if (editing) firstField.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  function reset() {
    if (profile) setDraft(profileDraft(profile));
    setFile(null);
    uploadedImage.current = '';
    setRemoveImage(false);
    setImageError('');
    setErrors({});
    setError('');
  }
  function change(key: keyof ProfileDraft, value: string) {
    setDraft((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!profile || !draft || request.current) return;
    const { input, errors: validation } = prepareProfileUpdate(profile, draft);
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
      else
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

  if (loading)
    return (
      <div
        className="mypage__card"
        aria-busy="true"
        aria-label="Loading personal information"
      >
        <Skeleton height={80} />
        <Skeleton height={240} />
      </div>
    );
  if (!profile || !draft)
    return (
      <div className="mypage__card">
        <Alert severity="error">
          {error || 'Your profile is unavailable.'}
        </Alert>
        <Button onClick={() => setReload((value) => value + 1)}>Retry</Button>
      </div>
    );
  const clinic = profile.memberType === 'CLINIC';
  const dirty =
    !!Object.keys(prepareProfileUpdate(profile, draft).input).length ||
    !!file ||
    removeImage;
  const image =
    brokenImage || removeImage
      ? '/images/users/defaultUser.svg'
      : preview || profileImageUrl(profile.memberImage);
  return (
    <section className="mypage__card" aria-labelledby="personal-info-heading">
      <div className="mypage__heading">
        <div>
          <h2 id="personal-info-heading">Personal information</h2>
          <p>Keep your details up to date.</p>
        </div>
        {!editing && (
          <Button
            ref={editButton}
            variant="outlined"
            startIcon={<EditOutlined />}
            onClick={() => {
              reset();
              setSuccess('');
              setEditing(true);
            }}
          >
            Edit information
          </Button>
        )}
      </div>
      <div className="mypage__identity">
        <Avatar
          src={image}
          alt="Profile photo"
          slotProps={{ img: { onError: () => setBrokenImage(true) } }}
        />
        <div>
          <h3>
            {profile.clinicName || profile.memberFullName || profile.memberNick}
          </h3>
          <p>
            {profile.memberType === 'USER'
              ? 'Patient account'
              : `${profile.memberType.charAt(0)}${profile.memberType
                  .slice(1)
                  .toLowerCase()} account`}
          </p>
        </div>
      </div>
      {success && <Alert severity="success">{success}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <form ref={form} onSubmit={save} noValidate aria-busy={busy}>
        <div className="mypage__fields">
          {profileFields.map(([key, label, max]) => (
            <TextField
              key={key}
              id={key}
              name={key}
              label={label}
              value={draft[key]}
              fullWidth
              multiline={key === 'memberDesc'}
              minRows={key === 'memberDesc' ? 3 : undefined}
              inputRef={key === 'memberFullName' ? firstField : undefined}
              disabled={busy}
              error={!!errors[key]}
              helperText={
                errors[key] ||
                (key === 'memberPhone' && editing
                  ? 'Include your country code.'
                  : undefined)
              }
              onChange={(event) => change(key, event.target.value)}
              slotProps={{
                input: { readOnly: !editing },
                htmlInput: { maxLength: max },
              }}
            />
          ))}
          <TextField
            id="memberEmail"
            label="Email"
            value={profile.memberEmail || ''}
            fullWidth
            slotProps={{ input: { readOnly: true } }}
            helperText={
              editing ? 'Email changes are currently unavailable.' : undefined
            }
          />
          {clinic && (
            <>
              <TextField
                id="clinicName"
                name="clinicName"
                label="Clinic name"
                value={draft.clinicName}
                disabled={busy}
                error={!!errors.clinicName}
                helperText={errors.clinicName}
                onChange={(event) => change('clinicName', event.target.value)}
                slotProps={{
                  input: { readOnly: !editing },
                  htmlInput: { maxLength: 150 },
                }}
              />
              {editing ? (
                <TextField
                  select
                  id="location"
                  name="location"
                  label="Location"
                  value={draft.location}
                  disabled={busy}
                  error={!!errors.location}
                  helperText={errors.location}
                  onChange={(event) => change('location', event.target.value)}
                >
                  <MenuItem value="" disabled>
                    Choose a location
                  </MenuItem>
                  {locations.map((value) => (
                    <MenuItem value={value} key={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase()}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <TextField
                  label="Location"
                  value={profile.location || ''}
                  slotProps={{ input: { readOnly: true } }}
                />
              )}
            </>
          )}
          {profile.memberType === 'DOCTOR' && (
            <TextField
              label="Specializations"
              value={
                profile.doctorSpecializations
                  ?.map((value) => value.replaceAll('_', ' '))
                  .join(', ') || ''
              }
              slotProps={{ input: { readOnly: true } }}
            />
          )}
        </div>
        {editing && (
          <>
            <div className="mypage__passwords">
              <h3>Change password</h3>
              {profile.canChangePassword ? (
                <>
                  <p>
                    Optional. Leave all three fields empty to keep your current
                    password. Changing it will require you to sign in again.
                  </p>
                  <div className="mypage__fields">
                    {(
                      [
                        'currentPassword',
                        'newPassword',
                        'confirmPassword',
                      ] as const
                    ).map((key, index) => (
                      <PasswordField
                        key={key}
                        id={key}
                        label={
                          [
                            'Current password',
                            'New password',
                            'Confirm new password',
                          ][index]
                        }
                        value={draft[key]}
                        onChange={(event) => change(key, event.target.value)}
                        autoComplete={
                          index === 0 ? 'current-password' : 'new-password'
                        }
                        maxLength={index === 0 ? 128 : 100}
                        required={false}
                        disabled={busy}
                        error={!!errors[key]}
                        helperText={errors[key]}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <Alert severity="info">
                  Your password is managed by your sign-in provider.
                </Alert>
              )}
            </div>
            <div className="mypage__image-edit">
              <h3>Profile image</h3>
              <p>
                JPEG, PNG, or WebP, up to 10 MB. Your image is uploaded when you
                save.
              </p>
              <div className="mypage__actions">
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<CameraAltOutlined />}
                  disabled={busy}
                >
                  Edit image
                  <input
                    className="mypage__file"
                    type="file"
                    aria-label="Edit profile image"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const chosen = event.target.files?.[0];
                      event.target.value = '';
                      if (!chosen) return;
                      if (
                        !['image/jpeg', 'image/png', 'image/webp'].includes(
                          chosen.type,
                        ) ||
                        chosen.size > 10 * 1024 * 1024 ||
                        !chosen.size
                      ) {
                        setImageError(
                          'Choose a JPEG, PNG, or WebP image up to 10 MB.',
                        );
                        return;
                      }
                      setFile(chosen);
                      uploadedImage.current = '';
                      setRemoveImage(false);
                      setImageError('');
                    }}
                  />
                </Button>
                {(profile.memberImage || file) && !removeImage && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setFile(null);
                      uploadedImage.current = '';
                      setRemoveImage(!!profile.memberImage);
                      setImageError('');
                    }}
                  >
                    Remove image
                  </Button>
                )}
              </div>
              {file && <p role="status">Selected: {file.name}</p>}
              {removeImage && (
                <p role="status">
                  Your profile image will be removed when you save.
                </p>
              )}
              {imageError && <Alert severity="error">{imageError}</Alert>}
            </div>
            <div className="mypage__actions mypage__save">
              <Button
                disabled={busy}
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                type="submit"
                disabled={busy || !dirty}
              >
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </>
        )}
      </form>
      {!editing && (
        <Button
          className="mypage__reload"
          onClick={() => {
            setSuccess('');
            setReload((value) => value + 1);
          }}
        >
          Reload profile
        </Button>
      )}
    </section>
  );
}
