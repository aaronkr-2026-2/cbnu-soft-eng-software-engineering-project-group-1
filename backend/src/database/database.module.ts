import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseService } from './database.service.js';
import { getMongoUri } from './database.config.js';

const mongoUri = getMongoUri();

@Module({
  // Allows tests to run without a database. main.ts refuses to start without one.
  imports: mongoUri
    ? [
        MongooseModule.forRoot(mongoUri, {
          serverSelectionTimeoutMS: 10_000,
          connectTimeoutMS: 10_000,
          retryWrites: true,
          w: 'majority',
        }),
      ]
    : [],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
