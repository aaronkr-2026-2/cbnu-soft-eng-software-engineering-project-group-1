# Package adoption and modular refactoring plan — FI-09

Date: November 21, 2026 (Asia/Seoul)

Status: **In progress — Steps 1–5 complete locally November 21, 2026.** Baseline,
logging, scheduling, configuration and timezone evaluation are recorded below.
Luxon adoption is deferred; Steps 6–8 remain pending.
Deployment, production log collection and shutdown grace periods remain unverified.

## Goal

Reduce custom infrastructure maintenance and make large functions easier to
understand by adopting suitable packages and separating clear responsibilities.
Preserve externally visible behavior and existing data guarantees. Success is
measured by simpler ownership and less duplication, not an arbitrary line count.

## Scope and boundaries

| Priority | Scope |
| --- | --- |
| Must have | Verified baseline, compatible package selection, logging and scheduling consolidation |
| Must have | Typed configuration, focused backend helpers, focused frontend hooks/components |
| Must have | Preserve API contracts, authorization, transaction/session boundaries, release flags and error recovery |
| Nice to have | Luxon adoption if an equivalent prototype demonstrably improves timezone helpers |
| Optional evaluation | BullMQ/Redis feasibility and a recorded adopt/defer decision |
| Deferred | BullMQ migration, new Redis deployment, authentication framework migration, password-hash migration, unrelated features |

This plan records future work, not authorization to begin implementation or alter
live data. No product behavior, endpoint, database schema or release flag changes
are intended. If equivalent behavior requires changing the scope, record the
tradeoff before proceeding with that change.

Use the backend worktree `.worktrees/backend` for backend changes and this plan;
backend code lives in its `backend/` folder. Use `.worktrees/next` for frontend
changes, whose code lives in its `next/` folder. Paths below are relative to the
appropriate worktree root. Inspect each worktree's instructions and current branch
before editing. Keep separate commits per application; the owner stages, commits
and pushes manually unless explicitly requested otherwise. Stop after each agreed
step, report verification and provide its proposed commit message. Do not merge,
deploy or send live emails as part of routine verification.

## Package selection rules

Recheck source and installed versions at implementation time. MediBridge uses a
different framework dependency set; its package versions are not automatically
compatible with MedConnect. Inspect actual MediBridge usage before adopting a
pattern. Verify peer dependencies, maintenance, security findings, deployment cost
and whether the package removes code we otherwise must maintain. Record selected
versions and the rationale with each step.

MedConnect already uses packages for validation, JWTs, Google verification, email,
rate limiting and database access. Keep those integrations unless a demonstrated
need warrants changing them. Node's scrypt already supplies password hashing;
adding bcrypt or Passport is outside this refactor.

## Delivery steps

### Step 1 — Establish the baseline

- [x] Confirm branch/worktree state and preserve unrelated changes.
- [x] Inventory logging, worker timers, environment reads and timezone helpers.
- [x] Recheck the identified large functions and their actual callers.
- [x] Run relevant existing backend and frontend checks; distinguish pre-existing
  failures and unavailable runtime checks from regressions.
- [x] Record baseline results and a compatible dependency shortlist in this plan.

Acceptance: identify affected files, interfaces, worker semantics and test commands;
record actual results without borrowing historical pass counts. Define how to
compare responsibilities, duplication and affected function sizes after changes.

Proposed commit, if baseline documentation changes: `docs(backend): record FI-09 baseline`.

### Step 2 — Replace custom logging

- [x] Evaluate Pino with a compatible Nest adapter such as `nestjs-pino`.
- [x] Replace `backend/src/libs/logger/file-logger.service.ts` output/formatting
  plumbing and adjust logger wiring.
- [x] Preserve useful context, levels, error visibility and current redaction.
- [x] Select stdout collection or configured file output based on verified hosting
  requirements; do not silently remove required persistence.
- [x] Remove redundant logging code only after callers are migrated.

Acceptance: successful and failing HTTP/GraphQL requests produce useful logs
without duplicate request entries, tokens, passwords, GraphQL arguments/response
data or patient information. Verify behavior when the selected output is unavailable.
Retain GraphQL execution timing if HTTP logging does not cover it.

Proposed commit: `refactor(backend): standardize application logging`.

### Step 3 — Standardize worker scheduling

- [x] Introduce compatible `@nestjs/schedule` integration.
- [x] Migrate notification delivery, waitlist lifecycle, promotion and password
  recovery delivery individually, with focused verification after each migration.
- [x] Remove repeated timer setup/cleanup only where the scheduler replaces it.
- [x] Preserve non-overlapping runs, feature gates, polling cadence, database
  claims/leases, retry/backoff behavior and graceful shutdown.

Acceptance: slow runs do not overlap within a process; competing workers retain
database coordination; restart recovery and disabled-worker behavior remain correct.
Shutdown waits appropriately for active work. Package scheduling does not replace
MongoDB event ownership, fencing or transactional business operations.

Proposed commit: `refactor(backend): consolidate background worker scheduling`.

### Step 4 — Centralize validated configuration

- [x] Introduce compatible `@nestjs/config` with typed configuration and startup
  validation, using existing validators where appropriate.
- [x] Migrate database, authentication, email and worker settings in small groups.
- [x] Preserve environment precedence, defaults, default-off gates and readiness
  checks. Inspect module evaluation order before replacing environment reads.
- [x] Remove obsolete helpers after confirming all consumers have migrated.

