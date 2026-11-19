import { NotificationModule } from './notification/notification.module.js';
import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module.js';
import { AppointmentModule } from './appointment/appointment.module.js';
import { HealthModule } from './health/health.module.js';
import { BookingModule } from './booking/booking.module.js';

import { UploadModule } from './upload/upload.module.js';

@Module({
  imports: [
    MemberModule,
    AppointmentModule,
    HealthModule,
    UploadModule,
    BookingModule,
    NotificationModule,
  ],
})
export class ComponentsModule {}
