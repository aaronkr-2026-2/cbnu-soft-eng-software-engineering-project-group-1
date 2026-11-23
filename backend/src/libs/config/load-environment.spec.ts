import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvironment } from './load-environment.js';

describe('Native environment loading', () => {
  it('loads values, preserves existing exports and tolerates missing files in a real Node process', () => {
    const directory = mkdtempSync(join(tmpdir(), 'medconnect-config-'));
    try {
      const path = join(directory, '.env');
      writeFileSync(
        path,
        'MONGO_URI=mongodb://synthetic/config\nPORT_API=9999\n',
      );
      // Native loadEnvFile mutates Node's environment, not Jest's process.env proxy.
      const result = spawnSync(
        process.execPath,
        [
          '-e',
          `
        const loadEnvironment = (${loadEnvironment.toString()});
        loadEnvironment(${JSON.stringify(path)});
        loadEnvironment(${JSON.stringify(join(directory, 'missing.env'))});
        process.stdout.write(JSON.stringify({ uri: process.env.MONGO_URI, port: process.env.PORT_API }));
      `,
        ],
        { env: { PORT_API: '4321' }, encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        uri: 'mongodb://synthetic/config',
        port: '4321',
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
