# Booking and waitlist operations

This runbook covers the Nest API, the Next.js patient/clinic screens and MongoDB replica-set persistence. It is not authorization to migrate or deploy a real environment. Use a reviewed staging copy first. Production activation remains a separate operator action.

## Preconditions and activation order

1. Build backend and frontend and run booking integration tests with the owned disposable runner. Confirm patient-visible IN_APP delivery and clinic calendar visibility. A configured flag is not proof of a working delivery channel.
2. Before an initial legacy migration, stop **all** old/new API instances, worker processes and other database writers. Disable all six booking/waitlist flags below. Take a protected database backup and restore it into an isolated rehearsal database. Verify restored records and indexes. Follow the migration procedure below.
3. Start with `BOOKING_POLICY_V2_ENABLED=true`. Startup validates the migration marker, indexes and a consistent appointment/waitlist/commitment snapshot. A failed audit must block startup; do not bypass it.
4. Enable `WAITLIST_NOTIFICATIONS_ENABLED=true` and `WAITLIST_LIFECYCLE_ENABLED=true`. Confirm native IN_APP worker delivery and lifecycle processing in staging.
5. Enable `WAITLIST_ENROLLMENT_ENABLED=true`; optionally enable `COMMITMENT_REPLACEMENT_ENABLED=true`. Confirm patient enrollment, withdrawal, replacement and clinic visibility. With promotion off, the UI must accurately show that automatic booking is paused.
6. Last, enable `WAITLIST_PROMOTION_ENABLED=true`. It requires booking V2, enrollment, notifications and lifecycle. Watch the first cancellation → FIFO allocation → one appointment → patient notice → clinic calendar journey before expanding the pilot.

Flags default false. Apply the same configuration across API replicas, because workers run inside each Nest process. Multiple worker instances use durable claims and transactions. This release only delivers IN_APP notices; email/SMS are not configured.

## Initial legacy migration and restore rehearsal

Use explicit `MONGO_URI` for the intended isolated replica-set database. Do not put credentials in shell history, reports, screenshots or logs. Use protected environment/configuration injection and a private operator directory. The MongoDB database tools must be installed.

- Stop writers, disable booking policy and create a `mongodump` archive in the private directory. Restore into a separate database with `mongorestore` namespace mapping. Verify restored records before modifying the source database.
- Run `npm run booking:migrate -- --dry-run --report /private/operator/report.json`. Dry-run creates no collections/indexes. Reports are exclusively created with mode 0600 and may contain record IDs; keep them private.
- Review all issues. Do not infer a missing specialty or silently confirm PENDING records. Supply reviewed decisions through `--resolutions /private/operator/resolutions.json`, containing appointmentId, supported specialty/status and evidenceRef. Re-run dry-run with those decisions.
- Apply only with no unresolved issues and all writers stopped: `npm run booking:migrate -- --apply --writers-stopped --resolutions /private/operator/resolutions.json`. Omit resolutions only if no decisions are needed.
- Check required indexes, READY migration marker, metadata and commitment ledger. Re-running the same reviewed migration is idempotent before queue rollout.
- **Never rerun initial migration after waitlists exist.** It intentionally refuses queue history. Use read-only reconciliation below and a separately reviewed repair if drift is found.
- The current auditor has a 5000 appointment / 5000 waitlist rehearsal limit. Larger installations need a separately reviewed batch migration/auditor; do not raise the bound blindly.

If the rehearsal fails, stop and review its private report. Restore the backup only into a verified isolated destination during rehearsal. A real rollback after new writes requires a reviewed recovery plan; a blind backup restore would lose later bookings.

## Read-only monitoring and reconciliation

After building, run `npm run booking:status` with the intended database URI. The tool does not load AppModule, start workers, create indexes/collections, repair data or output patient identifiers/tokens. It reports:

- Queue depth (ACTIVE and NOTIFICATION_ONLY) and held allocation slots.
- Promotion and notification pending/processing counts, retrying work, attempts >=5 and expired claims.
- Oldest outstanding event timestamp and promotion average/maximum latency over the preceding 24 hours.
- Policy state and read-only snapshot reconciliation summary: appointment/waitlist validation, metadata and ledger consistency.

Exit 0 means policy/ledger reconciliation is consistent; exit 2 means missing/not-READY policy or data drift; exit 1 means the check could not complete. Backlog metrics are separate advisory reads and are not an atomic snapshot with the audit. Successful reconciliation alone does not prove delivery is healthy.

Poll at an operationally appropriate interval, initially 30 seconds in a pilot. Investigate expired claims that remain beyond two lease periods, growing backlog or oldest outstanding age across repeated samples, and any repeatedFailures or consistency=false. A held slot is expected while allocation is pending; check its associated work before treating it as corruption. Review only bounded aggregate counts and existing sanitized worker failure codes. Set alert thresholds from pilot load rather than treating local-test timing as a production SLA.

Operators with ADMIN access can also query `notificationDeliveryStatus { pending processing delivered retrying expiredClaims }`. Patient and clinic accounts cannot use that operator query. `/health/live`, `/health/ready`, and `/status` cover service/database availability, not queue correctness.

## Pause, retry and reconcile

- Pause automatic allocation: set `WAITLIST_PROMOTION_ENABLED=false` on **all** replicas and restart/drain them. Keep lifecycle and notification delivery enabled so existing entries reach cutoff and committed notices reach patients. Do not delete bookings, queues, ledgers, gates or outboxes.
- Stop new enrollment too when needed: disable `COMMITMENT_REPLACEMENT_ENABLED` and `WAITLIST_ENROLLMENT_ENABLED`. Existing cancellation/withdrawal remains available through the migrated persistence boundary.
- To pause new booking writes, also disable `BOOKING_POLICY_V2_ENABLED` and dependent flags. Do not perform initial migration as a recovery shortcut.
- Notification workers may remain enabled with promotion paused. If delivery itself must pause, first pause promotion, then disable notification delivery across replicas. A transaction already in progress may finish; verify resulting data before retrying.
- Claims use a 30-second lease. After a worker crash, a fresh process reclaims expired work. Normal transient failures receive bounded backoff and are retried automatically. Fix the underlying failure, enable the appropriate worker, then wait for lease/backoff and inspect aggregate progress.
- Do not clear claim tokens, force early lease expiry, reset attempts, mutate terminal events or manually create replacement appointments in production. Those actions are confined to disposable fault-injection tests.
- Run the read-only status command before and after recovery. If reconciliation fails, pause automation and investigate a protected snapshot with an operator; retain private evidence and prepare an explicit repair. Startup's snapshot audit remains authoritative and must not be suppressed.
- Required booking notices are durable. Retrying/replaying delivery uses the same notice ID and must preserve existing readAt. Promotion uses slot generations and expected versions to prevent duplicate or stale allocations.

## Step 12 acceptance evidence

Record actual test commands/results and local browser evidence in the README and session records after verification. Distinguish the disposable local pilot from staging and production. Keep deployment, external provider delivery and workload/SLA verification pending until performed in those environments. The user performs all commits and pushes manually.
