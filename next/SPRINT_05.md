# Sprint 05 — Booking journeys, notifications and usernames

**Period:** October 30–November 5, 2026 (Asia/Seoul)
**Review through:** November 5, 2026
**Status:** Closed — November 5, 2026; release-readiness work carried forward
**Owner:** Me
**Sprint goal:** Let patients and clinic staff manage real booking/waitlist journeys and let members choose unique usernames confidently.

Dates match backend Sprint 05 on branch `backend`. This final review closes the
frontend sprint with locally verified booking, notification and username journeys,
plus the subsequently selected directory and cropper work. Staging, intended storage
and release integration remain carried forward. Actual hours, velocity and confirmed
future capacity were not recorded.

## Final outcome and source review — November 5

| ID | Final disposition | Source / commit evidence |
| --- | --- | --- |
| NEXT-B01–B04, B07–B09 | Delivered locally; original scope and evidence retained below | Existing delivery table and acceptance notes |
| NEXT-B11 / FI-01 | Completed locally: both URL-driven directories, autocomplete, filter polish and centered pagination | `f6dc891`, `1cb6378`, `38fd308`; [shared directory](components/directory/DirectoryPage.tsx), [navigation](libs/directory.ts) |
| NEXT-B13 / FI-07 | Completed locally: square crop/zoom, profile draft/save integration and 1:1 card images with API-origin URLs | `8005084`; [cropper](components/common/ImageCropper.tsx), [image helpers](libs/image-crop.ts), [plan](IMAGE_CROPPER_PLAN.md) |

The closure self-review compared source, branch history, automated test evidence and
recorded browser/API acceptance. Latest Next typecheck, 97 tests and isolated
production build passed. Earlier 65/81/89/92 counts below are overlapping delivery
checkpoints, not additional tests to sum. Directory browser acceptance and actual
clinic/doctor crop uploads passed against normal Nest and disposable MongoDB.
This documentation task does not rerun application tests.

**Integration boundary:** Next is at `8005084`; the separately authorized backend
upload fix is `16f1db6` on branch `backend`. Neither latest commit is an ancestor of
the other branch at review. The cropper requires that backend fix for normal-main
uploads. A combined candidate, its independent review and target-environment checks
remain NEXT-B10 work. No merge or deployment is claimed.

**Historical checkpoints:** dated notes below preserve their original verification
scope. Pending directory/cropper statements are superseded by their final acceptance
entries and this closure review.

## Delivered through November 2

| ID | Delivery | Commit evidence / source |
| --- | --- | --- |
| NEXT-B07 | Discovery documents aligned with current public backend APIs | `284a116`, Oct 31; [public transport](libs/api/public-members.ts) |
| NEXT-B01 | Same-origin HttpOnly refresh-cookie bridge and memory access-token lifecycle | `284a116`; [session proxy](libs/server/session-proxy.ts), [session state](libs/auth-session.ts) |
| NEXT-B02 | Patient booking, visual date calendar, appointment/waitlist lists and all four reviewed atomic replacements | `284a116`, Oct 31; [booking page](components/booking/BookPage.tsx), [calendar](components/booking/BookingCalendar.tsx) |
| NEXT-B03 | Clinic/doctor calendar, revision polling, affiliations, schedule drafts and reviewed staff actions | `833a19e`, Oct 31; [workspace](pages/workspace.tsx), [workspace transport](libs/api/workspace.ts) |
| NEXT-B04 | Private delivered inbox, explicit read state and fresh appointment/waitlist/slot targets | `ef9a008`, Nov 1; [notifications](components/notifications/NotificationsPage.tsx) |
| NEXT-B08 | Username labels, fixed @ prefix, validation, Check/Available/taken/error interaction and safe save-conflict recovery | `9c80598`, Nov 1; `ef7693d`, Nov 2; [username field](components/auth/UsernameField.tsx), [check state](libs/username-check.ts) |
| NEXT-B09 | Patient/staff weekend disabling, weekday keyboard/default dates and schedule-draft validation | `28bd92c`, Nov 1; [date helpers](libs/booking-calendar.ts), [schedule forms](components/workspace/TeamSchedules.tsx) |

