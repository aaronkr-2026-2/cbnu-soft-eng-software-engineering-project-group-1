import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { FileLogger } from './file-logger.service.js';

describe('Pino application logger', () => {
  const originalPath = process.env.LOG_FILE;
  let directory: string;
  let logger: FileLogger | undefined;
  let terminal: string[];
  let diagnostics: string[];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'medconnect-logging-'));
    process.env.LOG_FILE = join(directory, 'private', 'application.log');
    terminal = [];
    diagnostics = [];
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      terminal.push(String(chunk));
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      diagnostics.push(String(chunk));
      return true;
    });
  });

  afterEach(async () => {
    await logger?.onModuleDestroy();
    logger = undefined;
    jest.restoreAllMocks();
    if (originalPath === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = originalPath;
    rmSync(directory, { recursive: true, force: true });
  });

  it('writes every Nest severity once per sink and drains on immediate shutdown', async () => {
    logger = new FileLogger();
    for (const method of ['log', 'warn', 'debug', 'verbose', 'error', 'fatal'] as const) {
      if (method === 'error') logger.error('Example error', undefined, 'Example');
      else logger[method](`Example ${method}`, 'Example');
    }
    await logger.onModuleDestroy();
    const records = terminal.map((line) => JSON.parse(line));
    const saved = readFileSync(process.env.LOG_FILE!, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(records.map((row) => row.level)).toEqual([30, 40, 20, 10, 50, 60]);
    expect(saved).toEqual(records);
    expect(records.every((row) => !Number.isNaN(Date.parse(row.time)))).toBe(true);
    expect(statSync(process.env.LOG_FILE!).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, 'private')).mode & 0o777).toBe(0o700);
    expect(diagnostics.filter((line) => line.startsWith('Application file logging'))).toEqual([]);
  });

  it('never serializes object payloads, Error contents or supplied stacks', async () => {
    logger = new FileLogger();
    const secret = 'private-fixture-marker';
    const payload: Record<string, unknown> = { password: secret, patientEmail: secret };
    payload.circular = payload;
    logger.log(payload, 'Example');
    logger.error(new Error(secret), `stack ${secret}`, 'Example');
    logger.error('Operation failed', `stack ${secret}`, 'Example');
    await logger.onModuleDestroy();
    const saved = readFileSync(process.env.LOG_FILE!, 'utf8');
    expect(terminal.join('') + saved).not.toContain(secret);
    expect(saved).toContain('Unhandled exception');
    expect(saved).toContain('Operation failed');
    expect(saved).not.toContain('stack');
  });

  it('continues on stdout when the log directory cannot be created', async () => {
    process.env.LOG_FILE = join(__filename, 'invalid', 'application.log');
    logger = new FileLogger();
    expect(() => logger!.log('Still available')).not.toThrow();
    await logger.onModuleDestroy();
    expect(terminal.join('')).toContain('Still available');
    expect(diagnostics).toEqual(['Application file logging unavailable; continuing on stdout.\n']);
    expect(diagnostics.join('')).not.toContain(__filename);
  });

  it('handles an invalid file target and immediate shutdown without hanging', async () => {
    process.env.LOG_FILE = directory;
    logger = new FileLogger();
    await logger.onModuleDestroy();
    expect(() => logger!.warn('Still available')).not.toThrow();
    expect(terminal.join('')).toContain('Still available');
    expect(diagnostics).toEqual(['Application file logging unavailable; continuing on stdout.\n']);
  });

  it('disables a failed file destination without leaking its error or breaking later logs', async () => {
    const destination = jest.spyOn(pino, 'destination');
    logger = new FileLogger();
    const file = destination.mock.results[0].value as ReturnType<typeof pino.destination>;
    await new Promise<void>((done) => file.once('ready', done));
    file.emit('error', new Error('private-path-and-provider-marker'));
    expect(() => logger!.error('Service unavailable')).not.toThrow();
    await logger.onModuleDestroy();
    expect(terminal.join('')).toContain('Service unavailable');
    expect(diagnostics.join('')).not.toContain('private-path-and-provider-marker');
  });
});
