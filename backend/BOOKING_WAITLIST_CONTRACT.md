# Booking and waitlist contracts

Decision date: October 25, 2026 (Asia/Seoul). Step 1 is documentation only.
This is the target contract for subsequent implementation steps, not a list of
available APIs. The four queue/time defaults in section 1 were confirmed by the
user. Other details below are implementation decisions drawn from the plan.
Commits and pushes are performed manually by the user; report completion and a
suggested commit message at the end of each step.

## Current implementation and compatibility

`src/components/appointment/appointment.service.ts` currently creates PENDING
appointments. `BookAppointmentInput` accepts only `doctorId`, `clinicId`, and
`startsAt`. GraphQL `bookAppointment` and REST `POST /appointment/bookAppointment`
share that service. `getAppointment` and `GET /appointment/:id` restrict reads to
the matching patient, doctor, or clinic. No waitlist or lifecycle write API exists.

Existing alignment, working-hours/override checks, active/approved doctor checks,
authentication, and the unique active doctor-slot index remain required. Enum
values and embedded doctor-change-request fields are not working lifecycle APIs.
The GraphQL error formatter currently retains only a generic code; structured
conflicts below require an explicit allowlisted formatter change in Step 3.

Existing routes and operation names remain. At activation of the new booking
policy, `specialty` becomes required for new writes and successful bookings become
CONFIRMED. This is an intentional input/behavior change requiring coordinated
client rollout. Never silently infer a new request's specialty, even for a doctor
with one specialty. Old requests missing it receive validation errors. Before
activation, deployed legacy behavior remains as documented in the root README.

## 1. Scheduling and eligibility policy

- Each visit lasts exactly 30 elapsed minutes, on clinic-local :00/:30 boundaries.
  Inputs include an explicit offset or Z; persist UTC instants and render using
  the clinic's IANA timezone. Generate candidates from weekly hours and date
  overrides; do not add a fixed list of times or documents for empty slots.
- Each commitment records one `specialty` from `DoctorSpecialization`, validated
  against the selected doctor's `doctorSpecializations` and approved affiliation
  with the selected active clinic. A doctor's later specialty edit does not
  rewrite the specialty recorded on an existing commitment.
- A commitment is a PENDING legacy or CONFIRMED appointment, or an ACTIVE or
  NOTIFICATION_ONLY waitlist entry. Ended appointments and terminal waitlist
  entries do not count. Active commitments count until their explicit transition
  closes them; stale past records require reconciliation, not silent exclusion.
- For one patient, the same clinic and recorded specialty cannot have two active
  commitments whose absolute start-time difference is less than 24 elapsed hours,
  across all doctors. Exactly 24 hours is allowed. Different clinics/specialties
  are outside this restriction.
- Additionally, active appointments for one patient cannot overlap anywhere:
  `existing.startsAt < requested.endsAt && existing.endsAt > requested.startsAt`.
  Adjacent visits are allowed. Apply this to manual/staff booking and promotion.
  Waitlists do not reserve the patient's time across unrelated clinics/specialties;
  promotion rechecks appointment overlap and can find an entry ineligible.
- A waitlist targets one exact doctor, clinic, specialty, and UTC start/end slot.
  It is not an interchangeable specialty-wide queue. The doctor-slot allocation
  gate covers all specialties offered by that doctor at that time.
- Enrollment requires an occupied, otherwise valid slot, at least 48 elapsed
  hours away, and explicit automatic-booking consent. Exactly 48 hours is allowed.
  A free slot offers booking; closures/breaks offer neither booking nor waitlisting.
- At allocation time, remaining time >= 48 hours permits automatic CONFIRMED
  booking for the first eligible waiting patient. Inside 48 hours, never promote:
  notify all current active recipients that manual booking is open and unreserved.
  Existing entries become NOTIFICATION_ONLY and still count as commitments.
- An ordinary create never cancels another commitment. Replacement needs an
  explicit patient choice and one atomic server operation.
- Withdrawal ends queue membership. Cancelling a promoted booking never restores
  queue membership or old priority. Staff booking initially requires an existing
  active USER account; guest identity/consent handling is deferred.

## 2. States, transitions, and access

All protected operations validate the current account and authenticated role.
Patient identity comes from authentication for self-service. CLINIC operations
derive clinic scope from authentication, not a trusted client-supplied clinic ID.
No implicit ADMIN override or generic status-edit API is introduced.