These are branch deliveries; merged or deployed status must be checked separately.
Backend queue workers, uniqueness enforcement and migrations are not frontend work.
No authentication/booking/provider configuration is enabled by the UI itself.

## Verification and acceptance evidence

- Oct 31 patient/clinic checks used actual Nest services and disposable MongoDB:
  booking/replacements, failed-target rollback, lost-response read reconciliation,
  scoped calendars/actions, polling recovery and mobile/keyboard interaction passed.
- Nov 1 notification checks covered real delivery retry/replay, stale target context,
  explicit/lost-response mark-read and private-state clearing. The later normal-worker
  Step12 local pilot verified promotion through clinic/patient screens without a
  fixture-only enable hook. This does not establish production rollout.
- Nov 2 Step7: Next typecheck,65 Node tests and isolated production build passed;
  backend separately passed72 auth API and 18 real-MongoDB migration/username tests.
  The running Next/Nest/MongoDB stack verified real signup/profile races with drafts
  preserved, owner case edits, distinct Unicode full names, login/refresh persistence,
  keyboard Check, green Available and 390 px layout. Counts across earlier sessions overlap.
- The owner chose automated Google checks only for this acceptance. Real-library
  signature/nonce tests use substituted key lookup; fresh live Google sign-in remains
  unverified. Earlier owner-confirmed signup is separate historical evidence.
- Current code/tests and Git commits corroborate the recorded checks; see
  [AI_LOG.md](AI_LOG.md), [architecture](../docs/architecture/architecture-next.md)
  and [README](README.md). No application tests were rerun merely to write this file.

## November 5 — NEXT-B11 doctor directory implementation

Follow-up: horizontally centered doctor pagination as requested. Sass compilation
and whitespace checks passed; no additional browser acceptance claimed.

Directory Step4 implemented: `/doctors` uses searchDoctors/suggestDoctorNames,
full-name/city/specialty filters, A–Z/Z–A ordering,12-result server pagination,
matching totals and independent loading/error/retry/empty/suggestion states. Shared
URL/navigation logic supports deep links, debounced replacement, deliberate history
entries, page resets, restoration and cancellation of obsolete work. Existing
clinic/homepage/booking discovery and doctor-card booking actions remain intact.

TypeScript,81 Node tests (16 new) and isolated production build passed. Frontend
adapters against normal compiled Nest/owned disposable MongoDB verified125 matching
doctors, both sorts/page2, combined filters, clinic-derived city, Unicode literals,
username exclusion, empty pages/totals, eight suggestions and independent503 recovery.
Chrome confirmed a combined deep link's controls/count/cards and a pagination URL/
request change. Browser control then encountered active Chrome changes and Safari
timeout. Keyboard autocomplete/Escape, real Back/Forward, error/retry UI and mobile
checks remain pending; this is implementation/automated verification with partial
browser acceptance, not full Step4 or combined Step6 acceptance. No backend/Vite,
application DB, dependencies/configuration, deployment or Git write actions.

## November 5 — NEXT-B11 clinic directory implementation

Directory Step5 implemented from clean next `f6dc891`. `/clinics` now uses
searchClinics/suggestClinicNames with name/city/specialty,sort,page/count and shared
URL/draft navigation. Both pages compose the same DirectoryPage and stylesheet,
preserving existing cards and centered pagination. Removed global-first100-doctor
messaging on the clinic screen. Public clinic-specific doctor reads keep newly
discoverable clinics' previews usable; the per-clinic100-doctor bound is labeled.
Homepage clinic discovery and booking's existing linked-target fallback remain.

