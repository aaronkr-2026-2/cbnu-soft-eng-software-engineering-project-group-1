import { createConnection } from 'mongoose';
import { requireMongoUri } from '../database/database.config.js';
import {
  assertEmailVerificationStorage,
  setupEmailVerificationStorage,
} from '../schemas/email-verification.model.js';
async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    (args.length === 1 && !['--apply', '--check'].includes(args[0]))
  )
    throw new Error('Invalid arguments');
  const connection = await createConnection(requireMongoUri(), {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000,
  }).asPromise();
  try {
    if (args[0] === '--apply')
      await setupEmailVerificationStorage(connection.db!);
    else await assertEmailVerificationStorage(connection.db!);
    console.log('Email verification storage is ready');
  } finally {
    await connection.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error(
      'Email verification storage is unavailable. Check replica-set support and run member:email:storage -- --apply.',
    );
    process.exitCode = 1;
  });
