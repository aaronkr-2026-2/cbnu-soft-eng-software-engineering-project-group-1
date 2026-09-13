import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { FileLogger } from './logging/file-logger.service.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { MemberModule } from './components/member/member.module.js';

@Module({
  imports: [DatabaseModule, AppointmentsModule, MemberModule],
  controllers: [AppController, HealthController],
  providers: [AppService, FileLogger],
})
export class AppModule {}
