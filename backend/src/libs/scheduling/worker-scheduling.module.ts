import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkerScheduler } from './worker-scheduler.service.js';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [WorkerScheduler],
  exports: [WorkerScheduler],
})
export class WorkerSchedulingModule {}
