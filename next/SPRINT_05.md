# Sprint 05 — Booking journeys, notifications and usernames

**Period:** October 30–November 5, 2026 (Asia/Seoul)
**Review through:** November 2, 2026
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

## Remaining work and lessons

Production TLS/proxy/multiple-instance/load behavior, intended profile image storage
and password submission, full OS-offline behavior and directory pagination remain
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
| NEXT-B11 | P2 / Feature | Paginated discovery so clinics outside the first 100 doctors can be found | 🔴 Thinking; backend pagination contract needed |
| NEXT-B12 | P3 / Feature | Doctor/clinic registration UI with role-specific validation and pending affiliation | 🔴 Thinking; confirm desired onboarding scope |
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
