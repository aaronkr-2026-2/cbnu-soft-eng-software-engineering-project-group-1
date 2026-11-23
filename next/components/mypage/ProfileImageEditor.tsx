import { Alert, Button } from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import { ImageCropper } from '../common/ImageCropper';
import type { LoadedPersonalInfo, PersonalInfoState } from './usePersonalInfo';

export function ProfileImageEditor({ state }: { state: LoadedPersonalInfo }) {
  const { profile, busy, image } = state;
  const { file, removeImage, imageError } = image;
  return (
    <div className="mypage__image-edit">
      <h3>Profile image</h3>
      <p>
        Choose a JPEG, PNG, or WebP up to 10 MB, then crop it square. Your image
        is uploaded when you save.
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
            onChange={image.choose}
          />
        </Button>
        {(profile.memberImage || file) && !removeImage && (
          <Button disabled={busy} onClick={image.remove}>
            Remove image
          </Button>
        )}
      </div>
      {file && <p role="status">Selected: {file.name}</p>}
      {removeImage && (
        <p role="status">Your profile image will be removed when you save.</p>
      )}
      {imageError && <Alert severity="error">{imageError}</Alert>}
    </div>
  );
}

export function ProfileImageCropper({
  image,
}: Pick<PersonalInfoState, 'image'>) {
  const { cropFile, setCropFile } = image;
  return (
    <>
      {cropFile && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={image.confirm}
        />
      )}
    </>
  );
}
