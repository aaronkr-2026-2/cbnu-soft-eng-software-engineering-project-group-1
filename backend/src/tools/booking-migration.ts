import 'reflect-metadata';
import { createConnection } from 'mongoose';
import { readFile, writeFile } from 'node:fs/promises';
import { requireMongoUri } from '../database/database.config.js';
import { BookingMigrationService } from '../components/booking/booking-migration.service.js';
import { parseBookingResolutions } from '../components/booking/booking-migration.js';
import { bookingPolicyEnabled } from '../components/booking/booking.config.js';

import { BookingCoordinationService } from '../components/booking/booking-coordination.service.js';
import {
  BOOKING_GATE,
  BookingGateSchema,
} from '../schemas/booking-gate.model.js';
import {
  BOOKING_COMMITMENT,
  BookingCommitmentSchema,
} from '../schemas/booking-commitment.model.js';
import {
  BOOKING_POLICY,
  BookingPolicySchema,
} from '../schemas/booking-policy.model.js';
import AppointmentSchema, {
  APPOINTMENT_MODEL_NAME,
} from '../schemas/appointment.model.js';
import MemberSchema, { MEMBER } from '../schemas/member.model.js';
import type { MemberEntity } from '../libs/types/member.types.js';

async function main() {
  const uri = requireMongoUri();
  if (bookingPolicyEnabled())
    throw new Error(
      'Disable BOOKING_POLICY_V2_ENABLED before using the migration tool',
    );
  const args = process.argv.slice(2);
  const options = new Map<string, string | boolean>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (['--apply', '--dry-run', '--writers-stopped'].includes(key))
      options.set(key, true);
    else if (
      ['--resolutions', '--report'].includes(key) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      options.set(key, args[++i]);
    else
      throw new Error(
        'Usage: booking:migrate [--dry-run | --apply --writers-stopped] [--resolutions file.json] [--report private-file.json]',
      );
  }
  if (options.has('--apply') && options.has('--dry-run'))
    throw new Error('Choose --apply or --dry-run');
  if (options.has('--apply') && !options.has('--writers-stopped'))
    throw new Error(
      'Apply requires --writers-stopped after all API/worker writers are stopped',
    );
  const resolutions = options.get('--resolutions');
  const decisions = parseBookingResolutions(
    resolutions ? JSON.parse(await readFile(String(resolutions), 'utf8')) : [],
  );
  // Disable automatic DDL: dry-run must not create collections or indexes.
  // Apply explicitly prepares them after the offline-writer checks.
  const connection = await createConnection(uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  }).asPromise();
  try {
    const commitments = connection.model(
      BOOKING_COMMITMENT,
      BookingCommitmentSchema,
    );
    const coordination = new BookingCoordinationService(
      connection,
      connection.model(BOOKING_GATE, BookingGateSchema),
      commitments,
    );
    const migration = new BookingMigrationService(
      coordination,
      connection,
      connection.model(APPOINTMENT_MODEL_NAME, AppointmentSchema),
      connection.model<MemberEntity>(MEMBER, MemberSchema),
      commitments,
      connection.model(BOOKING_POLICY, BookingPolicySchema),
    );
    const audit = await migration.audit(decisions);
    if (options.has('--report')) {
      // IDs/evidence belong in a private operator file, never console/app logs.
      // Exclusive creation prevents overwriting files or following a symlink.
      await writeFile(
        String(options.get('--report')),
        JSON.stringify(
          { summary: audit.summary, issues: audit.issues },
          null,
          2,
        ) + '\n',
        { mode: 0o600, flag: 'wx' },
      );
    }
    if (options.has('--apply')) {
      if (audit.issues.length)
        throw new Error(
          'Migration has unresolved records; inspect a private dry-run report',
        );
      await migration.apply(decisions);
      console.log(JSON.stringify((await migration.audit()).summary));
    } else console.log(JSON.stringify(audit.summary));
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  main().catch(() => {
    // Do not print provider errors or connection strings. A nonzero exit and
    // the private dry-run report expose enough operational state for this tool.
    console.error(
      'Booking migration did not complete. Check arguments, database configuration and a private dry-run report.',
    );
    process.exitCode = 1;
  });
}
