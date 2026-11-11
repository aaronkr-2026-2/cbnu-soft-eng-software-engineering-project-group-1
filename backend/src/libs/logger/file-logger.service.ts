import { Injectable, LoggerService } from '@nestjs/common';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

@Injectable()
export class FileLogger implements LoggerService {
  private readonly logFile = resolve(process.env.LOG_FILE ?? 'logs/medconnect.log');
  private directoryReady?: Promise<string | undefined>;

  log(message: unknown, context?: string): void { this.write('log', message, context); }
  error(message: unknown, stack?: string, context?: string): void { this.write('error', message, context, stack); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('verbose', message, context); }

  private write(level: string, message: unknown, context?: string, stack?: string): void {
    const output = `${JSON.stringify({
      timestamp: new Date().toISOString(), level, context,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...(stack ? { stack } : {}),
    })}\n`;

    // The file remains plain JSON; terminal output uses the familiar Nest-style colors.
    const terminalOutput = `${this.color(level)}${output}\x1b[0m`;
    (level === 'error' ? process.stderr : process.stdout).write(terminalOutput);
    void this.append(output);
  }

  private async append(output: string): Promise<void> {
    try {
      this.directoryReady ??= mkdir(dirname(this.logFile), { recursive: true, mode: 0o700 });
      await this.directoryReady;
      await appendFile(this.logFile, output, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      // A filesystem issue must never interrupt an API request or recurse through this logger.
      process.stderr.write(`Unable to write application log: ${String(error)}\n`);
    }
  }

  private color(level: string): string {
    switch (level) {
      case 'error': return '\x1b[31m'; // red
      case 'warn': return '\x1b[33m'; // yellow
      case 'debug': return '\x1b[35m'; // magenta
      case 'verbose': return '\x1b[36m'; // cyan
      default: return '\x1b[32m'; // green
    }
  }
}