Acceptance: valid development/production configurations resolve as before; invalid
required values fail clearly without secrets in errors. Disabled optional features
do not unexpectedly require credentials. Tests can supply isolated configuration.

Proposed commit: `refactor(backend): centralize validated configuration`.

### Step 5 — Evaluate timezone simplification

- [x] Prototype Luxon against a limited existing helper, without changing policy.
- [x] Compare results and readability against `appointment-slot.ts` and its callers.
- [x] Cover UTC date boundaries, clinic-local dates, DST gaps/repeated hours,
  half-hour alignment, weekdays, lunch breaks and date overrides.
- [x] Adopt only if equivalent behavior and clearer maintenance are demonstrated;
  otherwise retain the helpers and record the reason.

Acceptance: discovery and booking writes agree on availability. Preserve explicit
instant handling and existing date/range validation. A documented defer decision
completes this evaluation without requiring a new dependency.

Proposed commit: `refactor(backend): simplify clinic timezone helpers`, or
`docs(backend): record timezone library evaluation` if no code is adopted.

### Step 6 — Split backend business functions

- [ ] `MemberService.updateMember`: extract password validation, patch construction
  and guarded persistence; keep image-claim and cleanup ordering explicit.
- [ ] Appointment transitions: extract validation, canceled-slot handling and
  deterministic outbox event creation.
- [ ] `BookingCoordinationService.run`: extract key construction, gate acquisition
  and transaction-operation construction.
- [ ] Promotion processing: separate claims, candidate processing, cutoff handling
  and retry orchestration after the scheduling migration.

Use private methods for single-service behavior. Add an injectable internal service
only when concrete reuse justifies it. Cross-service methods cannot be TypeScript
private methods, but need not be exposed as HTTP routes or GraphQL operations.
Preserve existing shared appointment rules for REST and GraphQL callers.

Acceptance: pass focused transaction/race tests, including authorization, optimistic
versions, concurrent booking, atomic replacement rollback, FIFO promotion, cutoff
crossing and event deduplication. Helpers receive the original transaction/session;
do not open independent transactions. Preserve unknown-outcome image claims and
password-driven session invalidation. Keep catches at the layer owning recovery.

Deliver one coherent service change at a time. Proposed commit pattern:
`refactor(backend): separate <service responsibility>`.

### Step 7 — Split frontend components

- [ ] `BookingForm`: selection, slot loading, replacement-source loading and views.
- [ ] `PersonalInfo`: profile editing, image handling, password fields and save coordination.
- [ ] `TeamSchedules`: doctor applications, weekly hours, overrides and slot preview.
- [ ] `ActionDialog`: submission/conflict/reconciliation hook and dialog presentation.

Reuse existing API clients, including `careRequest`. Preserve request cancellation,
stale-response guards, focus behavior, clinic timezone display, replacement drafts,
consent and uncertain-result handling. Do not create a generic abstraction merely
because several components contain try/catch or loading state.

Acceptance: focused frontend tests, typecheck/build and real local API/browser
checks for affected journeys, including keyboard/mobile behavior and outages.
Lost mutation responses trigger read reconciliation, never automatic mutation replay.
Split components must retain draft state and must not unexpectedly reset on remount.

Deliver one feature area at a time. Proposed commit pattern:
`refactor(next): separate <feature> state and presentation`.

### Step 8 — Final acceptance and queue decision

- [ ] Compare affected code and dependencies with the baseline; remove unused code.
- [ ] Run relevant backend/frontend checks and combined disposable-stack journeys.
- [ ] Update existing backend/Next architecture records and setup documentation
  where actual changes warrant it, preserving verification/deployment limits.
- [ ] Record BullMQ adopt/defer decision based on operational needs and Redis cost.
- [ ] If adoption is warranted, prepare a separate migration design before coding it.

Acceptance: existing API/error contracts, account/session behavior, booking/waitlist
guarantees and notification delivery remain correct. Report unresolved failures
explicitly. A queue design must preserve the MongoDB transactional outbox and
idempotency: publishing to Redis is not atomic with MongoDB writes. Queue evaluation
does not authorize implementation. Completion does not imply production rollout.

Proposed commits as appropriate: `test(backend): verify infrastructure refactoring`,
`test(next): verify refactored care journeys`, and documentation-only commits for
the actual final records.

## Order, rollback and completion

The first batch is Steps 1–3, reviewed one step at a time. Follow with configuration,
timezone evaluation, backend splits, frontend splits and final acceptance. Avoid
combining dependency migrations with transaction restructuring in the same change.

Keep each step independently reviewable and reversible. Revert its code and lockfile
changes together if acceptance fails; do not erase unrelated changes or roll back
shared data. Use synthetic/disposable fixtures for integration checks. Record actual
test results and any unavailable environment rather than inventing successful checks.

Mark FI-09 Completed only after required steps pass and conditional evaluations have
recorded adopt/defer outcomes. Update this plan and the roadmap with actual evidence.
No source-line reduction percentage, delivery date or implementation result is
promised. Existing behavior, smaller responsibilities and less custom infrastructure
are the success criteria.

## Step 1 baseline — November 21, 2026

### Checkout and tooling

Both application worktrees started clean: backend `1e891c4` on `backend`, and
Next.js `77c63de` on `next`. The outer `main` checkout is `f79f81f` and was not
modified. This baseline changes only this plan and the roadmap in the backend
worktree. No package install, lockfile change, application edit, live email,
production database action, staging, commit, push or deployment was performed.

