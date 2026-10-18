import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module.js';
import { AppointmentModule } from './appointment/appointment.module.js';
import { HealthModule } from './health/health.module.js';

import { UploadModule } from './upload/upload.module.js';

@Module({
  imports: [MemberModule, AppointmentModule, HealthModule, UploadModule],
})
export class ComponentsModule {}