TypeScript,89 Node tests (eight new plus the updated public-team fixture) and final
isolated production build passed. Real adapters against Nest/owned disposable MongoDB
verified125 matching clinics with two doctors each,accurate totals,both sorts/page2,
city/specialty,Unicode literals,username exclusion,empty pages,no-doctor clinics,
eight suggestions,separate503 recovery and a Care112 team outside legacy homepage
discovery. Doctor search/suggestions/homepage regressions also passed. Chrome showed
the combined page2 clinic deep link with correct controls/cards/count; subsequent
input encountered active-app/no-window errors or no observable change. Dialog/booking
return,keyboard/history,error UI and mobile browser acceptance remain unverified.
Step6 still owns polish and combined acceptance, including Step4's remaining checks.
Owned fixture stopped and database removed. No protected source/app DB/configuration/
dependency/deployment/staging/commit/push changes. This does not close the whole sprint.

## November 5 — NEXT-B11 filter polish and combined acceptance

Step6 implements removable filter chips, clinical specialty labels, explicit default
selector text, name-input focus after removal/clear, pagination result-summary focus,
wrapping chips and reduced-motion loading polish. Both directories keep centered
pagination. The name-removal patch now overrides pending typing and resets page1.

TypeScript,92 tests,isolated production build and real frontend-adapter checks
against normal Nest/disposable MongoDB pass. Both directories return125 matching
records with correct filters,sorts,page2,totals and suggestions; separate503 recovery,
Unicode literals,username exclusion,clinic distinct counts and selected-clinic team
lookup pass. Chrome verifies doctor keyboard suggestion selection,refresh/history,
chip removal and pagination focus; clinic dialog/focus,booking link/Back restoration,
independent suggestion failure,main-error/retry and clear/focus pass. Clinic390px
top/control layout and cards inspected; Escape closes clinic suggestions without
changing filters. Inspection caught left-aligned wrapped pagination rows; the shared
list now centers each row and the updated production build passes. Final390px visual rechecks pass for centered wrapped pagination on both pages,
doctor controls and single-column cards. Combined local directory acceptance is complete.
See [architecture acceptance details](../docs/architecture/architecture-next.md).
No production deployment or whole-sprint closure is implied.

At directory closure,square doctor/clinic photos and cropping were deferred to NEXT-B13;
the later delivery below supersedes that deferral.
Review found MediBridge's react-easy-crop flow; a separate plan must define reuse,
upload behavior and treatment of existing images before implementation.

## November 5 — NEXT-B13 square photos and cropper

Implemented the selected FI-07 job after directory completion. Added the shared
MediBridge-style square crop/zoom dialog,local draft confirmation and existing
Save changes integration. Both doctor/clinic card image regions are1:1; legacy
images use centered cover without migration. Shared image URL resolution fixes
API-hosted uploads incorrectly loading from Next. [Plan and scope](IMAGE_CROPPER_PLAN.md).

Next typecheck,97 tests and isolated production build pass. Chrome verified desktop
keyboard/cancel/draft behavior,upload-error preservation,clinic/doctor real saves and
375px cropper layout. Both stored files are JPEG1024×1024 in the correct owned target;
public clinic card loads the saved crop. The owner authorized a backend upload
Promise/ValidationPipe fix; backend build/full TypeScript,12 upload and all222 API
checks pass. Production storage/deployment are separate; no app DB or Git actions.

## Remaining work and lessons

Production TLS/proxy/multiple-instance/load behavior, intended profile image storage
and password submission, full OS-offline behavior remain
unverified or undelivered. Ratings are placeholders; doctor/clinic registration UI
is pending. Owned acceptance stacks were stopped after their checks; no production deployment or
application-database migration is claimed.

Corrected lessons: validate documents against the actual backend before integration;
reset loading state on mode exit; seed complete versioned ledgers in worker fixtures;
isolate production build output from live dev; check post-busy focus and success
colors inside every consuming feature. These do not represent open failures today.

## Final backlog disposition and carry-forward

Labels describe refinement: 🔴 Thinking = candidate; 🔵 Planning = refined. Open
items need separate selection; closing this sprint does not authorize implementation.

