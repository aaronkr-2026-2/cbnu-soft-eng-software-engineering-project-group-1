import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor.js';
import type { FileLogger } from '../logger/file-logger.service.js';

describe('Request logging boundary', () => {
  const logger = { log: jest.fn(), error: jest.fn() };
  const interceptor = new LoggingInterceptor(logger as unknown as FileLogger);
  function context(transport: 'http' | 'graphql'): ExecutionContext {
    return {
      getType: () => transport,
      getClass: () => ({ name: 'ExampleController' }),
      getHandler: () => ({ name: 'lookup' }),
      getArgs: () => [null, { password: 'private-marker' }, {}, {
        parentType: { name: 'Query' }, fieldName: 'lookup',
      }],
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET', path: '/member/private-marker',
          originalUrl: '/member/private-marker?token=private-marker',
          headers: { authorization: 'Bearer private-marker' },
          body: { patientEmail: 'private-marker' },
          route: { path: '/member/:id' },
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
  }
  beforeEach(() => jest.clearAllMocks());

  it.each(['http', 'graphql'] as const)('records %s routing and timing without request/response data', async (transport) => {
    const result = { patientEmail: 'private-marker' };
    await expect(lastValueFrom(interceptor.intercept(context(transport), {
      handle: () => of(result),
    }))).resolves.toBe(result);
    const label = transport === 'http' ? 'GET /member/:id' : 'GraphQL Query.lookup';
    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.log.mock.calls[0][0]).toBe(`${label} started`);
    expect(logger.log.mock.calls[1][0]).toContain(`${label} completed`);
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('private-marker');
  });

  it.each(['http', 'graphql'] as const)('logs safe %s failures and rethrows the original error unchanged', async (transport) => {
    const error = new BadRequestException('private-marker');
    await expect(lastValueFrom(interceptor.intercept(context(transport), {
      handle: () => throwError(() => error),
    }))).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0][0]).toMatch(/failed in \d+ms \(status 400\)$/);
    expect(logger.error.mock.calls[0][1]).toBeUndefined();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private-marker');
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('treats unknown thrown payloads as status 500 without inspecting or replacing them', async () => {
    const error = { patientEmail: 'private-marker', toString: () => { throw new Error('Must not stringify'); } };
    await expect(lastValueFrom(interceptor.intercept(context('http'), {
      handle: () => throwError(() => error),
    }))).rejects.toBe(error);
    expect(logger.error.mock.calls[0][0]).toMatch(/\(status 500\)$/);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private-marker');
  });
});
