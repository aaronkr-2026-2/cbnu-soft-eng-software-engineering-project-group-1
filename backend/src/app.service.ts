import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getApiInfo(): { name: string; version: string; status: string } {
    return { name: 'MedConnect API', version: 'v1', status: 'ok' };
  }
}
