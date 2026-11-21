# Package adoption and modular refactoring plan — FI-09

Date: November 21, 2026 (Asia/Seoul)

Status: **Planned.** The roadmap entry and implementation plan are prepared.
No refactoring, dependency installation, baseline test run or deployment has been
performed for this item. All implementation checkboxes below remain pending.

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

- [ ] Confirm branch/worktree state and preserve unrelated changes.
- [ ] Inventory logging, worker timers, environment reads and timezone helpers.
- [ ] Recheck the identified large functions and their actual callers.
- [ ] Run relevant existing backend and frontend checks; distinguish pre-existing
  failures and unavailable runtime checks from regressions.
- [ ] Record baseline results and a compatible dependency shortlist in this plan.

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
