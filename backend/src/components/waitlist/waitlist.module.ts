import { NotificationModule } from '../notification/notification.module.js';
import {
  WAITLIST_CLEANUP,
  WaitlistCleanupSchema,
} from '../../schemas/waitlist-cleanup.model.js';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getMongoUri } from '../../database/database.config.js';
import { WAITLIST, WaitlistSchema } from '../../schemas/waitlist.model.js';
import { MemberModule } from '../member/member.module.js';
import { WaitlistService } from './waitlist.service.js';

@Module({
  imports: [
    MemberModule,
    NotificationModule,
    ...(getMongoUri()
      ? [
          MongooseModule.forFeature([
            { name: WAITLIST, schema: WaitlistSchema },
            { name: WAITLIST_CLEANUP, schema: WaitlistCleanupSchema },
          ]),
        ]
      : []),
  ],
  providers: [WaitlistService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