| Operation | USER | CLINIC | DOCTOR |
| --- | --- | --- | --- |
| Create booking | Self only | Existing patient, own clinic only; same rules | No |
| Read appointment | Own patient record | Own clinic record | Own doctor record |
| Cancel future booking | Own booking | Own clinic booking | No direct cancellation |
| Complete / mark no-show | No | Own clinic, after visit end | No |
| Join / withdraw / replace commitments | Self only | No patient queue changes | No |
| Read waitlist | Own entries | Own clinic entries for operations | Own slot queue summary, without patient contact data |
| Manage schedule / affiliation | No | Own clinic | No in initial scope |

Public slot responses expose times, doctor/clinic, AVAILABLE/OCCUPIED/UNAVAILABLE,
and `canJoinWaitlist`; never patient IDs, queue membership, or contact information.
Queue positions are visible only to their owner. Doctor queue summaries contain
counts, not other patients' identity. Private reads are bounded, scoped, and
`no-store`; absent and foreign record IDs both return NOT_FOUND.

| Entity | Allowed transitions |
| --- | --- |
| New appointment | Created directly CONFIRMED by patient, clinic, or promotion |
| CONFIRMED appointment | CANCELED before start; COMPLETED or NO_SHOW at/after end, by own clinic |
| Legacy PENDING appointment | Explicit migration resolution to CONFIRMED or CANCELED; no automatic confirmation |
| ACTIVE waitlist | NOTIFICATION_ONLY inside cutoff; FULFILLED on promotion or own manual booking; WITHDRAWN; EXPIRED; INELIGIBLE |
| NOTIFICATION_ONLY waitlist | FULFILLED on own manual booking; WITHDRAWN; EXPIRED; INELIGIBLE; never automatic booking |
| Terminal states | No reopening; repeat identical cancellation/withdrawal returns current terminal result |

EXPIRED means slot start reached or another patient took the released slot.
INELIGIBLE means established permanent failure of account, affiliation, specialty,
schedule, consent, or commitment checks, with a safe reason stored. Infrastructure
failure is retryable and must not lose queue position. A slot taken again closes
remaining entries; a later distinct opening notifies only entries still active at
that event. Cancellation after start and unsupported status transitions conflict.
Schedule/affiliation changes must explicitly reconcile affected commitments and
events; they must not silently move/delete bookings. Doctor change requests remain
outside these APIs until a separately implemented approval flow exists.

## 3. Target API and persistence contracts

GraphQL is the primary transport for new operations. Existing REST booking/read
routes remain and use the same services and rules; no new REST routes are promised
by this step. Mutation names below are reserved target names, not present schema.

| Target operation | Input and result |
| --- | --- |
| `bookAppointment(input)` | Existing IDs/start plus required `specialty`; returns Appointment with recorded specialty and CONFIRMED status |
| `getAppointment(id)` | Existing participant-scoped read; specialty nullable only for unresolved legacy history |
| `getAvailableSlots(input)` | Doctor/clinic/specialty and bounded date range; returns structured UTC slots, clinic timezone, public state and enrollment eligibility |
| `joinWaitlist(input)` | Doctor/clinic/specialty/start and `automaticBookingConsent: true`; returns own WaitlistEntry |
| `leaveWaitlist(id)` | Own entry; returns terminal/current entry |
| `myWaitlist(input)` | Cursor/limit and optional state filter; returns own entries and next cursor |
| `replaceCommitment(input)` | Expected original kind/ID/version and destination kind plus booking/enrollment input; returns resulting commitment |
| `cancelAppointment(id)` | Own patient or own-clinic booking; returns canceled/current appointment |
| `createClinicAppointment(input)` | Existing patient ID, doctor/specialty/start, PHONE or WALK_IN source; clinic derived from caller |

Appointment additions: `specialty`, `version` (opaque concurrency token),
`source` (ONLINE, PHONE, WALK_IN, WAITLIST, LEGACY), and optional `waitlistEntryId`.
Retain existing `_id`, participant/time/status fields and ownership restrictions.
Patient input cannot set status, source, duration, end, queue order, or patient ID.
Staff input cannot set arbitrary status/end/duration or book another clinic.

WaitlistEntry fields: `_id`, `patientId`, `doctorId`, `clinicId`, `specialty`,
`startsAt`, `endsAt`, `status`, `automaticBookingConsent`, `consentedAt`,
`consentPolicyVersion`, `queueSequence`, `version`, timestamps, optional
`appointmentId` and safe `closedReason`. Server timestamps/sequence only. Allocate
a strictly increasing sequence transactionally per doctor-slot queue; FIFO is
ascending sequence across specialties for that same physical slot. Aborted joins
may leave gaps but cannot reorder successful entries. Duplicate active membership
for one patient and target is rejected. Rejoining/replacing receives a new position.

