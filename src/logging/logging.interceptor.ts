import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { FileLogger } from './file-logger.service.js';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: FileLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const target = `${context.getClass().name}.${context.getHandler().name}`;
    // Query strings, request bodies, and responses can contain patient data, so never log them.
    const label = `${request.method} ${request.path}`;
    this.logger.log(`${label} started`, target);

    return next.handle().pipe(
      tap(() => this.logger.log(
        `${label} completed ${response.statusCode} in ${Date.now() - startedAt}ms`, target,
      )),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `${label} failed in ${Date.now() - startedAt}ms: ${message}`,
          error instanceof Error ? error.stack : undefined,
          target,
        );
        return throwError(() => error);
      }),
    );
  }
}
