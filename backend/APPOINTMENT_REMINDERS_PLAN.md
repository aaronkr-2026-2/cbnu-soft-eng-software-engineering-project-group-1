# Appointment reminders implementation plan — FI-02

Date: November 5, 2026 (Asia/Seoul)

Status: **Planned.** Source review and this plan are complete; implementation has
not started. Timing below is a proposed default, not a previously accepted product
requirement. This plan does not authorize deployment or changes to live data.

## Goal and scope

Help patients remember upcoming confirmed visits through the existing private
in-app notification inbox, with reliable delivery and current appointment details.

| Priority | Behavior |
| --- | --- |
| Must have | Patient-owned reminders, durable delivery, retries and duplicate prevention |
| Must have | Suppression of undelivered notices for canceled, changed or elapsed appointments |
| Must have | Existing inbox, unread count, explicit mark-read and current appointment links |
| Must have | Independent reminder enablement without requiring waitlist enrollment or promotion |
| Nice to have — included | Restart catch-up and aggregate operator monitoring |
| Nice to have — included | Mobile, keyboard and offline/reconnect acceptance |
| Deferred | Email, SMS, browser push, sound, user timing preferences and a new global notification badge |
| Deferred | Calendar integration (FI-04) and rescheduling/change-request workflow (FI-06) |

## Reviewed implementation and reference

Paths below are relative to the named worktree root unless stated otherwise.

- Backend `src` paths in this document are under `backend/`. The current
  `NotificationService` owns inbox/outbox persistence, deterministic event/recipient/
  channel IDs, leases, transactional delivery and retry backoff. Its worker is
  enabled by `WAITLIST_NOTIFICATIONS_ENABLED`; that coupling must be separated.
- `backend/src/schemas/notification.model.ts`, the `Notice` type and GraphQL output
  require `waitlistId`. `AppointmentNotificationService.context` recognizes only
  the waitlist booking notice as an appointment target.
- `backend/src/schemas/appointment.model.ts` stores UTC start/end times, status,
  patient/doctor/clinic IDs and a version. Cancellation changes the version in the
  booking transaction. Existing source values include ONLINE, PHONE, WALK_IN,
  WAITLIST and LEGACY. There is no implemented rescheduling API.
- Next already has `next/components/notifications/`, GraphQL documents, adapters,
  nullable appointment context, explicit mark-read and visible-screen polling at
  15-second intervals. Its notification types/helpers assume a waitlist reference.
- MediBridge reference inspected at
  `/Users/killashaw/projects/medi-bridge/apps/medibridge-batch/src/`:
  `batch.controller.ts` schedules reminders at 19:00 Asia/Seoul;
  `batch.service.ts:batchSendAppointmentReminders` selects tomorrow's CONFIRMED/
  RESCHEDULED appointments and sends Gmail/Nodemailer email. That method has no
  durable retry/deduplication or cancellation recheck. The API notification schema
  is not used by that reminder method. Runtime delivery was not verified.
- Adopt scheduled processing outside request handlers. Retain this project's
  existing outbox instead of adding a separate batch app, Redis or an email SDK.

## Proposed reminder policy

- Two thresholds: 24 hours and 1 hour before `startsAt`, calculated as elapsed UTC
  durations. Display visit times in the clinic's IANA timezone, including DST.
- Only CONFIRMED appointments with an active patient account are eligible. Apply
  across booking sources, including eligible existing/legacy appointments; do not
  infer eligibility from source alone. Missing or invalid references must be
  skipped safely and surfaced through aggregate monitoring.
- Short-notice bookings receive only thresholds still ahead when booked. A visit
  booked three hours ahead receives the one-hour reminder; one booked less than
  one hour ahead receives neither. Use the persisted appointment creation time
  to distinguish short-notice booking from a worker outage. Exact equality counts
  as eligible. A future rescheduling implementation must provide equivalent
  schedule-effective time metadata rather than reusing the original creation time.
- After downtime or initial activation, catch up only the latest eligible crossed
  threshold while the visit is still upcoming. If both thresholds were missed,
  suppress the older one durably so later scans cannot send it. Never deliver a
  reminder after the appointment starts.
- Existing future appointments are included under this same policy, with no
  separate historical backfill command. Unsupported legacy data is reported and
  skipped rather than guessed or silently rewritten.
- Use a stable logical event identity containing appointment ID, appointment
  version and threshold. Repeated scans, retries and concurrent processes must
  produce at most one inbox entry for that identity.
- Recheck status, version, times, recipient eligibility and expiry at delivery.
  Suppression is a terminal result, distinct from a transient delivery failure.
  Never invent a `waitlistId` for an appointment reminder.
- Delivered notices remain historical records with their original read state.
  Their details resolve current appointment status through the existing guarded
  API; a reminder must not assert that a canceled appointment remains confirmed.
- Reminder production is default off behind a validated
  `APPOINTMENT_REMINDERS_ENABLED` flag. Existing waitlist flags keep their meaning.
  Define pause behavior explicitly: reminder delivery and production pause together;
  waitlist delivery continues independently; re-enable uses the same catch-up rules.
