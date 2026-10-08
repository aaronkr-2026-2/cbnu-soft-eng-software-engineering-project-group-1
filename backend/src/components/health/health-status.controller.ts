import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';

@Controller('status')
export class HealthStatusController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getStatusPage(@Res() response: Response): void {
    response.sendFile(join(__dirname, 'views', 'status.html'));
  }

  @Get('assets/status.css')
  @Header('Cache-Control', 'no-store')
  getStyles(@Res() response: Response): void {
    response.sendFile(join(__dirname, 'views', 'status.css'));
  }

  @Get('assets/status.js')
  @Header('Cache-Control', 'no-store')
  getScript(@Res() response: Response): void {
    response.sendFile(join(__dirname, 'views', 'status.js'));
  }
}
