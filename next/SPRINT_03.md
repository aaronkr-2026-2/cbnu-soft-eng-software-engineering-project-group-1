# Sprint 03 — Discovery, sign-in and personal profiles

**Period:** October 16–22, 2026 (Asia/Seoul)
**Record date:** November 2, 2026
**Status:** Retrospective review of an ended period
**Owner:** Me
**Sprint goal:** Let visitors find a care team and let members sign in and edit their personal information.

Dates match backend Sprint 03, created on branch `backend` in the same review.
This record groups evidenced delivery; it does not invent a historical sprint
agreement, measured capacity, time spent or contributor activity. Preparation in
the October 15 initial setup predates this period and is not counted as delivery here.

## Delivered scope and evidence

| Delivery | Source | Commit/date evidence |
| --- | --- | --- |
| Shared brand palette, SCSS foundation, MUI/Emotion Pages Router setup | [theme](libs/theme.ts), [app](pages/_app.tsx), [styles](styles/style.scss) | `7980451`, `0445c86`, Oct 16 |
| Public GraphQL documents and landing discovery | [documents](apollo/user/query.ts), [landing](components/landing/LandingPage.tsx) | `8cacd49`, `0445c86`, Oct 16 |
| Email sign-in/patient signup, field validation and password visibility | [auth page](components/auth/AuthPage.tsx), [password field](components/auth/PasswordField.tsx) | `59e2812`, Oct 16 |
| Google Identity Services button, nonce/credential exchange and recovery | [Google component](components/auth/GoogleSignIn.tsx) | `4960318`, Oct 16 |
| Clinic/doctor cards, directory screens and search | [clinics](components/clinics/ClinicsPage.tsx), [doctors](components/doctors/DoctorsPage.tsx) | `315d4d7`, `d54d37d`, `5deb1ea`, `8782130`, Oct 17 |
| My Page private profile, inline drafts/Save/Cancel, image selection/upload and optional password fields | [My Page](components/mypage/MyPage.tsx), [profile transport](libs/api/member.ts) | `ff78155`, Oct 19 |

Current files include subsequent changes; the commits identify this period's scope.
At period end, sessions were temporary/in-memory. Persistent refresh, patient booking,
workspace and notification screens arrived later. The main merge `d676fdf` is local
integration evidence, not production acceptance.

## Verification recorded for this period

- Landing/auth/profile typecheck and production builds passed in their sessions.
  Landing browser inspection covered desktop/400 px layouts with mocked query checks.
- Auth browser checks used a local fixture. Google SDK/transport checks substituted
  provider behavior; a real Google/Nest completion was not established then.
- My Page added 10 focused tests and validated three GraphQL documents against a
  source-generated backend schema. Fixture browser checks covered edits/cancel and
  empty password fields; real storage/password submission remained unverified.
- [AI_LOG.md](AI_LOG.md) records the individual checks. Counts from overlapping
  sessions are not summed. No historical application checks were rerun for this review.

## Prioritized continuation backlog

Stable Next backlog IDs are carried into later records. These are retrospective
follow-up priorities, not proof that a historical planning meeting selected them.

| ID | Priority / type | Item and acceptance direction | Subsequent outcome |
| --- | --- | --- | --- |
| NEXT-B07 | P1 / Integration fix | Validate discovery documents against the actual backend branch | Fixed in Sprint 05 |
| NEXT-B01 | P1 / Feature/engineering | Persistent sessions without browser token storage | Delivered in Sprint 05 |
| NEXT-B02 | P1 / Feature | Patient booking/waitlist review, lists and conflict recovery | Delivered in Sprint 05 |
| NEXT-B03 | P2 / Feature | Clinic/doctor workspace with role-scoped reads/actions | Delivered in Sprint 05 |
| NEXT-B04 | P2 / Feature | Patient notification inbox and fresh target context | Delivered in Sprint 05 |
| NEXT-B06 | P2 / Test | Real profile image/password browser acceptance | Still unverified |

**Proposed top items:** B07 accepts only executable current API documents and safe
public fields; dependency: backend schema. B01 accepts reload/refresh recovery,
HttpOnly refresh cookies and sign-out clearing private UI; dependency: Nest session
rotation and a Next server. Illustrative continuation estimates are 3 h and 6 h,
including verification; no historical hours or available capacity are asserted.

**Ordered continuation:** Me — validate contracts, then implement the session
bridge, then check reload/expiry/sign-out. Likely blockers: API drift, cookies and
proxy configuration. Proposed check-ins: after contract review and before session
acceptance, each using completed / next / blockers; no meetings are claimed.

## Review and remaining acceptance

- [x] Delivery linked to source, commits and recorded checks.
- [x] Fixture behavior distinguished from real backend/browser integration.
- [ ] Peer review and live profile storage/password acceptance recorded.
- [ ] Deployment and production cookie/provider acceptance recorded.

Manual checks are necessary for browser consent, cookies and intended storage;
a source-generated schema or fixture response alone cannot prove those boundaries.
See [Sprint 04](SPRINT_04.md), [Sprint 05](SPRINT_05.md) and the
[Next architecture](../docs/architecture/architecture-next.md). No issues were created.
