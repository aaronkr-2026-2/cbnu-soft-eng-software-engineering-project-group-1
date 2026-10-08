# Sprint 01 — Member profiles and API documentation

**Period:** October 1–8, 2026
**Review date:** October 8, 2026
**Owner:** Me
**Sprint goal:** Let frontend developers retrieve safe member profiles, test REST endpoints through Swagger, and diagnose GraphQL requests more easily.

This document records the sprint scope and delivery review. Results are supported by the session records and current code/Git history. Capacity and effort are planning assumptions; actual hours were not recorded.

## Capacity and prioritized backlog

**Capacity assumption:** 20 person-hours: 18 hours allocated to selected work and 2 hours of buffer. Estimates include testing.

**Workflow:** 🔴 Thinking = backlog; 🔵 Planning = refined for selection; 🟢 Doing = selected delivery work. Delivery outcomes are recorded separately so completed work is not mistaken for unfinished implementation.

| Priority | Item | Type | Rationale | Workflow status | Estimate | Recorded outcome |
|---|---|---|---|---|---|---|
| P1 | GraphQL getMember for USER, DOCTOR, and CLINIC | Feature | Frontend needs safe member profiles | 🟢 Doing | 6h | Completed Oct 1 |
| P1 | Swagger REST documentation | Engineering improvement | Developers need discoverable, testable REST endpoints | 🟢 Doing | 4h | Completed Oct 8; full response schemas remain |
| P2 | GraphQL execution logging | Bug fix | Existing interceptor skipped GraphQL execution | 🟢 Doing | 3h | Completed Oct 1 |
| P2 | Signup password length of 8–100 | Feature adjustment | Apply the requested signup rule | 🟢 Doing | 2h | Completed Oct 1 |
| P2 | Align member resolver and output DTO with MediBridge | Refactor | Keep API structure consistent and maintainable | 🟢 Doing | 1h | Completed Oct 1 |
| P2 | Update API examples and troubleshooting documentation | Documentation | Help developers use and diagnose the APIs | 🟢 Doing | 2h | Updates recorded Oct 1 and Oct 8 |
| P3 | Explicit Swagger response DTOs | Engineering improvement | Current type aliases do not produce full response schemas | 🔴 Thinking | Not estimated | Deferred |

The six selected items total 18 hours. Tests are included in their estimates. No separate additional test effort is assumed.

## Top item 1 — GraphQL member profiles

**Description:** Expose getMember(id: ID!) through GraphQL for active USER, DOCTOR, and CLINIC members. Validate IDs in the service, return explicitly selected public fields, and retain REST signup/login/refresh. Remove REST member lookup.

**Acceptance checks:**

1. A valid ID returns the matching active USER, DOCTOR, or CLINIC profile with the documented fields.
2. Invalid IDs are rejected; ADMIN, suspended, deleted, and missing members are unavailable. Credentials and private contact fields are excluded.
3. GET /member/:id returns 404; GraphQL lookup and REST authentication remain available.

**Dependencies:** Member schema, GraphQL module, member service, and agreed public field projection.
**Estimate:** 6 person-hours, including tests and README examples.

## Top item 2 — Swagger

**Description:** Install @nestjs/swagger, expose /docs and /docs-json, enable DTO schema generation, describe member authentication endpoints, and declare bearer authentication for protected appointment REST routes.

**Acceptance checks:**

1. /docs serves the Swagger UI and /docs-json serves an OpenAPI document.
2. Signup, login, and refresh request schemas are present; signup metadata describes role-dependent fields and specialization values.
3. Appointment REST operations declare bearer authentication, and the backend builds successfully.

**Dependencies:** Existing Nest bootstrap, REST controllers, DTOs, and compatible Swagger dependency.
**Estimate:** 4 person-hours, including smoke checks and documentation.
**Scope limit:** Swagger covers REST. GraphQL remains documented by its schema. Complete response DTO documentation is deferred.

## Task breakdown

Tasks are ordered by dependencies. Hours are estimates, not timesheet entries.

| Order | Task | Owner | Hours | Likely blocker |
|---|---|---|---|---|
| 1 | Define public member fields and implement GraphQL lookup | Me | 3h | Role and privacy requirements |
| 2 | Test profile roles, errors, privacy, and REST removal | Me | 3h | Test fixture coverage |
| 3 | Add GraphQL interceptor logging and assertions | Me | 3h | HTTP and GraphQL context differences |
| 4 | Apply signup length rules and boundary tests | Me | 2h | Preserve existing login compatibility |
| 5 | Align member resolver/output DTO conventions | Me | 1h | Preserve GraphQL contract |
| 6 | Install and configure Swagger and controller metadata | Me | 3h | Registry access and package compatibility |
| 7 | Check Swagger UI, JSON, schemas, and bearer metadata | Me | 1h | Local test-port access |
| 8 | Update examples and troubleshooting notes | Me | 2h | Correct working directory and API port |

## Asynchronous check-in plan

- **October 3 — completed / next / blockers:** Member lookup, logging, and validation progress / Swagger setup / unresolved requirements or environment access.
- **October 7 — completed / next / blockers:** Documentation progress / final API checks / dependency or test-port access.

These check-ins are proposed checkpoints; attendance and messages were not recorded.

## Definition of done

- [x] Selected API acceptance checks have recorded successful results.
- [x] Relevant automated tests and Swagger smoke checks have recorded passes.
- [x] Backend build passed in the recorded implementation sessions.
- [ ] Changes are reviewed by a peer when available; otherwise record a self-review.
- [x] Changes are integrated into local main (merge commit `d9f8a10`).
- [ ] Manually retrieve a member profile and try a REST request through Swagger.
- [ ] README, AI_LOG.md, and SESSION_LOG.md reflect actual work and limitations.

The manual acceptance check verifies that the instructions and Swagger browser interaction are usable against a running backend. Automated tests cover repeatable contracts and validation. Review and manual walkthrough remain open until evidence is recorded.

## Sprint review

- **October 1:** The final member-role update records a full TypeScript check and 77 passing HTTP/GraphQL tests. Password boundary work separately records 20 passing authentication tests. These counts overlap and must not be added together.
- **October 8:** Swagger build and database-free smoke checks passed for UI/JSON responses, request schemas, conditional signup fields, specialization values, and bearer security metadata.
- Current Git history contains the Swagger commit and a merge from backend. Peer review and a live user/database walkthrough are not confirmed by the inspected records.
- Historical application checks were not rerun during this documentation update. Remote GitHub Issues were not reviewed or created. Actual capacity and time spent remain unknown.

## Decision to explain without AI

Use GraphQL for member profile reads and Swagger for REST documentation because each matches the API transport already used by the project. Keep business rules in services so documentation changes do not change authentication or booking behavior.
