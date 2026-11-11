# Sprint 02 — Google sign-in backend and integration readiness

**Period:** October 9–15, 2026 (Asia/Seoul)
**Record date:** October 15, 2026
**Owner:** Me
**Sprint goal:** Let new and returning users authenticate through Google using the existing MedConnect session system, while making the remaining browser integration explicit.

This second-week record follows [Sprint 01](SPRINT_01.md), which ends October 8. It combines verified delivery with an explicitly deferred backlog; it does not claim that a complete website Google sign-in journey is delivered. The October 9–15 interval follows the previous recorded end date; no separate historical sprint agreement is asserted.

## Capacity and prioritized backlog

**Capacity assumption:** 20 person-hours for one person, following Sprint 01's planning baseline. Selected scope totals 12 estimated hours, leaving 8 hours of buffer. These are retrospective sizing assumptions, not measured hours or evidence of remaining time on October 15. Actual availability and time spent were not recorded.

**Workflow labels:** 🔴 Thinking = backlog; 🔵 Planning = refined but not selected; 🟢 Doing = selected delivery scope. The outcome column separately records completed work; “Doing” does not mean delivered items are still unfinished.

| ID | Priority | Item | Type | Rationale | Workflow | Estimate | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S02-01 | P1 | Google ID-token login and automatic USER registration | Feature | Support Alex's external-account sign-in story P1-S04 without phone/password onboarding | 🟢 Doing | 6h | Backend completed October 15; frontend integration pending |
| S02-02 | P1 | Google identity, nonce, session, and regression verification | Test / security improvement | Prevent forged login, duplicate identities, and regressions in existing authentication | 🟢 Doing | 3h | Automated backend checks passed October 15; live Google/Atlas checks pending |
| S02-03 | P2 | Document auth contracts, architecture, and implementation status | Documentation | Help the frontend integrate the real API and distinguish implemented services from proposals | 🟢 Doing | 2h | Updated October 15; architecture remains in one document |
| S02-04 | P2 | Establish sprint delivery tracking and local mistake lookup | Engineering improvement | Keep completed work visible and avoid repeated implementation/workflow mistakes | 🟢 Doing | 1h | Completed October 15: Sprint 02, AGENTS rules, and ignored local fixes register |
| S02-05 | P1 | Connect frontend Google and email/password authentication | Feature / integration bug fix | Login currently uses a mock; real auth routes and response mapping need alignment | 🔵 Planning | 6h | Deferred; no Google button or connected browser journey implemented |
| S02-06 | P1 | Unify MongoDB URI selection across startup and modules | Bug fix | Validation/model registration can disagree with DatabaseModule's URI selection | 🔴 Thinking | 4h | Deferred; documented source defect, no live misrouting demonstrated |
| S02-07 | P2 | Verify real Google browser sign-in and MongoDB uniqueness behavior | Integration verification | Substituted keys/persistence do not prove real provider/deployment behavior | 🔴 Thinking | 2h | Deferred; requires browser integration, configured origins, and a suitable test database |

S02-05 through S02-07 are candidate follow-up work, excluded from this sprint's selected 12h scope. Their estimates are provisional. Creating this document does not authorize their implementation. No GitHub issue was created by this task; the OAuth issue text prepared in chat is a draft, not a published issue or issue number. No issue links were found in the inspected local planning references; remote issues were not reviewed.

## Top item 1 — S02-01: Google sign-in backend

**Description:** Add REST nonce issuance and Google credential verification, find accounts by Google sub/googleId, immediately create new USER accounts without phone/password, and issue the existing application access/refresh session. Use a provider name when available; otherwise assign a unique google_user plus six digits. Never merge accounts based on matching email alone.

**Acceptance checks:**

1. `POST /member/google/nonce` returns a five-minute signed challenge and browser cookie; `POST /member/google/login` accepts the corresponding ID token and returns HTTP 200 with `{ member, accessToken, refreshToken }`.
2. A new identity creates one USER without phone/password; returning identities reuse the account. Missing names or nickname collisions receive a unique fallback. Email/password signup still requires phone/nickname.
3. Invalid identity/challenge and inactive accounts are rejected; existing-email conflicts return 409 without linking or changing the existing account. New doctor/clinic/admin registration is not accepted through this endpoint.

**Dependencies:** Google web client ID, google-auth-library, existing MemberService/JWT/session infrastructure, sparse unique indexes, and later browser integration that passes the nonce and cookie. GOOGLE_CLIENT_SECRET is unused by this ID-token flow.
**Estimate:** 6 person-hours for implementation; verification effort is separately allocated to S02-02.
**Recorded outcome:** Backend implemented October 15 in commit `c20b395`; browser Google button, explicit account linking, and live provider verification remain pending.

## Top item 2 — S02-02: Authentication verification

