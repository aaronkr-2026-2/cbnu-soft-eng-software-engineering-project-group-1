# Package adoption and modular refactoring plan — FI-09

Date: November 21, 2026 (Asia/Seoul)

Status: **In progress — Step 1 complete locally November 21, 2026.** The verified
baseline and dependency shortlist are recorded below. Steps 2–8 remain pending.
No application source, installed dependencies, lockfiles or deployment changed.

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

- [ ] Evaluate Pino with a compatible Nest adapter such as `nestjs-pino`.
- [ ] Replace `backend/src/libs/logger/file-logger.service.ts` output/formatting
  plumbing and adjust logger wiring.
- [ ] Preserve useful context, levels, error visibility and current redaction.
- [ ] Select stdout collection or configured file output based on verified hosting
  requirements; do not silently remove required persistence.
- [ ] Remove redundant logging code only after callers are migrated.

Acceptance: successful and failing HTTP/GraphQL requests produce useful logs
without duplicate request entries, tokens, passwords, GraphQL arguments/response
data or patient information. Verify behavior when the selected output is unavailable.
Retain GraphQL execution timing if HTTP logging does not cover it.

Proposed commit: `refactor(backend): standardize application logging`.

### Step 3 — Standardize worker scheduling

- [ ] Introduce compatible `@nestjs/schedule` integration.
- [ ] Migrate notification delivery, waitlist lifecycle, promotion and password
  recovery delivery individually, with focused verification after each migration.
- [ ] Remove repeated timer setup/cleanup only where the scheduler replaces it.
- [ ] Preserve non-overlapping runs, feature gates, polling cadence, database
  claims/leases, retry/backoff behavior and graceful shutdown.

Acceptance: slow runs do not overlap within a process; competing workers retain
database coordination; restart recovery and disabled-worker behavior remain correct.
Shutdown waits appropriately for active work. Package scheduling does not replace
MongoDB event ownership, fencing or transactional business operations.

Proposed commit: `refactor(backend): consolidate background worker scheduling`.

### Step 4 — Centralize validated configuration

- [ ] Introduce compatible `@nestjs/config` with typed configuration and startup
  validation, using existing validators where appropriate.
- [ ] Migrate database, authentication, email and worker settings in small groups.
- [ ] Preserve environment precedence, defaults, default-off gates and readiness
  checks. Inspect module evaluation order before replacing environment reads.
- [ ] Remove obsolete helpers after confirming all consumers have migrated.

Acceptance: valid development/production configurations resolve as before; invalid
required values fail clearly without secrets in errors. Disabled optional features
do not unexpectedly require credentials. Tests can supply isolated configuration.

Proposed commit: `refactor(backend): centralize validated configuration`.

### Step 5 — Evaluate timezone simplification

- [ ] Prototype Luxon against a limited existing helper, without changing policy.
- [ ] Compare results and readability against `appointment-slot.ts` and its callers.
- [ ] Cover UTC date boundaries, clinic-local dates, DST gaps/repeated hours,
  half-hour alignment, weekdays, lunch breaks and date overrides.
- [ ] Adopt only if equivalent behavior and clearer maintenance are demonstrated;
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

Step 1 acceptance is complete locally. Stop here; Step 2 is the next agreed
implementation boundary. Proposed manual commit: `docs(backend): record refactoring baseline`.
