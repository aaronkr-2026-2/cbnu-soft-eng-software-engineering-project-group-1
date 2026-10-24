import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { memberRateLimit } from '../auth/member-rate-limit.js';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema, { MEMBER } from '../../schemas/member.model.js';
import {
  MEMBER_SESSION,
  MemberSessionSchema,
} from '../../schemas/member-session.model.js';
import { MemberController } from './member.controller.js';
import { MemberAccessGuard } from '../auth/guards/member-access.guard.js';
import { MemberService } from './member.service.js';
import { MemberResolver } from './member.resolver.js';
import { GoogleAuthService } from '../auth/google-auth.service.js';

import { UploadStorageModule } from '../upload/upload-storage.module.js';
import { getMongoUri } from '../../database/database.config.js';

const mongoUri = getMongoUri();

@Module({
  imports: [
    UploadStorageModule,
    ...(mongoUri
      ? [
          MongooseModule.forFeature([
            { name: MEMBER, schema: MemberSchema },
            { name: MEMBER_SESSION, schema: MemberSessionSchema },
          ]),
        ]
      : []),
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (mongoUri && (!secret || Buffer.byteLength(secret) < 32)) {
          throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
        }
        return {
          secret,
          signOptions: {
            algorithm: 'HS256' as const,
            expiresIn: 900,
            issuer: 'medconnect',
            audience: 'medconnect-api',
          },
          verifyOptions: {
            algorithms: ['HS256' as const],
            issuer: 'medconnect',
            audience: 'medconnect-api',
          },
        };
      },
    }),
  ],
  controllers: [MemberController],
  providers: [
    MemberService,
    MemberResolver,
    MemberAccessGuard,
    GoogleAuthService,
  ],
  exports: [MemberService, MemberAccessGuard],
})
export class MemberModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(memberRateLimit())
      .forRoutes(
        { path: 'member/signup', method: RequestMethod.POST },
        { path: 'member/login', method: RequestMethod.POST },
        { path: 'member/refresh', method: RequestMethod.POST },
        { path: 'member/google/nonce', method: RequestMethod.POST },
        { path: 'member/google/login', method: RequestMethod.POST },
      );
  }
}
