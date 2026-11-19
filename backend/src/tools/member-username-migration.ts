import 'reflect-metadata';
import { createConnection } from 'mongoose';
import { readFile, writeFile } from 'node:fs/promises';
import { requireMongoUri } from '../database/database.config.js';
import {
  auditUsernames,
  migrateUsernames,
  parseUsernameResolutions,
} from '../components/member/member-username-migration.js';

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (options.has(key)) throw new Error('Duplicate argument');
    if (['--apply', '--dry-run', '--writers-stopped'].includes(key))
      options.set(key, true);
    else if (
      ['--resolutions', '--report'].includes(key) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      options.set(key, args[++i]);
    else throw new Error('Invalid argument');
  }
  if (
    (options.has('--apply') && options.has('--dry-run')) ||
    (options.has('--apply') && !options.has('--writers-stopped'))
  )
    throw new Error('Apply requires stopped writers and cannot be a dry run');
  const path = options.get('--resolutions');
  const decisions = parseUsernameResolutions(
    path ? JSON.parse(await readFile(String(path), 'utf8')) : [],
  );
  const connection = await createConnection(requireMongoUri(), {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10000,
  }).asPromise();
  try {
    const audit = await auditUsernames(connection.db!, decisions);
    if (options.has('--report'))
      await writeFile(
        String(options.get('--report')),
        JSON.stringify(
          { summary: audit.summary, issues: audit.issues },
          null,
          2,
        ) + '\n',
        { mode: 0o600, flag: 'wx' },
      );
    const summary = options.has('--apply')
      ? await migrateUsernames(connection, decisions, true)
      : audit.summary;
    console.log(JSON.stringify(summary));
    if (summary.unresolved) process.exitCode = 2;
  } finally {
    await connection.close();
  }
}

if (require.main === module)
  void main().catch(() => {
    console.error(
      'Username migration did not complete. Check arguments, database configuration, and a private dry-run report.',
    );
    process.exitCode = 1;
  });