**Description:** Exercise the real Google token-verification library using locally signed RSA tokens and a substituted public-key fetch, with simulated persistence. Check normal session issuance/rotation and retain existing member/appointment regressions.

**Acceptance checks:**

1. Invalid signature/audience/issuer/expiry, missing or mismatched browser nonce, expired challenges, and wrong token types are rejected without leaking credentials/provider payloads.
2. Concurrent first logins resolve to one identity; name collisions and absent phone/email fields are handled; inactive accounts and email conflicts do not receive an unauthorized session.
3. Google sessions use the existing refresh behavior, secure production nonce cookie settings are checked, and build/type/lint plus relevant HTTP/unit suites complete with recorded outcomes.

**Dependencies:** S02-01, test-only signing keys and key-fetch substitution, model substitutes, and permission for localhost test listeners.
**Estimate:** 3 person-hours; no additional automated-testing allowance is hidden in S02-01.
**Recorded outcome:** October 15 implementation checks passed: build, full TypeScript checking, 100 HTTP tests across five suites, and 6 unit tests across three suites. Lint retained only the pre-existing empty `src/libs/config.ts` warning. Counts describe the whole checked suites, not 106 new OAuth tests. These checks were not rerun while writing this sprint document.

## Ordered task breakdown

| Order | Task / item | Owner | Estimate | Dependency or likely blocker | Recorded result |
| --- | --- | --- | --- | --- | --- |
| 1 | Inspect reference OAuth and current auth contracts; define provider boundary (S02-01) | Me | 1h | Preserve existing authentication requirements | Completed October 15 |
| 2 | Implement Google verification and browser nonce binding (S02-01) | Me | 2h | Package download and client configuration | Completed October 15 |
| 3 | Implement account lookup/creation, optional phone, nickname retries, and session reuse (S02-01) | Me | 3h | Unique indexes and conflict handling | Completed October 15 |
| 4 | Add fixtures/cases and run backend checks (S02-02) | Me | 3h | Localhost listener permission; external dependencies substituted | Passed October 15; live integration pending |
| 5 | Update README, architecture flow/integration status, and scoped product mapping (S02-03) | Me | 2h | Avoid claiming complete frontend integration | Updated October 15 |
| 6 | Add local mistake lookup and active sprint delivery tracking (S02-04) | Me | 1h | Preserve closed sprint and logging rules | Completed October 15 |

## Proposed asynchronous check-ins

These are proposed message formats, not claims that check-ins occurred:

- **After backend verification — completed / next / blockers:** Google API and automated checks / review browser integration tasks / Google UI wiring and live provider/database verification remain open.
- **Before sprint closure — completed / next / blockers:** backend delivery and documentation recorded / carry S02-05 through S02-07 into the next sprint discussion / confirm capacity, origins, test database, and review availability.

## Definition of done and remaining acceptance

- [x] Backend acceptance has recorded automated results and traceable source paths.
- [x] Build, full TypeScript check, HTTP/unit tests passed in the implementation session; lint limitation recorded.
- [x] Google backend changes are present in the checkout at commit `c20b395`.
- [x] README, architecture, and product gap map distinguish backend completion from incomplete browser support.
- [x] Verified delivery is recorded in this sprint and the [AI collaboration log](AI_LOG.md).
- [ ] Peer review, or a clearly recorded self-review if a peer is unavailable.
- [ ] User-visible acceptance: complete Google sign-in from a browser and arrive at an authenticated dashboard using a real application session.
- [ ] Integration acceptance: verify persistence/uniqueness against a suitable MongoDB test database with no real patient data.

Browser acceptance is manual because provider consent, configured origins, browser cookie behavior, and actual navigation are not established by local token fixtures. Real database checks are separate from the simulated-persistence suite. Until those checks are recorded, full website OAuth completion remains open even though the selected backend implementation is delivered.

## Evidence and continuation

- Backend entry points: `src/components/member/member.controller.ts`, `member.service.ts`, `member.module.ts`; verification adapter: `src/components/auth/google-auth.service.ts`.
- Contracts/data/tests: `src/libs/dto/member/member-auth.dto.ts`, `src/schemas/member.model.ts`, `test/member-auth.e2e-spec.ts`.
- [README Google flow](../README.md#google-sign-in-rest), [backend architecture](../docs/architecture/architecture-backend.md), and [feature-to-story gap map](../docs/product/gap-map.md).
- Preserve Sprint 01's October 1–8 record. After implementing and verifying future features/fixes, update the matching active sprint; report a missing period instead of appending to an expired sprint. No new backlog implementation was performed while creating this record.

**Decision to explain without AI:** Mark backend Google authentication as delivered while keeping the browser story incomplete, because passing server tests does not establish a working end-to-end website flow.
