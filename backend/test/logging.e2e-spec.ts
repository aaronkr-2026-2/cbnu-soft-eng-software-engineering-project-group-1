import {
  BadRequestException, Controller, Get, Module, ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { graphqlConfig } from '../src/libs/graphql/graphql.config.js';
import { LoggingInterceptor } from '../src/libs/interceptor/logging.interceptor.js';
import { FileLogger } from '../src/libs/logger/file-logger.service.js';

const marker = 'private-fixture-marker';
@Controller('logging')
class ProbeController {
  @Get(':id')
  read() { return { patientEmail: marker }; }

  @Get(':id/failure')
  fail() { throw new BadRequestException(marker); }
}
@Resolver()
class ProbeResolver {
  @Query(() => String)
  loggingRead() { return marker; }

  @Query(() => String)
  loggingFailure(): string { throw new BadRequestException(marker); }
}
@Module({
  imports: [GraphQLModule.forRoot(graphqlConfig)],
  controllers: [ProbeController],
  providers: [ProbeResolver, FileLogger],
})
class ProbeModule {}

describe('Real HTTP/GraphQL Pino logging', () => {
  const originalPath = process.env.LOG_FILE;
  let directory: string;
  let app: INestApplication | undefined;
  const terminal: string[] = [];

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'medconnect-logging-api-'));
    process.env.LOG_FILE = join(directory, 'application.log');
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      terminal.push(String(chunk));
      return true;
    });
    const module = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = module.createNestApplication({ logger: false });
    const logger = app.get(FileLogger);
    app.useLogger(logger);
    app.useGlobalInterceptors(new LoggingInterceptor(logger));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
    if (originalPath === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = originalPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('logs one start/result per operation in both sinks while preserving responses and withholding private data', async () => {
    const server = app!.getHttpServer();
    await request(server).get(`/logging/${marker}?token=${marker}`)
      .set('Authorization', `Bearer ${marker}`).expect(200, { patientEmail: marker });
    await request(server).get(`/logging/${marker}/failure`).expect(400);
    const success = await request(server).post('/graphql')
      .set('Authorization', `Bearer ${marker}`)
      .send({ query: '{ private_fixture_alias: loggingRead }', variables: { patientEmail: marker } }).expect(200);
    expect(success.body.data.private_fixture_alias).toBe(marker);
    const failure = await request(server).post('/graphql')
      .send({ query: '{ loggingFailure }' }).expect(200);
    expect(failure.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(failure.body.errors[0].message).toBe(marker);
    await app!.close();
    app = undefined;

    const file = readFileSync(process.env.LOG_FILE!, 'utf8');
    expect(file).toBe(terminal.join(''));
    expect(file).not.toContain(marker);
    expect(file).not.toContain('private_fixture_alias');
    const records = file.trim().split('\n').map((line) => JSON.parse(line));
    for (const label of [
      'GET /logging/:id', 'GET /logging/:id/failure',
      'GraphQL Query.loggingRead', 'GraphQL Query.loggingFailure',
    ]) {
      const operation = records.filter((row) => row.message.startsWith(`${label} `));
      expect(operation).toHaveLength(2);
      expect(operation[0].message).toBe(`${label} started`);
      expect(operation[1].message).toMatch(/(?:completed.*in \d+ms|failed in \d+ms \(status 400\))$/);
    }
    expect(records.filter((row) => row.level === 50)).toHaveLength(2);
  });
});
