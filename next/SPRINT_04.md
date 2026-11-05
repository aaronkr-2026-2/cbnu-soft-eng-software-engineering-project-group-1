# Sprint 04 — Booking integration preparation and evidence gap

**Period:** October 23–29, 2026 (Asia/Seoul)
**Record date:** November 2, 2026
**Status:** Retrospective evidence-gap record for an ended period
**Owner:** Me
**Continuation goal:** Prepare a dependable path from discovery/sign-in to real patient booking; no original dated Next sprint goal was found.

Dates match backend Sprint 04 on branch `backend`. No Next code commits or dated
Next implementation/verification entries were identified for this interval in the
inspected history and logs. This does not establish that no work occurred or that
zero hours were spent. No new UI delivery or successful tests are attributed here.

## Starting point and dependency boundary

[Sprint 03](SPRINT_03.md) delivered discovery/auth/profile UI with fixture-level
acceptance and temporary sessions. Backend Sprint 04 separately delivered booking
coordination, confirmed appointments, schedules, lifecycle and staff-booking APIs.
Those are backend results, not delivered Next screens. Relevant frontend entry
points for later integration are [AuthPage](components/auth/AuthPage.tsx),
[public transport](libs/api/public-members.ts), [booking route](pages/book.tsx)
and [booking documents](apollo/user/booking.ts); booking files represent later
Sprint 05 delivery and did not establish implementation during this period.

## Prioritized carry-forward backlog

Labels describe this retrospective assessment: 🔴 Thinking = candidate;
🔵 Planning = refined. They are not claims of dated historical activity.

| ID | Priority / type | Item and rationale | Label / subsequent outcome |
| --- | --- | --- | --- |
| NEXT-B07 | P1 / Integration fix | Align discovery with the current API so users can choose real care teams | 🔵 Planning; fixed Sprint 05 |
| NEXT-B01 | P1 / Engineering | Restore/refresh sessions safely before private booking screens depend on them | 🔵 Planning; delivered Sprint 05 |
| NEXT-B02 | P1 / Feature | Patient appointment/waitlist lists, exact slot selection and reviewed replacements | 🔴 Thinking; delivered Sprint 05 |
| NEXT-B03 | P2 / Feature | Authorized clinic/doctor calendar and staff actions | 🔴 Thinking; delivered Sprint 05 |
| NEXT-B04 | P2 / Feature | Delivered notification inbox with current target checks | 🔴 Thinking; delivered Sprint 05 |
| NEXT-B06 | P2 / Test | Live profile image/password behavior beyond fixture responses | 🔴 Thinking; remains separate |

**Capacity:** Historical availability/estimates were not recorded. For a proposed
follow-up week only, assume 12 h and select B07/B01 for 3 h/6 h, leaving 3 h buffer.
These estimates do not assert actual hours worked or a historical commitment.

**Top item NEXT-B07 —3 h:** Validate discovery against the backend branch schema.
Accept when documents execute without unsupported fields, returned public data
excludes private contact fields, and empty/error states remain usable. Dependencies:
real member/directory contracts; full pagination is a separate feature.

**Top item NEXT-B01 —6 h:** Add the same-origin authentication/session bridge.
Accept when reload restores a valid session, refresh rotation remains server-owned,
and sign-out clears private UI without exposing refresh tokens to JavaScript.
Dependencies: Nest login/refresh/nonce contracts and a running Next server.

| Order | Proposed task | Owner | Likely blocker |
| --- | --- | --- | --- |
| 1 | Validate actual executable documents/public response projections | Me | API drift between worktrees |
| 2 | Implement session bridge and memory access-token lifecycle | Me | Cookie/origin/proxy behavior |
| 3 | Exercise reload, failed refresh and sign-out against real Nest | Me | Suitable disposable database and local listeners |

**Proposed check-ins, not recorded meetings:** after schema validation — completed /
next / blockers; before browser acceptance — completed / next / blockers.

## Definition of done and review limits

- [x] Missing frontend delivery/verification evidence stated explicitly.
- [x] Backend dependencies separated from frontend completion.
- [ ] Historical peer/self-review, tests and user-visible acceptance established.
- [ ] Selected follow-up items accepted against running frontend/backend.

No application tests were run for this documentation-only review. Git/source and
link/period checks do not establish historical browser behavior. Subsequent
implementation and local integration are recorded in [Sprint 05](SPRINT_05.md),
not backdated into this record. No issues, deployment or Git actions are implied.
