import { Module } from '@nestjs/common';
import { MemberModule } from '../member/member.module.js';
import { UploadResolver } from './upload.resolver.js';
import { UploadStorageModule } from './upload-storage.module.js';

@Module({
  imports: [MemberModule, UploadStorageModule],
  providers: [UploadResolver],
})
export class UploadModule {}