- Start with a nonoverlapping, shutdown-aware 30-second producer loop and bounded
  batches/keyset traversal. This is a polling target, not an exact-time guarantee.
  Browser visibility/offline state also affects when a patient sees the notice.

## Worktree ownership and delivery rules

- Backend: branch `backend`, worktree `.worktrees/backend`, application
  `.worktrees/backend/backend/`.
- Next.js: branch `next`, worktree `.worktrees/next`, application
  `.worktrees/next/next/`. Read that worktree's instructions/session context before
  editing it. The legacy `frontend` app is outside this plan.
- Verify branch/status before each step and preserve unrelated changes. Do not
  copy application files between worktrees or edit the outer checkout's copies.
- Implement one agreed step, verify it, report results and stop for the owner's
  manual staging/commit. All commit messages below are provisional.
- Update this plan and the roadmap to reflect actual progress. FI-02 stays
  In progress after partial backend delivery until Next and combined acceptance pass.
- Follow each worktree's implementation logging rules after verified changes.
  Sprint 05 is closed; no Sprint 06 exists. Confirm the next sprint period before
  creating a sprint record; do not put this delivery into closed Sprint 05.

## Implementation steps

### Step 1 — Extend notification contracts and independent enablement

**Place:** backend branch, `.worktrees/backend/backend/`.

**Affected locations:** `src/schemas/notification.model.ts`,
`src/libs/types/notification.types.ts`, `src/libs/dto/notification/notification.ts`,
`src/components/notification/notification.service.ts`,
`src/components/booking/booking.config.ts` and its tests, plus
`src/components/appointment/appointment-notification.service.ts`.

- Add an APPOINTMENT_REMINDER type and typed reminder metadata; distinguish notice
  variants instead of making every reference universally optional. Require
  appointment identity/version/threshold for reminders and waitlistId for waitlist
  notices. Make the public waitlistId nullable and review every consumer.
- Preserve deterministic IDs, response allowlists, pagination and read state.
  Resolve reminder context through `AppointmentService.getAppointment` using the
  authenticated patient, preserving the module dependency direction.
- Separate shared delivery availability from per-type flags. Validate reminder
  prerequisites explicitly; retain current booking migration requirements and
  no-database behavior. Keep reminder production absent at this step.
- Ensure claim queries respect enabled notice types so a paused type cannot block
  the other type's queue. Generalize waitlist-only worker messages where needed.

**Acceptance:** existing waitlist/API tests pass; malformed variant references are
rejected; reminder context ownership is enforced; existing notices retain read
state; flag combinations/no-database startup are covered.

**Commit:** `refactor(backend): support appointment reminder notifications`

### Step 2 — Add stale-reminder suppression at delivery

**Place:** backend branch, `.worktrees/backend/backend/`.

**Affected locations:** `src/components/notification/notification.service.ts`,
`src/schemas/notification.model.ts`, `src/components/notification/notification.module.ts`,
new `src/components/appointment/appointment-reminder.service.ts`,
`src/components/appointment/appointment.module.ts`, and appointment schema/transition
code only where required for concurrency coordination.

- Keep reminder eligibility in the appointment feature and shared delivery in
  NotificationService. Expose a narrow delivery operation/policy interface without
  introducing a NotificationModule-to-AppointmentModule circular dependency.
  A reminder worker may claim its own notice type through that interface.
- Add a terminal SUPPRESSED outbox state with allowlisted reason codes and
  aggregate counts. Preserve waitlist retry and claim semantics.
- Perform delivery-time eligibility checks and inbox insertion atomically with
  durable disposition of the claimed intent. A snapshot read alone is insufficient
  to serialize cancellation against delivery: coordinate through a conditional
  write to the appointment document or the existing booking coordination protocol.
  Select the smallest mechanism supported by the current code and test its race.
  Do not change booking versions merely because a reminder was delivered.
- Define ordering: cancellation committed first prevents delivery; delivery
  committed first may leave a historical notice whose context shows cancellation.
- Retry transient failures with backoff; recover expired leases; suppress permanent
  ineligibility without retrying it forever. Never log private payloads.

**Acceptance:** seed reminder intents directly in disposable tests; prove cancellation
and delivery races, changed versions, deleted/inactive recipients, expiry during
retry, two workers, stale claims and crash/replay. Exactly one inbox entry survives,
or a terminal suppression; existing waitlist delivery remains unchanged.

**Commit:** `feat(backend): safely deliver or suppress appointment reminders`

### Step 3 — Generate due reminders with bounded catch-up

**Place:** backend branch, `.worktrees/backend/backend/`.

**Affected locations:** `src/components/appointment/appointment-reminder.service.ts`,
`src/components/appointment/appointment.module.ts`, `src/schemas/appointment.model.ts`
if measured query needs warrant an index, and the existing booking migration/startup
verification tools if index changes require them.

- Add the producer loop, bounded due scans, stable traversal, shutdown handling and
  deterministic transactional intent emission through NotificationService.
