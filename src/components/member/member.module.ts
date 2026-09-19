import {
  Module,
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

const mongoUri =
  process.env.MONGO_URI ??
  (process.env.NODE_ENV === 'production'
    ? process.env.MONGO_PROD
    : process.env.MONGO_DEV);

@Module({
  imports: [
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
  providers: [MemberService, MemberAccessGuard],
  exports: [MemberService, MemberAccessGuard],
})
export class MemberModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(memberRateLimit()).forRoutes(MemberController);
  }
}
