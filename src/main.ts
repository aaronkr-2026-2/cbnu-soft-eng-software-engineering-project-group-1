import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

function loadEnvironment(): void {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function validateConfiguration(): void {
  const jwtSecret = process.env.JWT_ACCESS_SECRET;
  if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
  }
  const mongoUri = process.env.MONGO_URI ??
    (process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV);
  if (!mongoUri) {
    throw new Error('Missing MongoDB configuration. Set MONGO_URI (or MONGO_DEV/MONGO_PROD).');
  }
  if (!mongoUri.startsWith('mongodb+srv://') && process.env.NODE_ENV === 'production') {
    throw new Error('Production MongoDB must use a TLS-enabled mongodb+srv:// connection string.');
  }
}

async function bootstrap() {
  loadEnvironment();
  validateConfiguration();
  const { AppModule } = await import('./app.module.js');
  const { FileLogger } = await import('./libs/logger/file-logger.service.js');
  const { LoggingInterceptor } = await import('./libs/interceptor/logging.interceptor.js');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(FileLogger);
  app.useLogger(logger);
  app.useGlobalInterceptors(new LoggingInterceptor(logger));
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: () => new BadRequestException('Invalid request data'),
  }));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.setGlobalPrefix('api/v1');

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  const port = Number(process.env.PORT_API ?? process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`API available at http://localhost:${port}/api/v1`, 'Bootstrap');
  logger.log(`Health checks: http://localhost:${port}/api/v1/health/live and /ready`, 'Bootstrap');
}
void bootstrap();
