import { setDefaultResultOrder, setServers } from 'dns';
setServers(['8.8.8.8', '1.1.1.1']);
setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { configureUploads } from './components/upload/upload.http.js';
import { environmentConfig, ApplicationConfig } from './libs/config/application-config.service.js';
import { loadEnvironment } from './libs/config/load-environment.js';

async function bootstrap() {
  loadEnvironment();
  environmentConfig.validateStartup();
  const { AppModule } = await import('./app.module.js');
  const { FileLogger } = await import('./libs/logger/file-logger.service.js');
  const { LoggingInterceptor } = await import('./libs/interceptor/logging.interceptor.js');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(FileLogger);
  const config = app.get(ApplicationConfig);
  app.useLogger(logger);
  app.enableShutdownHooks();
  app.useGlobalInterceptors(new LoggingInterceptor(logger));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: () => new BadRequestException('Invalid request data'),
  }));
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  const allowedOrigins = config.corsOrigins;
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Apollo-Require-Preflight'],
    credentials: true,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  configureUploads(app);
  const port = config.port;
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MedConnect API')
    .setDescription('MedConnect REST API documentation. GraphQL is available at /graphql.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swaggerConfig));
  await app.listen(port);
  logger.log(`API available at http://localhost:${port}`, 'Bootstrap');
  logger.log(`GraphQL available at http://localhost:${port}/graphql`, 'Bootstrap');
  logger.log(`Swagger available at http://localhost:${port}/docs`, 'Bootstrap');
  logger.log(`Service status at http://localhost:${port}/status`, 'Bootstrap');
  logger.log(`Health checks: http://localhost:${port}/health/live and /ready`, 'Bootstrap');
}
void bootstrap();
