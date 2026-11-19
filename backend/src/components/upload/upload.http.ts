import type { INestApplication } from '@nestjs/common';
import { static as serveStatic } from 'express';
import { graphqlUploadExpress } from 'graphql-upload-ts';
import {
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SIZE,
  uploadDirectory,
} from './upload.service.js';

export function configureUploads(app: INestApplication): void {
  app.use(
    '/graphql',
    graphqlUploadExpress({
      maxFileSize: MAX_UPLOAD_SIZE,
      maxFiles: MAX_UPLOAD_FILES,
    }),
  );
  app.use(
    '/uploads',
    serveStatic(uploadDirectory(), { dotfiles: 'deny', index: false }),
  );
}