Repeated delivery of one slot event/promotion uses a stable event ID and slot
generation, and can create at most one appointment for that entry. Withdrawal vs
promotion must produce one coherent result; once fulfilled, withdrawal cannot
silently cancel the resulting appointment. Clients with an ambiguous mutation
outcome refetch current commitments before retrying or requesting replacement.

### Conflicts and explicit replacements

| Existing commitment | Requested commitment | Ordinary create | Explicit replacement |
| --- | --- | --- | --- |
| Booking | Booking | Keep original; return conflict | Cancel original and create booking atomically |
| Booking | Waitlist | Keep original; return conflict | Cancel original and join queue atomically; UI explains loss of guaranteed visit |
| Waitlist | Booking | Keep original; return conflict | Withdraw entry and book atomically |
| Waitlist | Waitlist | Keep original; return conflict | Withdraw entry and join new queue atomically |

Apply the table when the 24-hour rule or appointment overlap is violated. No
conflict means a valid ordinary create can proceed. Manual booking of one's own
target waitlist slot must fulfill that entry atomically with booking and exclude
only that entry from self-conflict checks. It never bypasses an earlier eligible
queue member while automatic allocation is pending.

Replacement validates ownership, expected version, and destination eligibility
inside one transaction. Exclude only the expected original from conflict checks;
any other conflicting commitment still blocks the destination. A stale original
or failed target leaves the original intact, emits no slot-release event, and
creates no new entry. Success closes the original, creates the destination, and
persists release/notification events together. Same-kind, same-target replacement
is rejected as a conflict; it cannot refresh queue priority or cancel/rebook
oneself. Waitlist-to-booking for one's own target follows fulfillment above.

### Safe errors

| REST status / GraphQL code | Target reason codes |
| --- | --- |
| 400 / BAD_USER_INPUT | INVALID_INPUT, INVALID_SPECIALTY, INVALID_SLOT, INVALID_CLINIC_DOCTOR |
| 401 / UNAUTHENTICATED | INVALID_SESSION |
| 403 / FORBIDDEN | ROLE_NOT_ALLOWED, ACCOUNT_INACTIVE |
| 404 / NOT_FOUND | NOT_FOUND (also foreign record IDs) |
| 409 / CONFLICT | COMMITMENT_CONFLICT, PATIENT_OVERLAP, SLOT_OCCUPIED, SLOT_UNAVAILABLE, WAITLIST_CLOSED, DUPLICATE_ENTRY, STALE_COMMITMENT, INVALID_TRANSITION |
| 503 / SERVICE_UNAVAILABLE | FEATURE_DISABLED, MIGRATION_REQUIRED, BOOKING_UNAVAILABLE, RETRY_LATER |

These reason codes are future domain details, not replacements for existing
GraphQL `extensions.code`. An inactive session may already fail authentication
with 401; never weaken existing guard enforcement to produce a different code.
Expected conflicts use REST error body fields or GraphQL `extensions.booking`:
`{ reason, existingCommitments, choices }`. Allowlist own commitment summaries:
`kind`, `id`, `version`, `doctorId`, `clinicId`, `specialty`, `startsAt`, `endsAt`,
`status`. `choices` is KEEP and, only where supported, REPLACE. Include all own
blocking commitments so one replacement is not falsely promised to resolve many.
No other patient's IDs, contact data, queue entries, database errors, or tokens.
Unauthenticated/foreign-record and infrastructure errors contain no summaries.
Do not forward arbitrary exception response fields through the GraphQL formatter.

## 4. Legacy data and activation

1. Before migration, back up and dry-run an inventory of PENDING/CONFIRMED and
   terminal records, missing/invalid specialty, doctor affiliation/time anomalies,
   slot duplicates, 24-hour conflicts, and patient overlaps. No production data is
   read or changed by Step 1. Keep reports access-controlled and out of Git/logs.
2. Infer specialty only from reliable evidence establishing exactly one offered
   specialty for that visit. Today's single-specialty doctor record alone is not
   historical proof. Record provenance; ambiguous records require explicit
   resolution, never a fabricated default or expansion to all doctor specialties.
3. Preserve all existing statuses initially. Resolve future/active PENDING records
   explicitly with the responsible clinic/patient before activation. Never
   silently confirm historical requests. Unresolved past history stays readable
   with nullable specialty and original status; reconcile stale active records.
4. Until resolved, PENDING still reserves its doctor's slot. Do not drop it from
   the existing partial unique index. Active unresolved specialty/status/conflicts
   block activation of the new write policy; they cannot bypass the 24-hour rule.
   Do not cancel, merge, or move existing conflicting visits automatically.