Execution tooling: Node 26.5.0, npm 12.0.2 and Yarn 4.18.1. Installed backend:
Nest common/core/platform-express 12.0.1, GraphQL integration 14.0.0,
Mongoose 9.12.1, MongoDB driver 7.8.0, TypeScript 6.0.3 and Jest 30.5.1.
Installed frontend: Next.js 16.4.6, React 19.3.1 and TypeScript 5.9.3.
The backend Dockerfile targets Node 24.12.0; these local results do not substitute
for container/runtime verification on that version.

### Verification results

| Check | Actual command or execution | Result |
| --- | --- | --- |
| Backend build | `npm run build` | Passed, including configured assets |
| Backend full TypeScript | `./node_modules/.bin/tsc --noEmit --incremental false` | Passed, including test types |
| Backend lint | `npm run lint` | Passed; no warning reported in this run |
| Backend unit tests | `npm test -- --runInBand` | 145 passed, 10 suites |
| Backend HTTP/GraphQL tests | `npm run test:e2e -- --runInBand` | 232 passed, 8 suites; fixture dependencies |
| Booking transactions/workers | `node test/run-booking-integration.cjs` | 195 passed, 2 suites; disposable replica set and standalone MongoDB |
| Directory, usernames, deletion, email and recovery | Same disposable runner with a temporary combined profile selecting the existing seven suites | 315 passed, 7 suites |
| Deployment script regression | `npm run test:deployment` | 8 passed; mocked deployment checks, not a real deploy |
| Next.js types | `yarn typecheck` | Passed |
| Next.js tests | `yarn test` | 167 passed |
| Next.js production build | Installed Next CLI, `build <isolated-copy> --webpack` | Passed using tracked source, no copied environment files and the existing installed dependencies |
| Existing backend runtime dependency audit | `npm audit --omit=dev --json` | Zero reported vulnerabilities; development dependencies and prospective packages were not audited by this command |

Total automated tests passed: **895 backend + 167 frontend = 1,062**. These counts
are fresh results, not historical totals. The temporary combined profile selects
directory, member-username, account-deletion, email-verification and the three
password-recovery integration suites; it does not include the separate combined
Next/Nest recovery acceptance suite. Delivery providers in the selected tests are
stubbed. Browser journeys, live providers, deployed integration, Docker image and
production behavior were not verified in Step 1.

Initial sandbox API/socket and MongoDB startup attempts failed with local-port
`EPERM`; approved reruns passed without source changes. The first registry lookup
failed with DNS `ENOTFOUND`; approved read-only metadata queries succeeded. These
were environment restrictions, not application test regressions. Existing
experimental VM-module and deprecated Mongoose `new`-option warnings appeared;
no test failures remained after reruns.

Temporary logs, metadata, inventory and the isolated frontend build are under
`/private/tmp/medconnect-fi09-baseline-ryZ0hj/`. They are local, disposable evidence,
not committed artifacts. The existing MongoDB runner owns and cleans its temporary
database processes and files. To repeat the combined integration run, copy an
existing integration JSON profile to a temporary path, set its `rootDir` to the
absolute backend `test/` directory and select
`(directory|member-username|account-deletion|email-verification|password-recovery(?:-delivery|-reset)?)\.integration-spec\.ts$`.
Pass that profile's absolute path to `node test/run-booking-integration.cjs`.

### Infrastructure inventory and constraints

**Logging:** `src/libs/logger/file-logger.service.ts` is 49 physical lines;
`src/libs/interceptor/logging.interceptor.ts` is 46. `src/main.ts` installs the
logger and global interceptor, and `src/app.module.ts` registers the provider.
The logger writes JSON to `LOG_FILE` (default `logs/medconnect.log`) and colored
terminal output. The interceptor records HTTP/GraphQL routing metadata, duration
and failures without request arguments/bodies or response data; its error path
includes message/stack text. Preserve existing exclusions and explicitly assess
error redaction in Step 2. Existing member API tests assert log labels and absence
of private fields. Compose mounts uploads, not logs, so durable log collection is
not established by the checked-in container configuration. Define output handling
before removing file output; no production logging verification was performed.

**Workers:** the three waitlist-related services share a completion-driven,
one-second recursive timeout pattern. It is not a fixed wall-clock interval.

| Worker source | Current scheduling and ownership behavior to retain |
| --- | --- |
| `src/components/notification/notification.service.ts` | Enabled/migrated startup; poll up to 25 deliveries, then wait one second; tracked running promise and destroy wait; fenced delivery claims and retries |
| `src/components/appointment/appointment-waitlist-lifecycle.service.ts` | Enabled/migrated startup; poll up to 25 lifecycle operations, then wait one second; tracked running promise and destroy wait |
| `src/components/appointment/appointment-promotion.service.ts` | Enabled startup; one bounded claim/candidate-processing run, then wait one second; tracked running promise and destroy wait; 30-second claim lease and generation fencing |
| `src/components/auth/password-recovery.service.ts` | Enabled/storage-ready startup; initial zero-delay tick, then one-second delay after work; `inFlight` coalesces callers; application-shutdown waits; durable leases, definitive retries and ambiguous-outcome handling |

All four unreference timers and check stop/enablement state. `main.ts` currently
does not call `enableShutdownHooks`; automatic signal-driven shutdown must be
assessed separately from hooks invoked by `app.close()` in tests. Scheduler
adoption must not silently change polling throughput, introduce overlapping work,
or claim cross-process safety without the existing database coordination.

