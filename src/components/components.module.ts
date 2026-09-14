import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module.js';
import { AppointmentModule } from './appointment/appointment.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [MemberModule, AppointmentModule, HealthModule],
})
export class ComponentsModule {}
