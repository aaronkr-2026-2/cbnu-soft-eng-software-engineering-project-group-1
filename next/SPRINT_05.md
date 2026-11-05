# Sprint 05 — Booking journeys, notifications and usernames

**Period:** October 30–November 5, 2026 (Asia/Seoul)
**Review through:** November 5, 2026
**Status:** In progress; final review due November 5
**Owner:** Me
**Sprint goal:** Let patients and clinic staff manage real booking/waitlist journeys and let members choose unique usernames confidently.

Dates match backend Sprint 05 on branch `backend`. This review separates frontend
implementation, fixture checks and successful local backend/browser integration.
Actual hours/capacity were not recorded; November 3–5 outcomes are not assumed.

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
is pending. Test servers were stopped after Step7; no production deployment or
application-database migration is claimed.

Corrected lessons: validate documents against the actual backend before integration;
reset loading state on mode exit; seed complete versioned ledgers in worker fixtures;
isolate production build output from live dev; check post-busy focus and success
colors inside every consuming feature. These do not represent open failures today.

## Prioritized remaining backlog

Labels: 🔴 Thinking = candidate; 🔵 Planning = refined. Items are proposals and
require separate implementation requests.

| ID | Priority / type | Item and rationale | Label |
| --- | --- | --- | --- |
| NEXT-B10 | P1 / Engineering/test | Review staging session/proxy/TLS/private-cache acceptance and backend activation dependencies | 🔵 Planning |
| NEXT-B06 | P2 / Test | Verify real profile upload/replacement/password flows against intended storage | 🔵 Planning |
| NEXT-B11 | P2 / Feature | Paginated discovery using delivered public backend contracts | Completed locally November5; Step6 polish and automated/API/desktop/mobile acceptance passed |
| NEXT-B12 | P3 / Feature | Doctor/clinic registration UI with role-specific validation and pending affiliation | 🔴 Thinking; confirm desired onboarding scope |
| NEXT-B13 | P3 / Feature | Square doctor/clinic card photos and upload cropper informed by MediBridge | Completed locally November5; square crops/cards,real clinic/doctor saves and mobile dialog verified |
| NEXT-B05 | P3 / Optional verification | Fresh live Google-provider acceptance only if the owner reopens that scope | 🔴 Thinking; automated acceptance already satisfied |

**Remaining-work capacity assumption:**8 h of review/test work, not confirmed owner
availability. Select B10 for 3 h and B06 for 3 h, leaving2 h buffer. Estimates include
verification and are not measured implementation hours or a claim of production readiness.

**Top item NEXT-B10 —3 h:** Review a concrete staging topology and session checklist.
Accept when browser/server URL and cookie/origin assumptions are explicit, private
responses cannot be shared-cache hits, and failed refresh/sign-out behavior has
repeatable evidence. Dependencies: staging topology and backend release prerequisites;
no deployment is performed by this documentation task.

**Top item NEXT-B06 —3 h:** Exercise profile writes against disposable users and intended
storage. Accept when upload/replacement/removal preserve ownership, password changes
require the expected fields and end sessions, and failures preserve unsaved input.
Dependencies: backend upload/storage and password rules, a suitable fixture and any
necessary human credential interaction. Never use real patient records as test data.

| Order | Proposed task | Owner | Likely blocker |
| --- | --- | --- | --- |
| 1 | Review deployment/session assumptions with the backend checklist | Me | Target topology and operator decisions |
| 2 | Prepare disposable profile/storage acceptance fixtures | Me | Storage setup and provider-managed passwords |
| 3 | Record repeatable results and carry unresolved gaps forward | Me | Missing environment/access or review |

**Proposed check-ins:** Nov 3 — completed / next / blockers; Nov 5 final review —
completed / next / blockers. These are proposed checkpoints, not meetings claimed to have occurred.

## Definition of done and next review

- [x] Branch delivery and local integration evidence recorded with limitations.
- [x] Username Step7 accepted using the owner's automated-Google scope.
- [ ] Peer review or a recorded self-review of the current candidate.
- [ ] B10/B06 checks completed or explicitly carried forward.
- [ ] Nov 5 final review confirms outcomes and selects the next-week backlog.

Manual provider/storage/proxy checks cover boundaries a fixture cannot establish.
No Sprint 06 dates, historical capacity, issue publication, merge, deployment or
production activation is asserted. Preserve [Sprint 03](SPRINT_03.md) and
[Sprint 04](SPRINT_04.md) as historical evidence; this sprint remains open.
