import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getMongoUri } from '../../database/database.config.js';
import { WAITLIST, WaitlistSchema } from '../../schemas/waitlist.model.js';
import { MemberModule } from '../member/member.module.js';
import { WaitlistService } from './waitlist.service.js';

@Module({
  imports: [
    MemberModule,
    ...(getMongoUri()
      ? [
          MongooseModule.forFeature([
            { name: WAITLIST, schema: WaitlistSchema },
          ]),
        ]
      : []),
  ],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
