# Account deletion implementation plan

Date — November 14, 2026 (Asia/Seoul)

Status — Step 1 completed November 14, 2026. Commitment rules and API contracts
are recorded below. Steps 2–6 implementation and runtime verification are pending.

Related feedback — [Issue #10, item 6](https://github.com/aaronkr-2026-2/cbnu-soft-eng-software-engineering-project-group-1/issues/10).

## Intended outcome

A signed-in USER, DOCTOR, or CLINIC can close their own account from My Page.
A dialog shows appointments and waitlist entries requiring resolution and offers
permitted cancellation actions. Account deletion becomes available after those
commitments are resolved and the member explicitly agrees to permanent loss of
account access. The backend enforces the same conditions on submission.

Deletion changes the member status to DELETED and retains stored data. Members
cannot restore their account. Permanent removal of stored account data belongs
to an admin operation whose implementation is deferred until reference and
retention handling are specified.

## Agreed requirements

- Reuse the existing GraphQL updateMember mutation for self-deletion.
- Resolve account identity from the authenticated session.
- Support USER, DOCTOR, and CLINIC accounts through their existing permissions.
- Show blocking appointments and waitlists in a My Page dialog.
- Provide Cancel booking and Cancel waitlist actions where the role allows them.
- Require cancellation of blocking commitments before allowing deletion.
- Require explicit agreement to the irreversible loss of account access.
- Soft-delete the account and retain its stored records.
- Reserve physical deletion for admins.

## Current source baseline

Paths below are relative to the corresponding worktree root.

| Area | Existing implementation |
| --- | --- |
| Account statuses | backend/src/libs/enum/member.enum.ts defines ACTIVE, SUSPENDED, and DELETED |
| Member storage | backend/src/schemas/member.model.ts includes deletedAt and authVersion |
| Profile update | backend/src/components/member/member.resolver.ts exposes guarded updateMember |
| Update input | backend/src/libs/dto/member/member-update.input.ts currently excludes memberStatus |
| Account service | backend/src/components/member/member.service.ts owns profile and session writes |
| Authentication | MemberAccessGuard checks the token against the current account through MemberService |
| Booking coordination | backend/src/components/booking/booking-coordination.service.ts provides transaction gates for patients, doctors, and slots |
| Appointment operations | backend/src/components/appointment/appointment.resolver.ts exposes patient reads and cancellation |
| Next.js profile | next/components/mypage/MyPage.tsx and next/apollo/user/profile.ts own the current profile flow |

The existing login, Google login, refresh, access-token checks, and public
queries already reject or exclude inactive/deleted members. Verify every affected
path again during implementation, including legacy booking entry points and workers.

Keep the stored status SUSPENDED for blocked accounts. Renaming it to BLOCKED
would require a separately agreed compatibility and data migration change.

## Step 1 — Finalize commitment and API contracts

- Trace patient, doctor, and clinic appointment/waitlist reads and cancellation
  permissions, including pagination, legacy records, allocation workers, and
  clinic affiliations.
- Define the exact statuses and time boundaries that block deletion. Candidate
  appointment blockers are PENDING and CONFIRMED visits that have not ended.
  Candidate waitlist blockers include ACTIVE and NOTIFICATION_ONLY entries for
  live slots. Confirm handling of in-progress visits and stale past records.
- Terminal history remains stored and does not require cancellation.
- Define doctor/clinic blockers using their actual relationship to commitments.
  A clinic's affected appointments and a doctor's assigned appointments must be
  considered, even though those accounts are not the patient.
- Decide how active doctor affiliations are resolved before clinic closure.
  Record this decision before implementing clinic deletion.
- Specify a complete account-scoped readiness read. Reuse existing authorized
  reads where they provide the complete result. If necessary, add a focused
  read query for paginated blockers, aggregate counts, permitted actions, and
  readiness. An empty visible page alone must never establish eligibility.
- Extend MemberUpdateInput to allow memberStatus only with the value DELETED
  for self-service. Reject ACTIVE, SUSPENDED, invalid values, and ADMIN callers.
- Treat deletion as a dedicated branch of updateMember. Reject requests mixing
  deletion with unrelated profile/password updates to avoid partial outcomes.
- Define structured conflict codes and safe response fields that the dialog can
  use to refresh blockers. GraphQL errors may arrive with HTTP 200.
- Preserve existing profile-update callers and response fields. Return a safe
  deletion result with requiresLogin, adapting the existing result type if needed
  without exposing private account fields or issuing new credentials.

Completion evidence — recorded role/status matrix, blocker rules, input/output
contract, complete-read strategy, and clinic-affiliation policy.

## Step 1 contract decisions — November 14, 2026

This section defines the target contract for Steps 2–5. Source inspection completed
on backend `79b118f` and Next `6cefd3c`. The APIs described as new below still
require implementation. The owner selected automatic affiliation detachment during
clinic deletion. Remaining policy details are engineering defaults chosen in Step 1.

### Role and ownership matrix

Every scope comes from the authenticated member ID. Account IDs supplied by the
client cannot change the scope. Stored appointment/waitlist relationships determine
ownership even when a doctor's current affiliation has changed.

| Account | Appointment and waitlist scope | Cancel booking | Cancel waitlist | Self-delete |
| --- | --- | --- | --- | --- |
| USER | patientId equals own ID | Own future CONFIRMED visit | Own active entry through leaveWaitlist | Yes, when ready |
| DOCTOR | doctorId equals own ID across all clinics | Ask patient or owning clinic | Ask patient | Yes, when ready |
| CLINIC | clinicId equals own ID across all doctors | Clinic's future CONFIRMED visit | Ask patient | Yes, when ready |
| ADMIN | No self-service deletion scope | Existing permissions apply | Existing permissions apply | Forbidden |
| Unauthenticated, SUSPENDED, DELETED | Authentication rejects protected reads and mutations | Unavailable | Unavailable | Unavailable |

The doctor-change-request subdocument alone provides no cancellation operation.
No live doctor change-request resolver was found. The dialog must explain who can
resolve a blocker without promising a new workflow.

### Status and time rules

Use a single server UTC `asOf` per readiness snapshot and a fresh server time in
the deletion transaction. Display times using the recorded clinic's IANA timezone.
Eligibility comparisons use stored instants and never depend on browser time.

| Record | Blocking condition | Resolution |
| --- | --- | --- |
| PENDING appointment | endsAt > asOf, including an in-progress visit | Migration/operator resolution or elapsed end time. Current cancellation rejects PENDING |
| CONFIRMED appointment | endsAt > asOf, including an in-progress visit | Before startsAt, patient or clinic may cancel. At/after startsAt, wait until endsAt |
| CANCELED, COMPLETED, NO_SHOW appointment | Never blocks | Retain history |
| ACTIVE, NOTIFICATION_ONLY waitlist | startsAt > asOf and queueSequence exceeds the slot cleanup sequenceMax | Patient may withdraw. Doctor/clinic asks patient or waits for closure/expiry |
| FULFILLED, WITHDRAWN, EXPIRED, INELIGIBLE waitlist | Never blocks | Retain history |
| Waitlist covered by committed slot cleanup | Never blocks, even before the row's asynchronous status update | Existing cleanup worker completes materialization |
| Past appointment or started waitlist with otherwise active status | Never blocks at endsAt <= asOf or startsAt <= asOf respectively | Retain stored record. Normal lifecycle handling remains responsible for cleanup |

Exactly at appointment startsAt cancellation is unavailable and the visit still
blocks until endsAt. Exactly at endsAt the visit stops blocking. Waitlists stop
blocking exactly at startsAt. The 48-hour cutoff converts automatic booking to
notification-only and does not remove a live waitlist blocker. Pending allocation
for a live entry continues to block. A pending doctor change request follows the
underlying appointment and adds no independent blocker.

Read appointments and waitlists directly, including LEGACY/PENDING records and
records absent from booking_commitments. The ledger alone cannot establish
readiness. Nonterminal or unknown-status rows with invalid/missing dates, unknown status,
or unusable cleanup ordering produce ACCOUNT_DELETION_DATA_UNRESOLVED. Do not infer a terminal
state from malformed data. A missing cleanup row means sequenceMax zero. A failed
cleanup read makes readiness unavailable. Missing display names/timezones use
explicit unavailable labels and UTC fallback without hiding valid blockers.

### Clinic and doctor affiliation policy

After all appointment and waitlist blockers are resolved, clinic deletion atomically
marks linked PENDING and APPROVED doctor affiliations REMOVED in the same
transaction as account/session deletion. Include active and suspended doctors,
preserve clinicId for reference/history, and retain doctor accounts and stored
profile data. Already REJECTED, REMOVED, NOT_APPLICABLE, and deleted-doctor history
need no transition. A doctor deleting their own account also marks their own
PENDING/APPROVED affiliation REMOVED. A live affiliation by itself adds no blocker.

Expose affiliationImpactCount for the clinic and show the automatic detachment
consequence in the confirmation dialog before agreement. Use a complete database
selection, since myClinicDoctors returns at most 100 active members. Gate new
affiliation/signup and review operations with clinic deletion, rechecking the
clinic's ACTIVE status inside their transaction. Signup must acquire the gate
within its existing proof-consumption/member-insertion transaction. Avoid nested
transactions or consuming a verification proof before the gated account creation.
Detachment must increment changed
doctors' __v so an ordinary profile save cannot overwrite the newer state.
Existing authorization rechecks must reject later approvals against a deleted clinic.

### Complete readiness read

Add guarded GraphQL `accountDeletionReadiness(input)` for USER, DOCTOR, and CLINIC.
Use a separate AccountDeletionPageInput with optional appointmentAfter and
waitlistAfter cursors and independent appointmentLimit/waitlistLimit values,
default 20 and range 1–100. Omitted input uses those defaults. No client date range,
status filter, member ID, or doctor filter can narrow the blocker scope.

The response contains the following fields.

- asOf, ready, appointmentCount, waitlistCount, affiliationImpactCount.
- appointments and waitlists, each containing entries and nullable nextCursor.
- Each entry contains id, kind, status, startsAt, endsAt, clinicId, doctorId,
  clinicName, doctorName, clinicTimezone, permittedAction, and resolutionReason.
- permittedAction is CANCEL_BOOKING, CANCEL_WAITLIST, or NONE. resolutionReason
  explains CONTACT_PATIENT_OR_CLINIC, CONTACT_PATIENT, VISIT_IN_PROGRESS, or
  LEGACY_RESOLUTION_REQUIRED when the account cannot act. Entries with an action
  use a null resolutionReason.

Counts always cover the complete role-scoped blocking set before pagination.
`ready` requires both counts zero and resolved data. Affiliation impact is
informational. Lists sort by immutable _id ascending with exclusive _id cursors.
Validate IDs and require each cursor to belong to the caller's role-scoped source
collection, allowing a previously canceled/closed row as the cursor anchor.
Invalid and foreign cursors receive BAD_USER_INPUT with a neutral message.

Read counts, list pages, cleanup cutoffs, affiliation impact, and current account
status/authVersion in one primary snapshot, with bounded execution and no silent
truncation. Independent requests may observe different snapshots. After any action,
refresh both lists from their first pages and reset agreement if blockers appear.
A zero-length later page cannot establish readiness. The final mutation always
recomputes eligibility inside its write transaction, regardless of cached readiness.

Existing reads are insufficient for complete readiness. myAppointments and
myWaitlist are patient-only, myCalendar requires windows of at most 31 days and
has a row bound, REST /appointment/mine caps results at 200, and myClinicDoctors
caps results at 100. Existing get/cancel/leave APIs remain the action entry points.
The new projection omits patient identities, contact details, consent metadata,
queue order, passwords, tokens, and session fields.

### updateMember input and output

Extend MemberUpdateInput with optional memberStatus using MemberStatus, validated
again in the service to accept only DELETED. Reject explicit null, ACTIVE,
SUSPENDED, invalid values, and ADMIN callers. Omission follows the existing profile
update branch. No target member ID is accepted. Google accounts use the same flow.

Add optional deletionAgreement Boolean. Deletion requires exactly true. The only
accepted deletion payload is `{ memberStatus: DELETED, deletionAgreement: true }`.
Reject any supplied profile/password/image/clinic field, including null or an empty
string, in a deletion payload before performing writes or upload claims. Reject
deletionAgreement when memberStatus is omitted. Server agreement validation records
intent for this operation without introducing a password requirement.

Keep MemberUpdateResult and its existing field names. Make member nullable for a
deletion result. Ordinary profile/password updates continue to return MemberSelf
and their existing requiresLogin/imageCleanupPending behavior. Successful deletion
returns `{ member: null, requiresLogin: true, imageCleanupPending: false }`. Keep
stored images and issue no credentials. A dedicated frontend deletion operation
selects requiresLogin and imageCleanupPending. Update shared/generated types for
nullable member while preserving ordinary save handling with its existing checks.

Use the established session clearing and logout bridge after confirmed success.
Authentication rejection on a replay is expected after deletion. An expired or
rejected session following a lost response cannot establish a successful deletion.

### Safe errors and conflicts

GraphQL clients inspect errors even when HTTP status is 200. Extend the existing
explicit formatter allowlist to expose a typed accountDeletion extension.

| extensions.code | accountDeletion.reason | Safe additional fields | UI behavior |
| --- | --- | --- | --- |
| CONFLICT | ACCOUNT_DELETION_BLOCKED | appointmentCount, waitlistCount, asOf | Refresh full readiness and reset agreement |
| CONFLICT | ACCOUNT_DELETION_DATA_UNRESOLVED | None | Explain resolution is required and allow retry |
| CONFLICT | ACCOUNT_DELETION_CHANGED | None | Refresh after concurrent profile/affiliation state change |
| SERVICE_UNAVAILABLE | ACCOUNT_DELETION_UNAVAILABLE | None | Keep deletion disabled and offer readiness retry |
| BAD_USER_INPUT | ACCOUNT_DELETION_INVALID_INPUT | None | Show safe validation feedback |
| FORBIDDEN | ACCOUNT_DELETION_ROLE_FORBIDDEN | None | Disable this flow |
| UNAUTHENTICATED | No accountDeletion extension required | None | Existing session recovery handling |

GraphQL enum/coercion and transport validation errors can use the existing
BAD_USER_INPUT or GRAPHQL_VALIDATION_FAILED code without accountDeletion details.
Clients handle these as validation failures.

Messages stay generic. Never include raw database/provider errors, record contents,
patient identifiers, or credentials in extensions. Readiness supplies authorized
blocker details. A server timeout or lost network response after mutation submission
has an uncertain write outcome. Read current state where authorized and show a
recovery message without automatic mutation replay or a success claim based only
on failed session restoration.

### Step 2 consistency requirements established by tracing

BookingCoordinationService currently writes patient, doctor, and slot gates.
Reuse the patient gate for USER deletion and doctor gate for DOCTOR deletion. Add
a clinic gate shared by clinic deletion, new bookings, staff-created bookings,
waitlist enrollment/replacement/promotion, and affiliation creation/review. Acquire
all keys in the existing deterministic order before current-account and blocker
reads. A snapshot read alone cannot serialize a concurrent commitment insertion.

Keep account/session/affiliation writes in MemberService and expose commitment
checks through an exported booking-owned provider. MemberModule already supplies
authentication to AppointmentModule, so importing AppointmentModule back into
MemberModule would create a cycle. Use BookingModule's existing lower-level
coordination boundary and explicit exported interfaces for deletion checks.

Trace and test signup affiliation writes, legacy REST booking delegation, automatic
allocation, and background cleanup. Workers must recheck current patient, doctor,
and clinic eligibility after gate acquisition. Preserve slot allocation generations,
queue cleanup cutoffs, cancellation events, and normal booking policy/migration
requirements. Unavailable storage/coordination makes deletion unavailable.

Deletion atomically sets DELETED/deletedAt, increments authVersion and __v,
invalidates every refresh session, and applies affiliation detachment. Existing
profile saves filter ACTIVE/deletedAt and compare __v. Login/Google session issuance
and refresh currently have separate member/session steps, so Step 2 must serialize
those writes with deletion or demonstrate equivalent fencing. A pre-deletion token
must fail current-account validation after closure, and session issuance must not
leave a usable post-deletion refresh session. Record-level races remain runtime
acceptance work for Steps 2 and 5.

### Step 1 completion evidence

Source comparison covered member input/result/resolver/service/module, access guard,
GraphQL error formatter, booking gates/types, appointment REST and GraphQL reads,
cancellation/transitions, calendars, commitment join/leave/replace, promotion and
lifecycle workers, appointment/waitlist schemas, clinic affiliation review/signup,
and Next profile operations. The MediBridge member update allowlist was inspected.
This project retains its authenticated identity and role/status checks.

The role/status matrix, exact time boundaries, complete-read strategy, safe error
contract, compatible ordinary-update behavior, and owner-selected automatic
affiliation policy are recorded above. Documentation checks verify local paths and
whitespace. Application code, database behavior, and browser acceptance await the
later implementation steps. No sprint covers November 14 in the current records.

## Step 2 — Implement consistent backend soft deletion

- Keep account/session writes in MemberService and commitment decisions in the
  owning booking/appointment service, using exported interfaces.
- Authenticate the current member and enforce ownership and role server-side.
- Recheck blockers at submission time inside the consistency boundary.
- Coordinate deletion with every operation that can create a blocking record,
  including booking, replacements, waitlist enrollment/allocation, staff-created
  visits, and affiliation changes. Reuse the existing booking gates where they
  cover the relevant actors. Add only the coordination required for uncovered
  clinic/affiliation paths.
- A transaction that only reads blockers is insufficient to prevent concurrent
  inserts. Verify shared gate writes or another demonstrated serialization
  mechanism, followed by current-account checks inside the booking transaction.
- Atomically set memberStatus to DELETED, set deletedAt, increment authVersion,
  and invalidate refresh sessions. Preserve the member record, historical care
  records, and stored profile data.
- Return a conflict without changing account state if blockers remain.
- Repeated or overlapping requests must not create partial deletion. Requests
  reaching the mutation after deletion are rejected by authentication or receive
  an already-completed outcome where safely supported.
- Check refresh/login races and ordinary concurrent profile saves so neither can
  reactivate the account or produce usable post-deletion credentials.

Completion evidence — implementation plus focused real-database tests for
ownership, blockers, transaction rollback, session invalidation, and races.

## Step 3 — Build the My Page commitment dialog

- Add a clearly labeled Delete account button using existing MUI conventions.
- Open an accessible dialog with a heading, close action, focus management,
  loading state, useful errors, and retry controls.
- Load the account's current blockers, including every page needed by the UI.
  Present appointment and waitlist counts and paginated lists where necessary.
- Show clinic, doctor, date/time in the clinic timezone, and current status.
- Reuse existing cancellation APIs and business rules. Preserve normal permission,
  confirmation, cancellation-window, event, and waitlist-allocation behavior.
- Offer Cancel booking and Cancel waitlist only where allowed. Explain which
  actor must resolve records the current member cannot cancel.
- Mark each pending action, prevent duplicate submissions, and retain successful
  cancellations if another action fails. Closing the dialog does not undo them.
- Refresh readiness after cancellation. For an uncertain response, read current
  state before offering another action. Cancellation can trigger waitlist
  allocation, so the full blocker result must be rechecked.
- Keep final deletion disabled while data is loading, unavailable, incomplete,
  stale, or contains blockers.

Completion evidence — functional lists and cancellation actions for each role,
including complete pagination and recoverable failures.

## Step 4 — Add agreement and finish the frontend flow

Use the following proposed confirmation copy.

> Deleting your account permanently closes your access. You cannot restore this
> account. Your existing records will remain stored. Are you sure you want to
> delete your account?

- Show an unchecked checkbox labeled “I understand and agree to delete my account.”
- Enable the Delete account button only when readiness is current, no blockers
  remain, and agreement is selected.
- For CLINIC accounts, show affiliationImpactCount and explain that remaining
  pending/approved doctor affiliations will be detached automatically.
- Reset agreement when the dialog is reopened or new blockers are discovered.
- Submit updateMember with memberStatus DELETED and prevent duplicate submission.
- If the backend reports new blockers, refresh the lists, reset agreement, and
  keep the dialog available for resolution.
- Clear the frontend session and its same-origin refresh cookie after confirmed
  deletion, using the established logout/session flow. Notify other tabs through
  the existing session mechanism and return to a public confirmation screen.
- Handle lost deletion responses explicitly. Rejected session restoration alone
  cannot prove that deletion completed. Display a truthful recovery message and
  avoid automatic mutation replay or an unsupported success claim.
- Preserve normal My Page edit/save/password behavior.

Completion evidence — successful deletion, blocked deletion, conflict recovery,
logout/cookie cleanup, and uncertain-response behavior through normal UI entry points.

## Step 5 — Verify role, concurrency, and interface behavior

- Verify ordinary profile updates and legacy inputs still behave correctly.
- Verify cross-account attempts, unauthenticated requests, ADMIN self-deletion,
  forbidden status changes, and mixed update payloads are rejected.
- Verify all blocker states, pagination, partially failed cancellations, and
  terminal-history retention.
- Verify simultaneous deletion/booking, enrollment, allocation, replacement,
  staff-created booking, affiliation change, and refresh attempts where applicable.
- Verify deleted accounts cannot log in, refresh, access private operations, or
  appear in public discovery, while stored records remain intact.
- Verify email/password and Google members, including Google accounts without
  passwords. Do not add a password requirement that excludes those accounts.
- Verify retained unique email/username/phone/provider identifiers and document
  whether a new registration with those identifiers is rejected. Retention does
  not imply identifier reuse or account restoration.
- Run relevant backend/frontend checks and focused regression tests. Use owned
  disposable data for destructive acceptance flows.
- Inspect desktop/mobile layouts, keyboard operation, focus restoration, screen
  reader labels, and loading/error feedback in a browser when available.
- Keep mocked tests, actual API/database checks, browser acceptance, and production
  deployment evidence distinct.

Completion evidence — recorded check results and any remaining verification limits.

## Step 6 — Record delivery and prepare integration

- Update owning READMEs, API/architecture records where affected, and required
  AI/session records after implementation and verification.
- Update an existing sprint only if it covers the actual work date. No known
  frontend/backend sprint currently covers November 14.
- Record feedback item 6 as delivered only after its actual acceptance checks.
  Issue #10 also contains other feedback requiring separate verification.
- Keep coordinated backend/frontend compatibility requirements visible before release.
- Commit, push, merge, deploy, and close GitHub issues only when requested.

## Worktree sequence and progress

Backend work belongs in .worktrees/backend/backend on branch backend. Frontend
work belongs in .worktrees/next/next on branch next. Preserve unrelated pending
navigation and hero changes in the Next worktree.

| Step | Status |
| --- | --- |
| 1. Commitment rules and API contract | Completed November 14, 2026 |
| 2. Backend soft deletion and concurrency | Pending |
| 3. My Page blocker/cancellation dialog | Pending |
| 4. Agreement and frontend completion | Pending |
| 5. Automated and browser acceptance | Pending |
| 6. Delivery records and integration preparation | Pending |

Step 1 is complete. Step 2 is next when requested. Admin physical deletion, account
restoration, blocked-status administration, and identifier reuse remain separately
scoped work.
