import { Alert, Avatar, Button, Skeleton } from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { profileImageUrl, type SelfProfile } from '../../libs/api/member';
import { prepareProfileUpdate } from '../../libs/profile-form';
import { displayUsername } from '../../libs/username';
import { usePersonalInfo } from './usePersonalInfo';
import { ProfileDetails, ProfilePasswordFields } from './PersonalInfoFields';
import { ProfileImageEditor, ProfileImageCropper } from './ProfileImageEditor';

export function PersonalInfo({
  token,
  onSessionEnded,
  onDelete,
}: {
  token: string;
  onSessionEnded: () => void;
  onDelete: (member: SelfProfile) => void;
}) {
  const state = usePersonalInfo(token, onSessionEnded);
  const {
    profile,
    draft,
    editing,
    loading,
    busy,
    error,
    success,
    username,
    form,
    editButton,
    reset,
    save,
    setEditing,
    setSuccess,
    setReload,
  } = state;
  const { file, cropFile, preview, brokenImage, removeImage, setBrokenImage } =
    state.image;
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
  const loaded = { ...state, profile, draft };
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
            {profile.clinicName ||
              profile.memberFullName ||
              displayUsername(profile.memberNick)}
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
        <ProfileDetails state={loaded} token={token} />
        {editing && (
          <>
            <ProfilePasswordFields state={loaded} />
            <ProfileImageEditor state={loaded} />
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
                disabled={
                  busy ||
                  !!cropFile ||
                  !dirty ||
                  (draft.memberNick.trim() !== profile.memberNick &&
                    !username.check.available(draft.memberNick))
                }
              >
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </>
        )}
      </form>
      <ProfileImageCropper image={state.image} />
      {profile.memberType !== 'ADMIN' && (
        <div className="mypage__delete">
          <div>
            <h3>Delete account</h3>
            <p>
              Review appointments and waitlists that need to be resolved before
              account closure.
            </p>
          </div>
          <Button
            color="error"
            variant="outlined"
            disabled={busy || !!cropFile}
            onClick={() => onDelete(profile)}
          >
            Delete account
          </Button>
        </div>
      )}
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