- Reuse persisted appointments across online/staff/promotion paths rather than
  maintaining separate booking hooks. Persist older-threshold suppression together
  with catch-up generation so races cannot emit both missed reminders.
- Bound each scan/transaction and yield between batches. Inspect query plans with
  representative disposable data; handle overdue existing intents without starving
  newly due appointments. Add a reviewed managed index only if justified.
- Preserve booking/waitlist transactional rules and startup migration checks. Never
  apply indexes or data migrations to an application database as part of testing.

**Acceptance:** test exact 24h/1h/start boundaries, short-notice bookings, all booking
sources, activation with existing appointments, unsupported legacy rows, pause/
resume, UTC/DST, multiple batches, two producers and restart catch-up. Repeated
generation must neither duplicate notices nor reset read state.

**Commit:** `feat(backend): generate upcoming appointment reminders`

### Step 4 — Integrate reminders in the Next.js inbox

**Place:** next branch, `.worktrees/next/next/`.

**Affected locations:** `types/notification.ts`, `apollo/user/notification.ts`,
`libs/api/notification.ts`, `libs/notification.ts`,
`libs/hooks/useNotifications.ts` only if needed,
`components/notifications/NotificationsPage.tsx`,
`components/notifications/NotificationDetail.tsx`, and `tests/notification.test.cjs`.

- Support nullable waitlist references, reminder titles and appropriate messages.
  Render original scheduled time in clinic timezone and current appointment state.
- Link reminders to the owned appointment; omit waitlist actions when absent.
  Keep explicit mark-read, existing unread filtering and pagination behavior.
- Reuse polling and authentication/session transport. Preserve stale-response
  cancellation, offline/reconnect behavior and error/retry feedback.

**Acceptance:** mixed notice types, absent waitlistId, current canceled/unavailable
appointment, unread count/read replay, account changes, error recovery and safe
links pass tests; typecheck and production build pass. Keyboard/mobile rendering
must also pass the combined acceptance step.

**Commit:** `feat(next): display appointment reminders in the patient inbox`

### Step 5 — Verify the combined flow and recovery behavior

**Place:** backend tests in `.worktrees/backend/backend/test/` and focused unit
tests beside reminder code; Next tests in `.worktrees/next/next/tests/`.
Use the existing disposable replica-set runner in
`backend/test/run-booking-integration.cjs`; add a focused test configuration if needed.

- Run the real Next adapter to normal Nest process to disposable MongoDB flow.
  Use deterministic clock-controlled tests for timing; never wait 24 real hours or
  alter a production clock. Include an actual worker-loop smoke check.
- Cover booking to reminder to inbox to current appointment to mark-read, alongside
  cancellation, lease recovery, process restart and flag pause/resume scenarios.
- Run appropriate backend build/TypeScript/lint, unit/API/booking regression checks,
  real MongoDB reminder checks and Next tests/typecheck/build. Record actual
  results and pre-existing failures separately; do not carry forward old counts.
- Check desktop and narrow mobile screens, keyboard dialog operation, loading,
  unread filters, timezone labels, offline recovery and canceled appointment details.
- Stop owned test processes and remove disposable data after verification.

**Acceptance:** agreed timing and stale-delivery cases pass through real persistence;
browser shows a correctly linked owned reminder; no secrets/private account fields
leak; waitlist and booking regression checks pass. Record any runtime limits.

**Commits:** `test(backend): verify reminder timing and worker recovery` and, only
if Next test changes are needed, `test(next): verify appointment reminder behavior`.
Any discovered implementation fixes belong in the owning worktree and are verified
before this step is marked complete.

### Step 6 — Document activation and close FI-02

**Place:** backend branch `backend/APPOINTMENT_REMINDERS_PLAN.md`,
`backend/FUTURE_IMPROVEMENTS.md`, existing
`docs/architecture/architecture-backend.md` and an appropriately linked operational
document; Next branch `docs/architecture/architecture-next.md` when affected.
Update each root README only if feature/configuration/setup summaries need changes.

- Document producer/delivery ownership, flag prerequisites, required managed
  indexes, suppression/retry behavior, aggregate monitoring and pause/re-enable.
- Explain in-app visibility and the absence of closed-browser/email delivery.
  Document future rescheduling requirements without implementing FI-06.
- Complete required implementation records, with actual verification evidence.
  Mark FI-02 Completed only after backend, Next and combined acceptance are done;
  record deployment limits and actual Asia/Seoul completion date.
- Configuration activation, application-data migration, merging and deployment
  remain separate actions requiring their applicable authorization.

**Acceptance:** links/configuration match implemented behavior; no unsupported
delivery claims or stale plan statuses; no closed sprint history is repurposed.

**Commit:** `docs(backend): document appointment reminder operation and completion`
with a separate `docs(next)` commit if Next documentation changes are needed.

## Current verification and next action

This is a planning-only change. Backend, Next and MediBridge source were inspected;
no application tests, migrations, dependency installations or runtime activation
were performed. Next action is Step 1 after the owner agrees to the reminder policy
and implementation sequence. No implementation step is complete.
