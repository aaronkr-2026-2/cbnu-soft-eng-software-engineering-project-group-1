import { Injectable, type LoggerService, type OnModuleDestroy } from '@nestjs/common';
import { mkdirSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pino, { type Level, type LoggerOptions } from 'pino';

const options: LoggerOptions = {
  level: 'trace',
  base: undefined,
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime,
};

@Injectable()
export class FileLogger implements LoggerService, OnModuleDestroy {
  private logger = pino(options, process.stdout);
  private file?: ReturnType<typeof pino.destination>;

  constructor() {
    try {
      const path = resolve(process.env.LOG_FILE ?? 'logs/medconnect.log');
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      // Open once at startup so a failed async open cannot strand shutdown.
      const file = pino.destination({ fd: openSync(path, 'a', 0o600), sync: false });
      this.file = file;
      file.on('error', () => {
        this.logger = pino(options, process.stdout);
        this.file = undefined;
        file.destroy();
        // Do not expose filesystem errors/paths or recurse through the failed sink.
        process.stderr.write('Application file logging unavailable; continuing on stdout.\n');
      });
      this.logger = pino(options, pino.multistream([
        { level: 'trace', stream: process.stdout },
        { level: 'trace', stream: file },
      ]));
    } catch {
      process.stderr.write('Application file logging unavailable; continuing on stdout.\n');
    }
  }

  log(message: unknown, context?: string): void { this.write('info', message, context); }
  // Nest supplies raw exception stacks here. Keep them out of application logs.
  error(message: unknown, _stack?: string, context?: string): void { this.write('error', message, context); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('trace', message, context); }
  fatal(message: unknown, context?: string): void { this.write('fatal', message, context); }

  private write(level: Level, message: unknown, context?: string): void {
    // Only application-authored text and context are accepted. Never serialize
    // arbitrary errors/objects, which may contain credentials or patient data.
    const text = typeof message === 'string'
      ? message
      : message instanceof Error ? 'Unhandled exception' : 'Non-text log omitted';
    this.logger[level]({ context: typeof context === 'string' ? context : undefined }, text);
  }

  async onModuleDestroy(): Promise<void> {
    const file = this.file;
    this.file = undefined;
    this.logger = pino(options, process.stdout);
    if (file) {
      await new Promise<void>((done) => {
        file.once('close', done);
        file.end();
      });
    }
  }
}
