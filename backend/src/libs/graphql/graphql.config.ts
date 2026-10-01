import { HttpException } from '@nestjs/common';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { unwrapResolverError } from '@apollo/server/errors';
import type { Request, Response } from 'express';

export const graphqlConfig: ApolloDriverConfig = {
  driver: ApolloDriver,
  path: '/graphql',
  autoSchemaFile: true,
  sortSchema: true,
  graphiql: process.env.NODE_ENV !== 'production',
  introspection: process.env.NODE_ENV !== 'production',
  includeStacktraceInErrorResponses: false,
  allowBatchedHttpRequests: false,
  context: ({ req, res }: { req: Request; res: Response }) => {
    res.setHeader('Cache-Control', 'no-store');
    return { req, res };
  },
  formatError: (formatted, error) => {
    const original = unwrapResolverError(error);
    if (original instanceof HttpException) {
      const status = original.getStatus();
      const codes: Record<number, string> = {
        400: 'BAD_USER_INPUT',
        401: 'UNAUTHENTICATED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        503: 'SERVICE_UNAVAILABLE',
      };
      return {
        message: status >= 500 ? 'Service unavailable' : original.message,
        extensions: { code: codes[status] ?? 'INTERNAL_SERVER_ERROR' },
      };
    }
    const code = String(formatted.extensions?.code ?? 'INTERNAL_SERVER_ERROR');
    const invalidRequest = [
      'GRAPHQL_PARSE_FAILED',
      'GRAPHQL_VALIDATION_FAILED',
      'BAD_USER_INPUT',
    ].includes(code);
    return {
      message: invalidRequest
        ? 'Invalid GraphQL request'
        : 'Internal server error',
      extensions: { code: invalidRequest ? code : 'INTERNAL_SERVER_ERROR' },
    };
  },
};
