# Sprint 03 — Discovery and private profile APIs

**Period:** October 16–22, 2026 (Asia/Seoul)
**Status:** Retrospective review of an ended period
**Sprint goal:** Let visitors discover approved doctors and let members manage their private profile safely.

**Record date:** November 2, 2026 (Asia/Seoul)
**Owner:** Me

This is an evidence-based retrospective, not a claim that this plan, estimates or
check-ins existed at the time. Commit dates and implementation-session dates may
differ; both are identified where relevant. Actual hours and weekly capacity were
not recorded. Existing Sprint 01–02 history is preserved.

## Delivered scope and evidence

| ID | Delivery | Evidence | Verification at the time |
| --- | --- | --- | --- |
| S03-01 | Approved public doctor directory with private fields excluded | `2a22b0a`, Oct 17; [member resolver](src/components/member/member.resolver.ts) | Build and 13 focused member GraphQL tests; persistence substituted |
| S03-02 | Authenticated public image uploads, file validation and cleanup | `76a9920`, Oct 18; [upload service](src/components/upload/upload.service.ts) |12 uploader checks; full E2E112 passed/2 existing status-page failures |
| S03-03 | Required clinic cities and doctor city derived from current clinic | `92eebd7`, Oct 18; [member service](src/components/member/member.service.ts) |79 member E2E checks with simulated persistence |
| S03-04 | Authenticated profile/contact edits, optional password change and owned-image replacement | `d429eb0`, Oct 18; [member service](src/components/member/member.service.ts) | Build/type/lint and profile HTTP/filesystem checks recorded |
| S03-05 | Guarded myProfile with private contact fields and canChangePassword | `6153660`, Oct 19; [member resolver](src/components/member/member.resolver.ts) |73 focused profile/update checks with simulated persistence |

Counts describe overlapping suites and must not be added. These historical tests
were not rerun for this documentation task. The two status-route failures were
open at period end and subsequently fixed in Sprint 05. Next discovery/auth/profile
screens are frontend delivery, recorded separately on branch `next`.

## Prioritized continuation backlog

Labels are retrospective planning categories: 🔴 Thinking = candidate,
🔵 Planning = refined; they do not assert historical selection or activity.

| ID | Priority / type | Item and rationale | Label / subsequent outcome |
| --- | --- | --- | --- |
| S04-01 | P1 / Feature | Agree exact-slot booking/waitlist rules so patient commitments have one contract | 🔵 Planning; delivered Sprint 04 |
| S04-02 | P1 / Engineering | Transactional commitment coordination to prevent competing writes | 🔵 Planning; delivered Sprint 04 |
| S02-06 | P1 / Bug fix | Unify MongoDB URI selection so startup and model registration agree | 🔴 Thinking; delivered Sprint 04 |
| S04-04 | P1 / Feature | Clinic-owned working hours and generated availability | 🔴 Thinking; delivered Sprint 04 |
| S04-05 | P2 / Feature | Cancellation, staff booking and durable release events | 🔴 Thinking; delivered Sprint 04 |
| S03-F01 | P2 / Test | Verify profile uploads/password edits against live storage and browser flows | 🔴 Thinking; still a verification gap |

**Planning capacity assumption:**20 h for a follow-up week, following Sprint 02's
baseline; top two proposed items total14 h, leaving6 h buffer. These are new sizing
assumptions, not measured historical implementation hours.

**Top item S04-01 —6 h:** Define exact doctor/30-minute targets, cutoff, consent,
spacing and replacement semantics. Accept when the contract states clinic-timezone
rules, identifies legacy-data decisions and separates activation from migration.
Dependency: existing appointment schemas and patient/clinic requirements.

**Top item S04-02 —8 h:** Coordinate appointment/ledger writes transactionally.
Accept when concurrent slot claims have one winner, rollback preserves both records,
and unsupported standalone storage cannot bypass the policy. Dependencies: S04-01,
MongoDB replica set and unique indexes. Estimates include verification.

| Order | Proposed task | Owner | Blocker |
| --- | --- | --- | --- |
|1 | Resolve policy decisions and document acceptance examples | Me | Ambiguous legacy commitments |
|2 | Implement coordinated writes and indexes | Me | Transaction support and migration ordering |
|3 | Run contention/rollback checks and review outcomes | Me | Disposable replica-set setup |

**Proposed check-ins, not recorded meetings:** after policy review — completed /
next / blockers; before follow-up acceptance — completed / next / blockers.

## Review and definition of done

- [x] Delivered changes traced to commits, source and [AI_LOG.md](AI_LOG.md).
- [x] Recorded automated results and their simulated-persistence limits identified.
- [ ] Peer review and live profile storage/password browser acceptance recorded.
- [ ] Deployment/application-database acceptance recorded.

Relevant main merges include `5d5eb46` and `5a0a1cc`; this does not establish
production deployment. Manual storage/provider checks remain necessary because
substituted persistence does not prove browser sessions or real file lifecycle.
See [Sprint 02](SPRINT_02.md) and [Sprint 04](SPRINT_04.md). No issues were created.
