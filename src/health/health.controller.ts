import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): { status: 'ok'; database: 'connected' } {
    if (!this.database.isConnected()) {
      throw new ServiceUnavailableException({ status: 'unavailable', database: this.database.getStatus() });
    }
    return { status: 'ok', database: 'connected' };
  }
}
