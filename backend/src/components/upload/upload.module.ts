import { Module } from '@nestjs/common';
import { MemberModule } from '../member/member.module.js';
import { UploadResolver } from './upload.resolver.js';
import { UploadService } from './upload.service.js';

@Module({
  imports: [MemberModule],
  providers: [UploadResolver, UploadService],
})
export class UploadModule {}
