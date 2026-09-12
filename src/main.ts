import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';

function loadEnvironment(): void {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function validateConfiguration(): void {
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
  const app = await NestFactory.create(AppModule);
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
  await app.listen(Number(process.env.PORT_API ?? process.env.PORT ?? 3000));
}
void bootstrap();
