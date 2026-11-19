import { GraphQLModule } from '@nestjs/graphql';
import { graphqlConfig } from './libs/graphql/graphql.config.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { FileLogger } from './libs/logger/file-logger.service.js';
import { ComponentsModule } from './components/components.module.js';

@Module({
  imports: [
    GraphQLModule.forRoot(graphqlConfig),
    DatabaseModule,
    ComponentsModule,
  ],
  controllers: [AppController],
  providers: [AppService, FileLogger],
})
export class AppModule {}