5. Backfill known specialties, LEGACY source and version tokens idempotently with
   an audit/dry-run report. Validate required indexes and coordination records on
   a disposable replica set before production activation. Non-active historical
   nullable specialty must remain supported in reads after activation.
6. Deploy compatible reads first; pause booking writes during final migration and
   client/policy cutover. Require specialty on all new writes after activation in
   both transports, with no fallback route creating legacy PENDING appointments.
   Refuse new-policy writes if migration/index/transaction prerequisites fail.
7. Rehearse recovery from backup in staging. Pausing a feature preserves existing
   appointments, entries and outbox events. Once new writes exist, do not roll back
   to an older binary that ignores commitments/queues or the new conflict policy.

## 5. Rollout gates and delivery boundaries

Target server configuration below is not implemented or usable yet. Default all
gates to false; reject invalid dependency combinations at startup on APIs/workers.
Flags are operator-controlled, never request fields or browser authorization.

| Target flag | Prerequisites and effect |
| --- | --- |
| BOOKING_POLICY_V2_ENABLED | Steps 1–3, replica-set concurrency/index/migration checks, compatible clients; enables new confirmed specialty-aware writes |
| WAITLIST_ENROLLMENT_ENABLED | Booking policy plus Steps 4–6 and patient UI; permits enrollment with automation accurately labeled as disabled during pilot |
| COMMITMENT_REPLACEMENT_ENABLED | Enrollment and atomic replacement/rollback verification; exposes explicit REPLACE choice |
| WAITLIST_NOTIFICATIONS_ENABLED | Durable events plus verified patient-visible notification delivery and manual-opening UI |
| WAITLIST_PROMOTION_ENABLED | All prior gates, Steps 7–8/11 and real-database concurrency/recovery checks; permits automatic booking |

Before enabling promotion, obtain automatic-booking consent under the active
policy from pilot members; never silently convert a notification-only pilot into
automatic booking. Normal 48-hour NOTIFICATION_ONLY entries never revert to ACTIVE.
Disabling enrollment still permits reads/withdrawal/cancellation. Disabling
promotion pauses worker allocations at the transaction gate and preserves events
for recovery. When policy V2 is paused after activation, stop new booking writes
rather than reverting to old rules. Keep durable slot-release handling running;
manual requests cannot jump unresolved queues while promotion is paused. Operators
must resolve or deliberately transition pending openings before public allocation.
Use consistent flag versions across API/worker processes; pause/reconcile work
before switching a gate, rather than allowing an old worker to allocate unnoticed.

Initial implementation order: concurrency foundations (Step 2), booking (3),
schedules (4), cancellation/staff/outbox (5), enrollment/replacement (6), FIFO
worker (7), cutoff/delivery integration (8), patient UI (9), clinic calendar (10),
notification UI/delivery verification (11), integration/migration/rollout (12).
Dependencies can keep a completed backend step disabled until its UI/channel is
ready. Steps are reviewed individually; do not implement the next step silently.

## 6. Acceptance examples for later tests

| Scenario | Required result |
| --- | --- |
| Same patient/clinic/specialty, different doctors, starts 23h59m apart | Conflict for all four booking/waitlist combinations |
| Same scope, starts exactly 24h apart | Allowed if all other checks pass |
| Different clinic or specialty, overlapping active appointments | PATIENT_OVERLAP |
| Different clinic or specialty, adjacent non-overlapping appointments | Allowed |
| Join or allocate exactly 48h before start | Enrollment / eligible FIFO promotion allowed |
| Join one millisecond inside 48h | WAITLIST_CLOSED |
| Cancellation or delayed worker inside 48h | No promotion; durably notify all current active recipients for that event |
| Weekly 09:00–12:00 and 13:00–17:00 | 14 candidates; no lunch/partial slot; occupied state supports queue selection |
| Replace to unavailable target; stale original version; transaction failure | Original preserved, no orphan release/notification event |
| Duplicate workers/events, concurrent manual booking, withdrawal vs promotion | At most one slot winner; FIFO and coherent entry/appointment state |
| Infrastructure error on earliest queue entry | Retry without skipping its priority |
| Own clinic staff vs foreign clinic/doctor/patient mutation | Enforce operation matrix and scoped reads |
| Missing specialty client or unresolved active legacy record at activation | Reject write / block activation; never infer silently |
| Promotion delivery channel unverified or gate dependency missing | Automatic booking remains disabled |

Step 1 verification is source comparison, contract coverage, local links, and
whitespace checks. These examples are test requirements, not passed runtime tests.
