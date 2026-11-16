import { createConnection } from 'mongoose';
import { requireMongoUri } from '../database/database.config.js';
import {
  assertPasswordRecoveryStorage,
  setupPasswordRecoveryStorage,
} from '../schemas/password-recovery.model.js';

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && !['--check', '--apply'].includes(args[0]))
  )
    throw new Error('Invalid arguments');
  const connection = await createConnection(requireMongoUri(), {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000,
  }).asPromise();
  try {
    if (args[0] === '--apply')
      await setupPasswordRecoveryStorage(connection.db!);
    else await assertPasswordRecoveryStorage(connection.db!);
    console.log('Password recovery storage is ready');
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      'Password recovery storage is unavailable. Check replica-set support and run member:recovery:storage -- --apply.',
    );
    process.exitCode = 1;
  });
