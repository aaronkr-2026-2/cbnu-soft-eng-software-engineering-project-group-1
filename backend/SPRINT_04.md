# Sprint 04 — Transactional booking foundations

**Period:** October 23–29, 2026 (Asia/Seoul)
**Status:** Retrospective review of an ended period
**Sprint goal:** Let patients and clinics book and manage appointments without double booking or losing existing commitments.

**Record date:** November 2, 2026 (Asia/Seoul)
**Owner:** Me

This is an evidence-based retrospective, not a claim that this plan, estimates or
check-ins existed at the time. Commit dates and implementation-session dates may
differ; both are identified where relevant. Actual hours and weekly capacity were
not recorded. Existing Sprint 01–02 history is preserved.

## Delivered scope and evidence

| ID | Delivery | Commit evidence / source |
| --- | --- | --- |
| S04-01 | Booking/waitlist policy and migration contract | `87715f4`, Oct 25; [contract](BOOKING_WAITLIST_CONTRACT.md) |
| S04-02 | Transactions, doctor/patient/slot coordination, migration and unique active-slot enforcement | `5e22b25`, Oct 25; [coordination](src/components/booking/booking-coordination.service.ts) |
| S02-06 | Shared MongoDB URI selection, preserving production validation | `5e22b25`; [database configuration](src/database/database.config.ts) |
| S04-03 | Immediate confirmed specialty-aware30-minute bookings and patient conflict checks | `45f3de0`, Oct 25; [appointment service](src/components/appointment/appointment.service.ts) |
| S04-04 | Doctor affiliation review, weekly/date hours and public bounded availability | `b716a0a`, Oct 28; implementation log Oct 26; [schedule service](src/components/appointment/appointment-schedule.service.ts) |
| S04-05 | Cancellation, completion/no-show, clinic PHONE/WALK_IN booking and durable release events | `d457961`, Oct 29; implementation log Oct 28; [appointment events](src/schemas/appointment-event.model.ts) |

The final lifecycle session records build/full TypeScript success,19 unit and 70
real-MongoDB checks, plus192 API checks passed/2 known status-route failures.
Lint retained the empty config.ts warning. Earlier counts overlap these suites;
none were rerun for this documentation task. Integration into main is visible for
the initial foundation (`d7065bc`); later merge evidence is in Sprint 05. New writes
still required migration and explicit activation. Working waitlist enrollment,
promotion and notification delivery were not yet delivered in this period.

## Prioritized continuation backlog

Labels: 🔴 Thinking = candidate; 🔵 Planning = refined. These are retrospective
planning categories, not a reconstructed timesheet or historical agreement.

| ID | Priority / type | Item and rationale | Label / subsequent outcome |
| --- | --- | --- | --- |
| S05-01 | P1 / Feature | Waitlist enrollment and atomic replacement, preserving the original on failure | 🔵 Planning; delivered Sprint 05 |
| S05-02 | P1 / Engineering | Recoverable FIFO promotion, preventing duplicate booking under replay | 🔵 Planning; delivered Sprint 05 |
| S05-03 | P1 / Feature/test | Cutoff lifecycle and durable required IN_APP notices | 🔴 Thinking; delivered Sprint 05 |
| S05-04 | P2 / Feature | Patient lists and authorized calendar/notification context APIs for Next | 🔴 Thinking; delivered Sprint 05 |
| S05-05 | P2 / Bug fix/test | Status assets, multi-batch audits and process-recovery checks | 🔴 Thinking; delivered Sprint 05 |
| S03-F01 | P2 / Test | Live profile image/password acceptance | 🔴 Thinking; remains separate |

**Planning capacity assumption:**20 h for the following week; top two proposed
items total16 h with 4 h buffer. These are provisional sizing assumptions; no actual
hours, historical capacity or completion-time claim is made.

**Top item S05-01 —8 h:** Add exact-target enrollment/withdrawal and all four
appointment/waitlist replacements. Accept when actor identity comes from auth,
consent/cutoff/spacing are rechecked, and a competing destination rolls back the
source release. Dependencies: coordinated writes, working schedules and versions.

**Top item S05-02 —8 h:** Process releases in FIFO order with durable leases.
Accept when eligible consented entries produce one booking, expired claims can be
recovered, and replay creates no duplicate booking/notice. Dependencies: S05-01,
release outbox, transaction gates and required-notification design.

| Order | Proposed task | Owner | Blocker |
| --- | --- | --- | --- |
|1 | Add guarded queue operations and replacement transactions | Me | Consent/version and ownership rules |
|2 | Implement leased FIFO processing behind release gates | Me | Notification and cutoff prerequisites |
|3 | Verify contention, rollback, replay and recovery | Me | Disposable storage and controlled worker timing |

**Proposed check-ins, not recorded meetings:** after queue API checks — completed /
next / blockers; before worker acceptance — completed / next / blockers.

## Review and definition of done

- [x] Source and commits support the delivered backend scope.
- [x] Transaction, conflict and lifecycle acceptance has recorded test results.
- [ ] Peer review and deployed patient/clinic acceptance recorded for this period.
- [ ] Production migration/activation completed.

Manual acceptance must include a patient and clinic using the same running API;
passing server tests alone does not prove that workflow. Next booking screens were
delivered later. See [Sprint 03](SPRINT_03.md), [Sprint 05](SPRINT_05.md), and
[AI_LOG.md](AI_LOG.md). No GitHub issues were created by this review.