**Configuration:** 13 non-test `.ts`/`.js` files under `backend/src` contain direct
`process.env` references: `main.ts`, `database/database.config.ts`,
`libs/graphql/graphql.config.ts`, `libs/logger/file-logger.service.ts`,
`components/booking/booking.config.ts`, `components/member/member.module.ts`,
`components/member/member.controller.ts`, `components/upload/upload.service.ts`,
and auth's `email-verification.service.ts`, `password-recovery-policy.ts`,
`password-recovery.service.ts`, `email-delivery.service.ts`, and
`google-auth.service.ts`. This is a file count, not a count of settings or all
indirect configuration consumers. Several modules also evaluate `getMongoUri()`
at import time. Bootstrap loads `.env` before dynamically importing `AppModule`;
preserve that ordering, optional-feature requirements and direct test injection.
Native defaults and Compose overrides differ: Compose explicitly defaults six
booking/waitlist flags to true. Do not change either behavior accidentally.

**Timezones:** `src/components/appointment/appointment-slot.ts` is 154 physical
lines. `appointmentSlot`, `appointmentCandidates` and `slotFitsSchedule` are reused
by booking writes and schedule discovery. Existing helper tests cover DST,
quarter-hour offsets and standard-hours restrictions. Frontend
`next/libs/booking.ts`, `booking-calendar.ts` and `workspace.ts` also implement
display/local-date/calendar calculations; do not transfer trusted booking policy
to the browser when simplifying these helpers.

**MediBridge reference:** inspected root `package.json`, API `src/app.module.ts`,
and batch `src/batch.module.ts`/`batch.controller.ts` in the local reference.
Configuration is global there and scheduling is actually used in the batch
application through `ScheduleModule`, `@Cron` and `@Timeout`. Its daily jobs do
not demonstrate MedConnect's non-overlapping completion-driven polling behavior.

### Function sizes and actual interfaces

The TypeScript parser measured inclusive physical lines from function/method start
through its end. Counts include comments, whitespace, nested callbacks and JSX;
they are not executable statement counts. Compare with the same method later and
also report helper/component size, duplication and new dependency overhead.

| Function | Source | Baseline lines |
| --- | --- | ---: |
| `MemberService.updateMember` | `backend/src/components/member/member.service.ts:885` | 158 |
| `AppointmentService.transitionInTransaction` | `backend/src/components/appointment/appointment.service.ts:708` | 151 |
| `BookingCoordinationService.run` | `backend/src/components/booking/booking-coordination.service.ts:96` | 190 |
| `AppointmentPromotionService.runOnce` | `backend/src/components/appointment/appointment-promotion.service.ts:82` | 192 |
| `NotificationService.runOnce` | `backend/src/components/notification/notification.service.ts:266` | 127 |
| `BookingForm` | `next/components/booking/BookPage.tsx:44` | 557 |
| `PersonalInfo` | `next/components/mypage/MyPage.tsx:136` | 558 |
| `TeamSchedules` | `next/components/workspace/TeamSchedules.tsx:52` | 469 |
| `ActionDialog` | `next/components/booking/ActionDialog.tsx:31` | 392 |

Backend REST and GraphQL booking entry points both call
`AppointmentService.bookAppointment` behind `MemberAccessGuard`. The member
resolver delegates profile updates to `MemberService.updateMember`. Commitment
replacement calls `cancelInTransaction` and `bookInTransaction`; promotion also
calls `checkPromotionEligibility` and `bookInTransaction`. These are real internal
consumers: preserve their service interfaces and original `BookingTransaction`.
Frontend booking, workspace and notification adapters already share `careRequest`
from `next/libs/api/booking.ts`; retain that reuse. Preserve uncertain mutation
results, baseline reads and explicit reconciliation rather than automatic replay.

### Dependency shortlist and decisions

Read-only npm registry metadata was checked November 21, 2026. No candidate was
installed, resolved into a new lockfile, audited as a prospective dependency tree,
or runtime-tested. Peer/engine compatibility below is a shortlist, not acceptance.

| Candidate | Observed metadata and decision |
| --- | --- |
| Pino `10.4.0` | Framework-independent logger candidate; evaluate a small Nest `LoggerService` adapter if a full Nest integration would require an unnecessary framework upgrade. No install or runtime compatibility claim yet. |
| `nestjs-pino` `5.3.2` | Requires Nest common/core `^11.0.8 || ^12.0.2`, Node `>=22.12.0`, Pino `^10` and pino-http `^11`. Installed Nest 12.0.1 fails its peer range. Do not force-install: Step 2 must choose direct Pino or a separately verified coherent Nest patch update before using this adapter. |
| `@nestjs/schedule` `12.0.4` | Declares Nest common/core `^11 || ^12` and Node `>=20.19.0`; metadata matches installed Nest and both local/container Node versions. ESM integration and exact polling semantics still need Step 3 verification. |
| `@nestjs/config` `12.1.1` | Declares Nest common `^11 || ^12` and RxJS `^7.1`; matches installed peer versions. ESM/bootstrap ordering and test injection still need Step 4 verification. |
| Luxon `3.7.2` | Declares Node `>=12`, with no Nest coupling. Conditional Step 5 prototype only; check TypeScript declarations and exact timezone equivalence before adoption. |
| BullMQ/Nest queue integration | Deferred; no package/version selected. Introducing Redis is outside this baseline and requires the Step 8 operational/outbox design decision. |

