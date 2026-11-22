import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { validImageFile } from '../../libs/image-crop';

export function useProfileImage(memberImage?: string | null) {
  const [file, setFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [brokenImage, setBrokenImage] = useState(false);
  const uploadedImage = useRef('');
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
  }, [memberImage, preview, removeImage]);
  function reset() {
    setFile(null);
    setCropFile(null);
    uploadedImage.current = '';
    setRemoveImage(false);
    setImageError('');
  }
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (!validImageFile(chosen)) {
      setImageError('Choose a JPEG, PNG, or WebP image up to 10 MB.');
      return;
    }
    setCropFile(chosen);
    setImageError('');
  }
  function remove() {
    setFile(null);
    uploadedImage.current = '';
    setRemoveImage(!!memberImage);
    setImageError('');
  }
  function confirm(cropped: File) {
    setFile(cropped);
    uploadedImage.current = '';
    setRemoveImage(false);
    setImageError('');
    setCropFile(null);
  }
  return {
    file,
    cropFile,
    preview,
    removeImage,
    imageError,
    brokenImage,
    uploadedImage,
    setFile,
    setCropFile,
    setRemoveImage,
    setBrokenImage,
    reset,
    choose,
    remove,
    confirm,
  };
}
