import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { HealthController } from './health.controller.js';
import { HealthStatusController } from './health-status.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, HealthStatusController],
})
export class HealthModule {}
