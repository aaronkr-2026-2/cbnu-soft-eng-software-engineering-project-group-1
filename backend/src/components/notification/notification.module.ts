import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { getMongoUri } from '../../database/database.config.js';
import {
  NOTIFICATION,
  NOTIFICATION_OUTBOX,
  NotificationSchema,
  NotificationOutboxSchema,
} from '../../schemas/notification.model.js';
import { BookingModule } from '../booking/booking.module.js';
import { MemberModule } from '../member/member.module.js';
import { NotificationService } from './notification.service.js';
import { NotificationResolver } from './notification.resolver.js';
@Module({
  imports: [
    BookingModule,
    MemberModule,
    ...(getMongoUri()
      ? [
          MongooseModule.forFeature([
            { name: NOTIFICATION, schema: NotificationSchema },
            { name: NOTIFICATION_OUTBOX, schema: NotificationOutboxSchema },
          ]),
        ]
      : []),
  ],
  providers: [NotificationService, NotificationResolver],
  exports: [NotificationService],
})
export class NotificationModule {}
