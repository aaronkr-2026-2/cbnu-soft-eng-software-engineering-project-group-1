import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationConfig } from './application-config.service.js';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true, cache: false })],
  providers: [ApplicationConfig],
  exports: [ApplicationConfig],
})
export class ApplicationConfigModule {}