| ID | Priority / type | Outcome or remaining need | Final disposition |
| --- | --- | --- | --- |
| NEXT-B10 | P1 / Engineering/test | Combined-candidate review, staging session/proxy/TLS/private-cache acceptance and backend release dependencies | Carried forward — 🔵 Planning |
| NEXT-B06 | P2 / Test | Intended-storage upload/replacement/removal and password acceptance; disposable square-photo saves are verified but do not satisfy this whole scope | Carried forward — 🔵 Planning |
| NEXT-B11 | P2 / Feature | Paginated doctor/clinic discovery using public backend contracts | Completed locally — Nov 5, `38fd308` final polish |
| NEXT-B12 | P3 / Feature | Doctor/clinic registration UI with role-specific validation and pending affiliation | Carried forward — 🔴 Thinking; scope confirmation needed |
| NEXT-B13 | P3 / Feature | Square card photos and upload cropper informed by MediBridge | Completed locally — Nov 5, `8005084` |
| NEXT-B05 | P3 / Optional verification | Fresh live Google-provider acceptance only if the owner reopens it | Optional carry-forward — 🔴 Thinking; automated acceptance satisfied |

**Planning scenario:** the previous 8-hour review/test assumption was unconfirmed,
not measured or remaining sprint capacity. B10 and B06 retain provisional estimates
of 3 hours each with 2 hours buffer if selected for a future period. B10 overlaps
backend S05-F01; do not count it as separate capacity. Backend migration review and
B06 storage work are alternative/dependent selections until availability is confirmed.
No Sprint 06 dates or record are created here.

**NEXT-B10 — 3 hours, Me:** Review a concrete combined candidate and staging topology.
Accept when (1) both latest commits and repeatable candidate checks/review are
recorded, (2) browser/server URL, cookie, origin and TLS assumptions are explicit,
and (3) private-cache isolation plus failed-refresh/sign-out behavior have evidence.
Dependencies: requested branch integration, target topology and backend release gates.
The deliverable is review evidence; no deployment is performed by this closure.

**NEXT-B06 — 3 hours, Me:** Exercise profile writes against intended storage using
disposable accounts. Accept when (1) upload/replacement/removal preserve ownership,
(2) password changes enforce required fields and end sessions, and (3) recoverable
failures preserve drafts. Dependencies: selected storage, current backend rules and
any necessary human credential interaction. No real patient data is required.

| Order | Proposed task | Owner | Dependency / blocker |
| --- | --- | --- | --- |
| 1 | Record combined candidate revisions and review deployment/session assumptions | Me | Requested integration and actual target topology |
| 2 | Prepare intended-storage profile/password acceptance | Me | Storage setup and account/provider rules |
| 3 | Record remaining gaps and select subsequent work | Me | Evidence, availability and owner selection |

**Check-in record:** earlier Nov 3 / Nov 5 checkpoints were proposals, not meetings
claimed to have occurred. This document is the Nov 5 final review. If carry-forward
work is selected, propose a start check-in and a pre-acceptance check-in using
completed / next / blockers; dates depend on the next confirmed period.

## Sprint closure checklist

- [x] Final delivered behavior, stable IDs, commits and source evidence recorded.
- [x] Automated, fixture and real browser/API evidence distinguished from deployment.
- [x] Documentation/source-evidence self-review completed; independent peer-review gap recorded.
- [x] B10/B06 and other unfinished work explicitly carried forward.
- [x] Combined-branch integration remains an explicit release gate.
- [x] Nov 5 final review completed and following-period recommendations recorded.

The sprint record is closed. Combined-candidate peer/release review, intended-storage
and staging/production gates remain open under the carry-forward IDs. Manual checks
need the actual environment and account/provider behavior. Sprint 03–04 history,
application data and configuration remain unchanged. No issue publication, merge,
staging, commit, push or deployment actions were performed by this review.
