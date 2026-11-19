import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

export type DatabaseStatus = 'connected' | 'connecting' | 'disconnecting' | 'disconnected' | 'unconfigured';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Optional() @InjectConnection() private readonly connection?: Connection) {
    if (this.connection?.readyState === 1) {
      this.logger.log('MongoDB connected');
    } else if (!this.connection) {
      this.logger.warn('MongoDB is not configured');
    } else {
      this.logger.log('MongoDB connecting');
    }

    this.connection?.on('connected', () => this.logger.log('MongoDB connected'));
    this.connection?.on('disconnected', () => this.logger.warn('MongoDB disconnected'));
    this.connection?.on('error', (error: Error) => this.logger.error(`MongoDB connection error: ${error.message}`));
  }

  getStatus(): DatabaseStatus {
    if (!this.connection) return 'unconfigured';
    switch (this.connection.readyState) {
      case 1: return 'connected';
      case 2: return 'connecting';
      case 3: return 'disconnecting';
      default: return 'disconnected';
    }
  }

  isConnected(): boolean {
    return this.getStatus() === 'connected';
  }
}