The current backend runtime audit reports no findings; that does not certify the
uninstalled candidates. Recheck release metadata, advisories and the resolved tree
when selecting each dependency. Do not use force/legacy-peer-deps to bypass a
version mismatch. No existing hashing, rate-limit or Google-auth package needs
replacement for this work.

Reference documentation: [Pino](https://github.com/pinojs/pino),
[Nest Pino adapter](https://github.com/iamolegga/nestjs-pino),
[Nest scheduling](https://docs.nestjs.com/techniques/task-scheduling),
[Nest configuration](https://docs.nestjs.com/techniques/configuration), and
[Luxon](https://moment.github.io/luxon/api-docs/index.html).

At Step 1 completion, Step 2 remained the next agreed implementation boundary.
The proposed baseline commit was `docs(backend): record refactoring baseline`.

## Step 2 acceptance — November 21, 2026

Started from clean backend `50e3ec3`. Added exact runtime dependency Pino `10.4.0`
with lifecycle scripts disabled during installation. The lockfile gained 13 package
entries; no existing locked package version or Nest version changed. The
`nestjs-pino` adapter remains uninstalled because its current peer range excludes
Nest 12.0.1. Existing Nest logger/interceptor registration is retained, avoiding a
framework upgrade or a duplicate HTTP auto-logger.

`FileLogger` is now a small Nest adapter over Pino serialization, levels,
multi-stream output and asynchronous destination writes. Custom JSON formatting,
terminal coloring and per-entry filesystem appends were removed. Retained stdout
and configured file output because verified hosted collection is unavailable;
default `LOG_FILE` remains `logs/medconnect.log`. File errors switch to stdout with
a static stderr diagnostic, and orderly module destruction drains/closes the file.
File loss during an output failure is not replayed. Container log persistence and
signal-hook behavior were not changed or verified in production.

Operational log format changes are intentional and documented: numeric Pino
severity, ISO `time` (instead of `timestamp`), `message` and optional `context`;
JSON stdout at every level, without ANSI colors, replaces split stdout/stderr
application logging. New directories/files use 0700/0600 without rewriting existing
permissions. Unknown objects/Error contents and supplied stacks are not serialized.
HTTP logs use route templates; GraphQL logs use canonical field names. Failure logs
retain status/timing/context rather than raw exception messages or stacks. The
database connection error callback now uses a static message. Callers must still
keep sensitive information out of application-authored strings.

Verified locally:

- Build passed after an approved rerun of the sandbox asset-watcher `EMFILE` failure.
- Full TypeScript and lint passed.
- All **155 unit tests** and **233 HTTP/GraphQL API tests** passed (**388 total**).
  Ten new unit cases cover logger/interceptor privacy, severity mapping, output
  failures, permissions, unknown thrown values and shutdown. One new loopback API
  case exercises real Pino/Nest HTTP and GraphQL success/failure paths, asserts
  one start/result per operation in each sink and verifies unchanged responses.
- Compiled CommonJS logger smoke passed. Runtime dependency audit reported zero
  vulnerabilities in the resolved tree; this is not an audit of dev dependencies.
- Existing transaction/browser/production acceptance was not rerun or claimed;
  no booking rules, worker scheduling, frontend source or release flags changed.

Focused tests caught an introduced async file-open/shutdown race and a test harness
assertion that captured an unrelated VM warning. The implementation now opens the
file once synchronously at startup and writes asynchronously; the invalid-file and
immediate-shutdown cases pass. Local evidence is under
`/private/tmp/medconnect-fi09-step2-Zmh3Id/` and is not a committed artifact.

The logger adapter is 69 physical lines versus 49 before; the interceptor is 48
versus 46. This step removes hand-maintained serialization/output mechanics, not
application policy, and does not claim a source-line reduction. Added lines cover
privacy boundaries, failed-output handling and orderly close. Larger function
splits remain Step 6/7 work.

README, existing backend architecture, roadmap and implementation records reflect
the delivered scope. No live email, application database, deployment, staging,
commit, push or merge actions were performed. No sprint covers this date; closed
sprint history is preserved. Stop after Step 2; scheduling is Step 3 when requested.

Proposed manual commit: `refactor(backend): standardize logging with Pino`.


## Step 3 acceptance — November 21, 2026

Implemented in the backend worktree from clean `6cb134f` on `backend`. Exact
`@nestjs/schedule` **12.0.4** accepts Nest common/core `^11 || ^12` and Node
`>=20.19.0`, compatible with installed Nest 12.0.1 and the declared container Node
24.12.0. Existing locked package versions were preserved. The package brings
cron 4.4.0, Luxon 3.7.2 and its typings transitively; application timezone helpers
remain unchanged and Step 5 is still pending. No Redis/deployment service is added.
Installed package source/metadata and the official
[Nest dynamic-timeout documentation](https://docs.nestjs.com/techniques/task-scheduling#dynamic-timeouts)
were checked. The inspected MediBridge API contained no scheduler integration to
reuse; its dependency set was not copied.

### Implementation and preserved behavior

- `src/libs/scheduling/worker-scheduling.module.ts` supplies one shared Nest schedule
  module and `WorkerScheduler`; member, appointment and notification modules import
  it explicitly, including when tests instantiate those feature modules directly.
- `worker-scheduler.service.ts` centralizes named, unreferenced registry timeouts,
  failure recovery, stop and active-work draining. A completed run waits **one full
  second** before the next run, preserving completion-driven polling rather than
  adopting a fixed wall-clock interval. Recovery starts at zero delay; the other
  three workers first wait one second. Fired entries are removed from the registry.
- Notification delivery, waitlist lifecycle, promotion and password recovery now
  delegate only their timing to that helper. Feature gates, startup readiness,
  bounded batches, safe error codes, recovery `inFlight` coalescing, transactional
  operations, durable claims/leases/generation fences and retry/backoff are intact.
- Each service stops and drains in `onModuleDestroy`. Recovery also retains its
  idempotent application-shutdown entry point for independent fixtures. Draining
  now precedes Mongoose's application-shutdown connection close. `main.ts` enables
  Nest shutdown hooks so process signals invoke the existing graceful lifecycle.
  No drain deadline or cancellation/replay of uncertain provider work was added.
- Independent-worker fixtures explicitly supply a scheduler/registry. New focused
  checks cover timing, errors, timer cancellation, Nest registration/close and the
  notification, lifecycle and promotion services' disabled/slow/shutdown behavior.
  The existing actual recovery timer test now exercises `onModuleDestroy`.

### Verification and limits

| Check | Actual result |
| --- | --- |
| `npm run build` | Passed, including configured assets |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Passed, including fixture types |
| `npm run lint` | Passed without warnings |
| `npm test -- --runInBand` | 167 passed in 14 suites; includes 12 new scheduling/lifecycle checks |
| `npm run test:e2e -- --runInBand` | 233 passed in 9 suites |
| `node test/run-booking-integration.cjs` | 195 passed in 2 suites using disposable MongoDB, including contention, abandoned claims, restart/fencing and deduplication |
| `node test/run-booking-integration.cjs test/jest-recovery.json` | 71 passed in 3 suites; stubbed delivery, real MongoDB leases/retries/timer/shutdown |
| Compiled CommonJS signal smoke | Real Nest context/NotificationService and shared scheduling module waited on blocked work after SIGTERM, drained after release, then exited with SIGTERM |
| `npm audit --omit=dev --json` | Zero runtime vulnerabilities reported |

**666 automated tests passed.** Focused checks and recovery were rerun after their
final test refinements; their counts are included once. The build and compiled
smoke establish local Node 26 CommonJS/ESM interoperability, not a tested container
runtime. The signal fixture is local disposable evidence at
`/private/tmp/medconnect-fi09-step3-signal.cjs`; audit output is at
`/private/tmp/medconnect-fi09-step3-audit.json`.

The initial sandbox MongoDB runner could not bind a local socket (`EPERM`); the
approved run passed. An initial metadata lookup had DNS restrictions; approved
installation and installed metadata/source inspection succeeded. These were
environment restrictions, not application failures. The package installation
reported nine moderate development-tree advisories; only the runtime tree was
explicitly audited here. Existing Mongoose deprecation and VM-module warnings
remain. No new agent error or application regression was identified.

The prior four service-local timer loops are removed. Timing now has one owner;
business processing and MongoDB ownership remain separate. The new helper is a
small completion-loop adapter over the package registry, not a queue framework or
a rewrite of the durable workers. No line-reduction percentage is claimed.

Existing backend architecture, roadmap and implementation records are updated.
README entry/setup information is unchanged. No sprint covers November 21; closed
sprint history is preserved. No frontend, application database, live email,
release flag, deployment, staging, commit, push or merge changes were made.
Production signal grace periods, provider behavior and container deployment remain
unverified. Stop after Step 3; Step 4 configuration work requires its own request.

Proposed manual commit: `refactor(backend): consolidate background worker scheduling`.


## Step 4 acceptance — November 21, 2026

Implemented from clean backend `95f78e7` (Step 3 committed by the owner). Exact
`@nestjs/config` **12.1.1** accepts Nest common `^11 || ^12` and RxJS `^7.1`, matching
installed Nest 12.0.1/RxJS. Installed package metadata/source and the official
[Nest configuration documentation](https://docs.nestjs.com/techniques/configuration)
were checked. The lockfile adds the package and four dependencies (dotenv,
dotenv-expand, es-toolkit and Standard Schema typings); every previously locked
package entry remains unchanged. No schema-validation package was added. Existing
class-validator email validation and existing flag/origin/URI policies are reused.
MediBridge's shared global ConfigModule was inspected; its automatic file loading
was deliberately not copied because this app selects models during import.

### Configuration ownership and preserved timing

- `src/libs/config/application-config.module.ts` imports ConfigModule with
  `ignoreEnvFile: true`, uncached reads and an injected typed `ApplicationConfig`.
  Root/database/booking/member modules explicitly import the shared global module.
- `load-environment.ts` keeps native `process.loadEnvFile` behavior. Bootstrap loads
  the working-directory `.env`, validates required settings, then dynamically
  imports AppModule. Existing exports win; missing files remain allowed. ConfigModule
  does not load a second file or expand environment values differently.
- The typed service centralizes database/JWT/Google/Gmail/recovery/worker/server,
  CORS, upload and logging settings. All four workers and auth/email services use
  injected configuration, with a default for independent instances. Database/model
  registration still selects the URI at module evaluation; those adapters and
  GraphQL's production options read the same central source after native loading.
- `database.config.ts` and `booking.config.ts` remain consumed CLI/pure-call adapters;
  their former parsers now have one owner under `libs/config`. Recovery origin
  validation moved there too. No direct `process.env` reads remain in non-test app
  source; ConfigService provides environment access. Native loading is the explicit
  boundary. Existing CLI scripts still use their documented Node env-file flags.
- Normal startup requires a 32-byte JWT secret and the selected MongoDB URI. Module
  initialization validates selected port, flag syntax/dependencies and configured
  infrastructure, retaining database-free feature tests. Flags still default off;
  booking flags remain strict and recovery retains its existing trim/empty rules.
  SMTP/Google remain lazy, while explicitly enabled recovery validates origin/mail
  settings and retains service-owned storage readiness. No credentials are required
  merely because a disabled feature exists.
- Existing URI precedence, empty override behavior, production SRV requirement,
  CORS defaults, production cookies, log/upload paths and API error contracts remain.
  Selected ports now fail early with a static error for blank, nonnumeric,
  fractional or out-of-range input; 0–65535 is accepted, including ephemeral port 0.
  This validation is documented rather than silently coercing a blank port to 0.
- `configurationFor(explicitEnvironment)` reads only that object. Tests can also
  override ConfigService/ApplicationConfig; normal runtime reads stay uncached so
  existing gate/credential rechecks continue to work. Validation errors contain
  setting names/policy only, never rejected values. Required validation does not
  replace MongoDB migration/readiness, transactions or leases.

### Verification

| Check | Actual result |
| --- | --- |
| `npm run build` | Passed, including assets; final sandbox watcher limit cleared on approved rerun |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Passed including test types |
| `npm run lint` | Passed without warnings after correcting new unused-expression warnings |
| `npm test -- --runInBand` | 191 passed, 16 suites; 24 new configuration/native-loader checks |
| `npm run test:e2e -- --runInBand` | 233 passed, 9 suites |
| Disposable combined booking-policy/directory/username/deletion/email/recovery run | 492 passed, 8 suites |
| Disposable booking-coordination run | 18 passed, 1 suite; selected separately because the combined profile omitted it |
| `npm run test:deployment` | 8 passed; mocked deployment, no live release |
| Compiled CommonJS/ESM subprocess checks | Passed native export/file precedence, loaded-before-import DB registration, no unexpected file loading through ConfigModule, credential-free module startup and secret-safe bootstrap rejection |
| `npm audit --omit=dev --json` | Zero runtime vulnerability findings |

**942 automated tests passed**, including **510 disposable MongoDB integration
checks**. Focused configuration checks were rerun after the final test refinement;
counts are included once. The first loader test incorrectly expected native
`loadEnvFile` to mutate Jest's environment proxy. Full unit tests caught it; the
corrected test runs the actual loader in a real Node subprocess with a minimal
synthetic environment (B-032). No production loader change was needed for that
failure. Initial unused-expression lint warnings were removed; final lint is clean.
The final build's sandbox EMFILE watcher error was an environment restriction;
the approved rerun passed. Existing VM-module/Mongoose warnings remain.

Temporary profiles/evidence:
`/private/tmp/medconnect-fi09-step4-integration.json`,
`/private/tmp/medconnect-fi09-step4-coordination.json`,
`/private/tmp/medconnect-fi09-step4-smoke.cjs` and
`/private/tmp/medconnect-fi09-step4-audit.json`. Rerun a profile with
`node test/run-booking-integration.cjs <absolute-profile-path>` from backend/;
profiles use absolute test roots and the existing disposable runner owns cleanup.
The normal `test:booking:integration`, directory/username/deletion/email/recovery
commands remain available. SMTP/provider calls were stubbed; no live mail was sent.
The runtime audit excludes development dependencies; installation reported the
existing nine moderate development-tree advisories. Local Node 26 verification
does not establish the declared Node 24 container or production behavior.

README configuration guidance, existing architecture, roadmap and project records
are updated. No sprint covers this date; closed records remain unchanged. No
application database, release flags, credentials/env files, frontend, deployment,
staging, commit, push or merge changes were made. No timezone or business-function
refactoring is included. Stop after Step 4; Step 5 remains pending.

Proposed manual commit: `refactor(backend): centralize validated configuration`.


## Step 5 acceptance — November 21, 2026

**Decision: defer Luxon adoption; retain the existing application helpers.** This
completes the conditional evaluation, not a timezone migration. Work started from
clean backend `7471b99`. No application source, manifest or lockfile was changed.
Luxon **3.7.2**, already installed transitively through `@nestjs/schedule` → cron,
was used only in a disposable prototype. A future production import would need a
declared direct dependency; transitive availability is not an application contract.
No package install or new runtime dependency was needed for this evaluation.

### Prototype and comparison

Inspected `appointment-slot.ts`, its 34 existing tests, the shared doctor/timezone
lookup and actual callers. `AppointmentScheduleService.getAvailableSlots` scans
explicit UTC instants, scopes overrides to each clinic-local date and filters with
`slotFitsSchedule`. `AppointmentService` recalculates the explicit slot and invokes
that same policy using transaction-bound hours/overrides. Schedule edits also reuse
these calculations. The inspected MediBridge API had no Luxon timezone helper to
adopt. No frontend change is involved.

The limited prototype replaces formatting-to-parts and date-based weekday parsing
with `DateTime.fromJSDate`, `fromMillis`, `toISODate`, hour/minute fields and
`weekday % 7`. It retains the original instant, elapsed 30-minute duration,
end-minus-one-millisecond continuity checks, alignment rules and exception shapes.
It uses `IANAZone.create` validation rather than Luxon's general zone-string
normalization: a direct string replacement accepts `local`, `system`, `default`
and `UTC+9`, which the existing native validator rejects on this runtime.

The core evaluated adapter is reproduced here (the complete candidate generator
and differential harness are in the local artifact described below):

```js
function prototypeWithZone(startsAt, zone) {
  if (!zone.isValid)
    throw new BadRequestException('Clinic timezone is invalid');
  if (!Number.isFinite(+startsAt)) throw new RangeError('Invalid time value');
  const endsAt = new Date(+startsAt + 30 * 60_000);
  const start = DateTime.fromJSDate(startsAt, { zone });
  const last = DateTime.fromMillis(+endsAt - 1, { zone });
  const minute = start.hour * 60 + start.minute;
  if (startsAt.getUTCSeconds() !== 0 ||
      startsAt.getUTCMilliseconds() !== 0 || minute % 30 !== 0 ||
      last.toISODate() !== start.toISODate() ||
      last.hour * 60 + last.minute !== minute + 29)
    throw new BadRequestException(
      'Choose a 30-minute slot aligned to clinic local time');
  return { endsAt, date: start.toISODate(), weekday: start.weekday % 7,
    startMinute: minute, endMinute: minute + 30 };
}
// One-slot caller: prototypeWithZone(instant, IANAZone.create(timezone)).
// Candidate generation reuses that zone for the unchanged 15-minute UTC scan.
```

The prototype deliberately reuses `appointmentDateRange` and `slotFitsSchedule`;
it does not pretend a date library supplies clinic business policy. The public
Luxon [API](https://moment.github.io/luxon/api-docs/index.html),
[zone guidance](https://github.com/moment/luxon/blob/master/docs/zones.md) and
[invalid-value behavior](https://github.com/moment/luxon/blob/master/docs/validity.md)
were checked against installed source. Explicit instants avoid choosing a local
DST occurrence; local-time construction would require different ambiguity policy.
Invalid DateTime objects also require deliberate handling rather than assuming
all library failures throw our existing exceptions.

### Fresh results and limits

| Check | Result |
| --- | --- |
| `npm test -- --runInBand src/components/appointment/appointment-slot.spec.ts` | 34 passed |
| `npm run build` | Passed, including configured assets |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Passed |
| `npm run lint` | Passed without warnings |
| `node test/run-booking-integration.cjs` | 195 passed in 2 suites on disposable MongoDB; includes discovery/write/schedule/override and transaction/worker regressions |
| Differential explicit-instant checks | 25,354 matched return values or exception type/status/message |
| Candidate day-window comparisons | 88 matched full ordered results |
| Shared schedule/write comparisons | 1,188 accepted discovery results matched recalculated write-policy results |
| Range/date checks | 6 matched, including valid 31-day range, leap date, malformed/impossible date, reversed and excessive range |

**229 existing automated tests passed**, plus the separately counted differential
checks. The prototype was not installed into the API; database regressions exercise
the retained native implementation. The selected matrix covers UTC, Seoul, Kathmandu, New York, Berlin, Lord
Howe, Chatham, Apia, Kiritimati, Pago Pago and native `+09:00`; eight day windows
cover normal dates, 2030 DST transition dates and Apia's skipped 2011-12-30.
It exercises quarter-hour offsets, UTC/local date boundaries, repeated/skipped
hours, New York's 50/46 candidate counts, seconds/milliseconds/misalignment,
weekdays/weekends, default and partial weekly hours, lunch/standard boundaries,
full/partial UNAVAILABLE and CUSTOM_HOURS overrides. Override arrays are date-scoped
per tested day, matching the actual caller. This is a bounded matrix, not proof
for all instants, zones or future timezone-database releases.

Four additional historical-year probes found a real compatibility difference:
`appointmentDateRange` accepts years 0001/0099/0999, but the existing numeric Intl
year produces unpadded dates such as `1-01-07` and an invalid weekday (`NaN`), while
Luxon returns padded ISO dates and numeric weekdays. Year 1000 matches. This is a
pre-existing helper edge case (B-033), not an introduced regression; current new
booking paths reject past starts. No ancient-date API failure was exercised or
claimed. Preserving or correcting that behavior requires an explicit scoped
choice; this behavior-preserving evaluation does neither.

### Why defer

Luxon makes field access shorter, but does not remove the UTC scan, strict range
parser, continuity/alignment checks, weekend/standard-hour/lunch/override rules or
the shared read/write policy. Zone/invalid-input compatibility still needs care,
and the historical-year probes disprove unrestricted drop-in equivalence. For
this small conversion helper the remaining compatibility and dependency ownership
cost outweighs the demonstrated simplification. No performance benchmark or speed
claim is made. Reconsider with a concrete broader timezone need or an explicitly
scoped normalization change and equivalent read/write regression coverage.

Local disposable evidence is at `/private/tmp/medconnect-fi09-step5.cjs`,
`/private/tmp/medconnect-fi09-step5-result.json` and
`/private/tmp/medconnect-fi09-step5-edges.json`. Run the harness from backend/ after
building: `node /private/tmp/medconnect-fi09-step5.cjs`. The harness compares compiled
current helpers, uses synthetic dates/settings, and never connects to a database.
Only the existing integration runner writes to its own disposable MongoDB instances.
Existing VM-module warnings appeared. No application database, live provider,
frontend/browser/container/production verification or new dependency audit was
performed. No application, credentials/env or flag changes, deployment, staging,
commit, push or merge actions were performed. No sprint covers this date; closed history remains intact.

Plan, FI-09 roadmap, existing architecture and implementation records now carry the
defer decision. README setup/feature information is unchanged. Stop after Step 5;
Step 6 is pending and its service changes must still be delivered individually.

Proposed manual commit: `docs(backend): record timezone library evaluation`.
