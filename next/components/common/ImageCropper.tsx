import { useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
} from '@mui/material';
import { cropImage, type CropArea } from '../../libs/image-crop';

export function ImageCropper({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [source, setSource] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const working = useRef(false);
  useEffect(() => {
    active.current = true;
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => {
      active.current = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);
  async function confirm() {
    if (!area || !source || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await cropImage(source, area, file.name);
      if (active.current) onConfirm(result);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'The crop could not be created. Please try again.',
        );
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!working.current) onCancel();
      }}
      transitionDuration={0}
      fullWidth
      maxWidth="sm"
      className="image-cropper"
      aria-labelledby="crop-photo-title"
      aria-describedby="crop-photo-help"
    >
      <DialogTitle id="crop-photo-title">Crop your photo</DialogTitle>
      <DialogContent aria-busy={busy}>
        <p id="crop-photo-help">
          Drag the photo or focus the square and use arrow keys to position it.
          Use Zoom to adjust the size.
        </p>
        <div className="image-cropper__stage" inert={busy}>
          {source && (
            <Cropper
              image={source}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              zoomWithScroll={false}
              onCropComplete={(_percent, pixels) => setArea(pixels)}
              cropperProps={{
                'aria-label': 'Photo crop position',
                'aria-describedby': 'crop-photo-help',
              }}
              mediaProps={{
                onError: () => {
                  setArea(null);
                  setError(
                    'This image could not be opened. Cancel and choose another photo.',
                  );
                },
              }}
            />
          )}
        </div>
        <label id="crop-zoom-label">Zoom</label>
        <Slider
          aria-labelledby="crop-zoom-label"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          disabled={busy || !area}
          onChange={(_event, value) => setZoom(value as number)}
        />
        <p className="image-cropper__note">
          Your square photo will be uploaded when you save your profile.
        </p>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onCancel}>
          Cancel crop
        </Button>
        <Button
          variant="contained"
          disabled={busy || !area}
          onClick={() => void confirm()}
        >
          {busy ? 'Preparing…' : 'Use photo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
