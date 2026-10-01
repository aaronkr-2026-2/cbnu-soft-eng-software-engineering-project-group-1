import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext, type GqlContextType } from '@nestjs/graphql';
import type { GraphQLResolveInfo } from 'graphql';
import type { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { FileLogger } from '../logger/file-logger.service.js';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: FileLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const transport = context.getType<GqlContextType>();
    if (transport !== 'http' && transport !== 'graphql') return next.handle();

    const startedAt = Date.now();
    const target = `${context.getClass().name}.${context.getHandler().name}`;
    // Log routing metadata only; arguments, query text, bodies, and responses can contain patient data.
    let label: string;
    let response: Response | undefined;
    if (transport === 'graphql') {
      const info = GqlExecutionContext.create(context).getInfo<GraphQLResolveInfo>();
      label = `GraphQL ${info.parentType.name}.${info.fieldName}`;
    } else {
      const request = context.switchToHttp().getRequest<Request>();
      response = context.switchToHttp().getResponse<Response>();
      label = `${request.method} ${request.path}`;
    }
    this.logger.log(`${label} started`, target);

    return next.handle().pipe(
      tap(() => this.logger.log(
        `${label} completed${response ? ` ${response.statusCode}` : ''} in ${Date.now() - startedAt}ms`, target,
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
