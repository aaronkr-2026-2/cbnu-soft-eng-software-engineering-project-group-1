import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseService } from './database.service.js';

const mongoUri = process.env.MONGO_DEV ??
  (process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV);

@Module({
  // Allows tests to run without a database. main.ts refuses to start without one.
  imports: mongoUri ? [MongooseModule.forRoot(mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    retryWrites: true,
    w: 'majority',
  })] : [],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
