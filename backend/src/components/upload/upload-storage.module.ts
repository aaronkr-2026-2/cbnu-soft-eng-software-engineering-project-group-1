import { Module } from '@nestjs/common';
import { UploadService } from './upload.service.js';

// Storage has no authentication dependency, so MemberModule can use it without a cycle.
@Module({ providers: [UploadService], exports: [UploadService] })
export class UploadStorageModule {}
