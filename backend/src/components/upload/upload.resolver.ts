import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { GraphQLUpload, type FileUpload } from 'graphql-upload-ts';
import {
  MemberAccessGuard,
  type AuthenticatedRequest,
} from '../auth/guards/member-access.guard.js';
import { UploadService } from './upload.service.js';

@Resolver()
@UseGuards(MemberAccessGuard)
export class UploadResolver {
  constructor(private readonly uploads: UploadService) {}

  @Mutation(() => String)
  imageUploader(
    @Args('file', { type: () => GraphQLUpload }) file: Promise<FileUpload>,
    @Args('target') target: string,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.uploads.imageUploader(file, target, String(request.member._id));
  }

  @Mutation(() => [String])
  imagesUploader(
    @Args('files', { type: () => [GraphQLUpload] })
    files: Promise<FileUpload>[],
    @Args('target') target: string,
    @Context('req') request: AuthenticatedRequest,
  ) {
    return this.uploads.imagesUploader(
      files,
      target,
      String(request.member._id),
    );
  }
}
