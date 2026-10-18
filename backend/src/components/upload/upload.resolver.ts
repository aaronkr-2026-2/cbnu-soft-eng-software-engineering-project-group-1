import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { GraphQLUpload, type FileUpload } from 'graphql-upload-ts';
import { MemberAccessGuard } from '../auth/guards/member-access.guard.js';
import { UploadService } from './upload.service.js';

@Resolver()
@UseGuards(MemberAccessGuard)
export class UploadResolver {
  constructor(private readonly uploads: UploadService) {}

  @Mutation(() => String)
  imageUploader(
    @Args('file', { type: () => GraphQLUpload }) file: Promise<FileUpload>,
    @Args('target') target: string,
  ) {
    return this.uploads.imageUploader(file, target);
  }

  @Mutation(() => [String])
  imagesUploader(
    @Args('files', { type: () => [GraphQLUpload] })
    files: Promise<FileUpload>[],
    @Args('target') target: string,
  ) {
    return this.uploads.imagesUploader(files, target);
  }
}
