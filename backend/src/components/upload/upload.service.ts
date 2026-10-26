import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FileUpload } from 'graphql-upload-ts';

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 5;
export const uploadDirectory = () =>
  resolve(process.env.UPLOAD_DIR ?? 'uploads');
const extensions: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
};

@Injectable()
export class UploadService {
  async imageUploader(
    file: Promise<FileUpload>,
    target: string,
    ownerId: string,
  ): Promise<string> {
    return (await this.imagesUploader([file], target, ownerId))[0];
  }

  async imagesUploader(
    files: Promise<FileUpload>[],
    target: string,
    ownerId: string,
  ): Promise<string[]> {
    if (!/^[a-f0-9]{24}$/.test(ownerId))
      throw new BadRequestException('Invalid upload owner');
    if (!['member', 'clinic'].includes(target))
      throw new BadRequestException('Invalid upload target');
    if (!files.length || files.length > MAX_UPLOAD_FILES)
      throw new BadRequestException('Provide between 1 and 5 images');
    const saved: string[] = [];
    try {
      // Sequential writes bound memory and allow complete cleanup on failure.
      for (const file of files)
        saved.push(await this.save(await file, target, ownerId));
      return saved;
    } catch (error) {
      await Promise.all(
        saved.map((url) =>
          rm(resolve(uploadDirectory(), url.slice('/uploads/'.length)), {
            force: true,
          }),
        ),
      );
      throw error;
    }
  }

  private ownedPath(
    url: string,
    ownerId: string,
    target: string,
  ): string | undefined {
    const match =
      /^\/uploads\/(member|clinic)\/([a-f0-9]{24})\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(?:png|jpg|webp))$/.exec(
        url,
      );
    if (!match || match[1] !== target || match[2] !== ownerId) return undefined;
    return resolve(uploadDirectory(), match[1], match[2], match[3]);
  }

  private marker(path: string): string {
    const index = path.lastIndexOf('/');
    return path.slice(0, index + 1) + '.' + path.slice(index + 1) + '.attached';
  }

  async claimProfileImage(
    url: string,
    ownerId: string,
    target: string,
  ): Promise<() => Promise<void>> {
    const path = this.ownedPath(url, ownerId, target);
    if (!path)
      throw new BadRequestException('Choose an image uploaded by this account');
    try {
      if (!(await lstat(path)).isFile()) throw new Error('Not a file');
      // An exclusive persistent marker prevents adoption/deletion races and reuse of retired images.
      const handle = await open(this.marker(path), 'wx', 0o600);
      await handle.close();
    } catch {
      throw new BadRequestException(
        'Image is missing or has already been saved',
      );
    }
    return () => rm(this.marker(path), { force: true });
  }

  async deletePreviousProfileImage(
    url: string,
    ownerId: string,
    target: string,
  ): Promise<void> {
    const path = this.ownedPath(url, ownerId, target);
    if (!path) return; // External URLs and legacy uploads have no proven ownership.
    try {
      await lstat(this.marker(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await rm(path, { force: true });
    // Keep the hidden marker: this retired URL must never be claimed again.
  }

  private async save(
    file: FileUpload,
    target: string,
    ownerId: string,
  ): Promise<string> {
    const extension = Object.hasOwn(extensions, file.mimetype)
      ? extensions[file.mimetype]
      : undefined;
    if (!file.filename || !extension)
      throw new BadRequestException('Provide a PNG, JPEG, or WebP image');
    const directory = resolve(uploadDirectory(), target, ownerId);
    await mkdir(directory, { recursive: true });
    const name = randomUUID() + extension;
    const destination = resolve(directory, name);
    const temporary = resolve(directory, '.' + name + '.tmp');
    let size = 0;
    let header = Buffer.alloc(0);
    const check = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_UPLOAD_SIZE) {
          callback(new BadRequestException('Image exceeds 10 MB'));
          return;
        }
        if (header.length < 12)
          header = Buffer.concat([
            header,
            chunk.subarray(0, 12 - header.length),
          ]);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(
        file.createReadStream(),
        check,
        createWriteStream(temporary, { flags: 'wx' }),
      );
      const valid =
        extension === '.png'
          ? header
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : extension === '.jpg'
            ? header.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : header.toString('ascii', 0, 4) === 'RIFF' &&
              header.toString('ascii', 8, 12) === 'WEBP';
      if (!valid)
        throw new BadRequestException(
          'Image content does not match its format',
        );
      await rename(temporary, destination);
      return `/uploads/${target}/${ownerId}/${name}`;
    } catch (error) {
      await rm(temporary, { force: true });
      if (
        error &&
        typeof error === 'object' &&
        'status' in error &&
        error.status === 413
      )
        throw new BadRequestException('Image exceeds 10 MB');
      throw error;
    }
  }
}
