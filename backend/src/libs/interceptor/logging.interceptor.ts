import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
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
      // Route templates exclude patient IDs, tokens and query strings in URLs.
      const route = request.route as { path?: unknown } | undefined;
      label = `${request.method} ${typeof route?.path === 'string' ? route.path : '[unmatched]'}`;
    }
    this.logger.log(`${label} started`, target);

    return next.handle().pipe(
      tap(() => this.logger.log(
        `${label} completed${response ? ` ${response.statusCode}` : ''} in ${Date.now() - startedAt}ms`, target,
      )),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        this.logger.error(
          `${label} failed in ${Date.now() - startedAt}ms (status ${status})`,
          undefined,
          target,
        );
        return throwError(() => error);
      }),
    );
  }
}
