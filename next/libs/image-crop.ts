export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export type CropArea = { x: number; y: number; width: number; height: number };

export function validImageFile(file: Pick<File, 'size' | 'type'>) {
  return (
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
    file.size > 0 &&
    file.size <= MAX_IMAGE_BYTES
  );
}

export function cropGeometry(width: number, height: number, area: CropArea) {
  const values = [width, height, area.x, area.y, area.width, area.height];
  if (
    !values.every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    area.x < 0 ||
    area.y < 0 ||
    area.width < 1 ||
    area.height < 1 ||
    Math.abs(area.width - area.height) > 1 ||
    area.x + area.width > width + 1 ||
    area.y + area.height > height + 1
  )
    throw new Error('Choose a valid square crop.');
  const side = Math.min(
    area.width,
    area.height,
    width - area.x,
    height - area.y,
  );
  if (side < 1) throw new Error('Choose a valid square crop.');
  return { x: area.x, y: area.y, side, size: Math.min(1024, Math.floor(side)) };
}

export async function cropImage(
  source: string,
  area: CropArea,
  filename: string,
): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error('This image could not be opened. Choose another photo.'),
      );
    img.src = source;
  });
  const { x, y, side, size } = cropGeometry(
    image.naturalWidth,
    image.naturalHeight,
    area,
  );
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context)
    throw new Error('Image cropping is unavailable in this browser.');
  // JPEG has no transparency; keep transparent source pixels white.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(image, x, y, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(
              new Error('The crop could not be created. Please try again.'),
            ),
      'image/jpeg',
      0.9,
    );
  });
  if (!validImageFile(blob) || blob.type !== 'image/jpeg')
    throw new Error('The cropped image could not be prepared for upload.');
  return new File(
    [blob],
    `${filename.replace(/\.[^.]*$/, '') || 'photo'}-square.jpg`,
    { type: 'image/jpeg' },
  );
}
