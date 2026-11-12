# Email verification implementation plan — FI-08

Date — November 12, 2026 (Asia/Seoul)

Status — **Planned**. This document defines the implementation sequence and
acceptance checks. Every implementation step remains pending. Policy and API
details below are proposals to review in Step 1, with the escalating resend
cooldowns requested by the owner recorded below.

Roadmap — [Future improvements](FUTURE_IMPROVEMENTS.md#fi-08--email-verification--planned)

## Goal and scope

Require proof of email ownership before creating a new email/password account,
using a temporary code delivered through the project's Gmail account.

| Priority | Behavior |
| --- | --- |
| Must have | Gmail delivery using backend-only `GOOGLE_SMTP_USER` and `GOOGLE_SMTP` |
| Must have | Request/resend, code verification and backend enforcement during signup |
| Must have | Expiry, bounded guesses, resend limits and protected credential storage |
| Must have | Email-bound proof, atomic consumption and safe concurrent/retried signup |
| Must have | Next.js signup controls, recoverable errors and useful form preservation |
| Nice to have — included | Accessible status messages, keyboard and mobile acceptance |
| Nice to have — included | Automated failure/race checks and real inbox acceptance |
| Optional — later | Branded HTML email and configurable provider adapters |
| Deferred | Existing-account verification campaign, email changes, MFA, SMS and password recovery (FI-03) |

## Current implementation and prerequisites

Paths are relative to the named worktree root.

- Backend work belongs to branch `backend` in `.worktrees/backend/`.
  `backend/src/components/member/member.service.ts` currently creates ACTIVE
  accounts and immediately issues access/refresh credentials in `signup`.
  `backend/src/libs/dto/member/member-auth.dto.ts` validates email format.
  The current signup contract contains no email verification proof.
- `backend/src/components/member/member.controller.ts` exposes REST signup,
  login, refresh and Google authentication. `member.module.ts` wires the models,
  providers and authentication rate limiter.
- `backend/src/schemas/member.model.ts` has a unique email index and private
  password fields. Member storage also requires the existing normalized-username
  migration and startup checks. Include verification storage in the project's
  managed schema/index workflow when implemented.
- Next.js work belongs to branch `next` in `.worktrees/next/`.
  `next/components/auth/AuthPage.tsx` submits through `next/libs/api/auth.ts`,
  `next/libs/api/session.ts` and `next/libs/server/session-proxy.ts`.
  The proxy allowlists request fields and bridges HttpOnly refresh cookies.
- Google authentication validates the provider token and nonce. In
  `backend/src/components/auth/google-auth.service.ts`, email is copied only
  when Google's `email_verified` claim is true. Google subject identifies the
  account, and accounts can currently have no email.
- The owner reports that `GOOGLE_SMTP_USER` and `GOOGLE_SMTP` are configured.
  The username must identify the Gmail account that generated the app password.
  Credential values and their configuration location have not been inspected.
  SMTP authentication and real delivery remain unverified.
- Read each worktree's `AGENTS.md`, session context and relevant bug-register
  entries before implementation. Recheck current callers and installed packages.

## Proposed policy and API contract

### Registration policy

- Apply verification to all new email/password registrations supported by the
  backend, including USER, DOCTOR and CLINIC. The current Next.js form creates USER
  accounts. Doctor/clinic approval continues to be a separate business rule.
- Let existing accounts continue their current login/refresh flow. Treat missing
  historical verification metadata as unknown. Record the actual verification
  time for newly verified emails.
- Continue Google authentication through the existing verified-claim and subject
  rules. A Google account with no verified email retains its existing behavior.
  Review this compatibility choice explicitly in Step 1.
- Generate a cryptographically random six-digit code, preserving leading zeros.
  Proposed lifetime is 10 minutes, with a 60-second resend cooldown and at most
  five failed code guesses per challenge. Apply the escalating resend policy below
  per normalized email, plus per-IP request/verification limits. Final per-IP
  thresholds belong in Step 1.
- A successful resend replaces the previous challenge. Changing the normalized
  email clears the browser's challenge/proof. Server checks always bind proof to
  the normalized email submitted during signup.
- Successful code verification yields a high-entropy signup proof with a proposed
  10-minute lifetime. Create the account only when signup consumes valid proof.

### Escalating resend cooldowns

The owner requested cooldowns of 1 hour, 3 hours, 5 hours and 24 hours after
repeated groups of three resends. The counting interpretation below is a proposed
implementation detail for Step 1 review.

| Resend group | After its third accepted resend | Next permitted action |
| --- | --- | --- |
| First | Block further sends for 1 hour | Begin the next group after the block expires |
| Second | Block further sends for 3 hours | Begin the next group after the block expires |
| Third | Block further sends for 5 hours | Begin the next group after the block expires |
| Fourth and subsequent | Block further sends for 24 hours | Repeat at the 24-hour level |

- The initial email is separate from the resend count. Within each group, enforce
  the existing 60-second minimum between accepted sends. The third resend is sent,
  then the longer block starts from its acceptance time.
- After a block expires, reset the group's resend count and retain the escalation
  level. Reopening the page, changing email capitalization, expiring a code,
  restarting the server or using another device must preserve the email's limits.
- During a send block, allow verification of the latest code until its normal
  expiry, and signup using valid proof. Return server-derived retry timing and
  show when another send becomes available in the UI.
- Count SMTP-accepted resends. Definitive delivery rejection does not consume a
  successful-resend allowance. Reserve requests atomically before SMTP, and bound
  ambiguous/time-out requests separately so retries cannot bypass send controls.
- Keep send throttling independent of wrong-code attempts. Requests made while
  blocked retain the current block deadline and escalation level.
- Proposed maximum cooldown is 24 hours. Any inactivity period that resets the
  escalation back to 1 hour remains a Step 1 decision. Store escalation separately
  from expiring challenges so TTL cleanup cannot reset it accidentally.

### Proposed REST endpoints

| Endpoint | Input | Successful response and effect |
| --- | --- | --- |
| `POST /member/email-verification/request` | `memberEmail` | HTTP 200 with opaque `challengeId`, `expiresInSeconds` and `retryAfterSeconds` after mail acceptance |
| `POST /member/email-verification/verify` | `memberEmail`, `challengeId`, six-digit `code` | HTTP 200 with `emailVerificationToken` and `expiresInSeconds` |
| Existing `POST /member/signup` | Existing signup fields plus `emailVerificationToken` | Existing HTTP 201 member/access/refresh response after proof consumption and account creation |

Request also serves as resend. Return `Cache-Control: no-store` on every response.
Allowlist recoverable error markers for invalid/expired verification, exhausted
attempts and send throttling. Use HTTP 429 with retry timing for throttling and
HTTP 503 for delivery unavailability. Request responses should avoid revealing
account existence. Preserve signup's current duplicate-field handling, including
the exact username-conflict marker.

### Persistence and failure handling

- Keep verification records separate from members and sessions. Store normalized
  email, opaque challenge identity, a keyed code hash, expiry, failed-attempt count,
  send cooldown/counters and delivery state. Persist resend group count, escalation
  level and `blockedUntil` in the email's durable send-limit record. Store only a
  hash of the signup proof.
  Define the hashing key and lifecycle in Step 1 using existing secret-management
  conventions. Keep codes, proof tokens and SMTP credentials out of logs and
  profile responses.
- Enforce expiry in queries as well as through TTL cleanup. Update attempt counts,
  cooldown reservations and challenge/proof transitions atomically across processes.
  Retain send-limit counters and escalation state independently of challenge TTL
  cleanup. Serialize concurrent sends against the same email's cooldown state.
- Confirm code validity and transition to verified state atomically. Cover two
  simultaneous correct submissions and invalid guesses racing the final attempt.
- Consume proof and create the member in one transaction using the existing
  database infrastructure. A validation or duplicate-field failure rolls back
  consumption so the user can correct the form while proof remains valid.
  Unique member indexes remain the final concurrent-registration constraint.
- Keep credential issuance after successful account creation. If its response is
  lost or issuance fails after account commit, guide the user to ordinary login.
  A signup retry must resolve consistently against the committed account.
- Bound SMTP calls and handle rejected mail, timeouts and ambiguous delivery.
  Do not report inbox delivery from SMTP acceptance alone. A failed or late send
  must not erase a newer challenge or leave a permanent send lock.
- Verification requests/confirmation create no member or authenticated session.
  A lost confirmation response can recover through a fresh challenge. Client-side
  status and disabled controls complement backend enforcement.

## Delivery steps and acceptance

Implement one agreed step at a time. After each step, record actual verification
and provide its manual commit message. The owner handles staging, commits and pushes.

### Step 1 — Finalize the policy and contracts

**Location** — backend worktree, this plan and the shared roadmap.

Review existing-account and Google compatibility, six-digit codes, code/proof
lifetimes and attempt limits. Confirm the resend-group interpretation, 24-hour
maximum and any inactivity reset for the requested 1/3/5/24-hour progression.
Finalize endpoint/DTO/error contracts,
hashing-key configuration, transactional storage, delivery-failure recovery and
Next proxy mapping. Identify old signup callers and fixture updates required by
the new mandatory proof field. Review relevant MediBridge email/auth code if
adopting its patterns.

**Acceptance** — record chosen defaults and unresolved decisions, trace signup
through all callers, and map every failure/race above to an executable acceptance
check. The plan is ready for independently reviewable implementation steps.

**Proposed commit** — `docs(backend): finalize email verification contracts`

### Step 2 — Connect Gmail delivery

**Location** — backend worktree, `backend/src/components/auth/`, feature module
wiring, package/lock files and essential setup documentation.

Add a focused mail provider using the installed project's conventions and a
maintained SMTP library. Configure `smtp.gmail.com`, port 465 and TLS using the
two existing keys. Send from the authenticated Gmail address. Add a plain-text
verification message, timeouts and sanitized errors. Validate missing credentials
when the email feature is invoked. Keep SMTP configuration server-side.

**Acceptance** — check missing/invalid configuration and simulated rejection/
timeout handling, then verify real SMTP authentication. Send a test message to an
agreed recipient and confirm inbox receipt when that recipient is available.
Record real delivery evidence separately from simulated checks.

**Proposed commit** — `feat(backend): add Gmail verification email delivery`

### Step 3 — Enforce verification in the backend

**Location** — backend worktree, member controller/service/module, auth helpers,
`backend/src/libs/dto/member/`, verification schema and affected authentication tests.

Implement the finalized storage, request/resend and confirmation endpoints,
durable limits, error markers and signup proof transaction. Record verification
time and update relevant API contracts. Adapt existing signup tests/callers and
keep focused regression checks for login, refresh, Google identity and role rules.

**Acceptance** — prove missing/wrong/email-mismatched/expired/replayed proof rejects
signup before account/session creation. Test six-digit leading zeros, five failed
guesses, exact expiry, resend invalidation, 60-second spacing and every 1/3/5/24-hour
block boundary. Prove the initial-send distinction, three-resend group resets,
24-hour cap, blocked-request behavior, usable codes/proof during send blocks,
accepted/rejected/ambiguous-send counting, durable escalation and delayed cleanup,
restarts, concurrent sends/verifications/signups, duplicate-field rollback and
delivery failure recovery. Exercise transactions and uniqueness on disposable
MongoDB. Existing-account login and Google behavior follow the Step 1 decision.

**Proposed commit** — `feat(backend): require email verification for signup`

### Step 4 — Integrate the Next.js signup screen

**Location** — Next worktree, `next/components/auth/`, `next/libs/api/auth.ts`,
`next/libs/api/session.ts`, `next/libs/server/session-proxy.ts` and auth styles/tests.

Add Send code, code entry, Verify email, verified status and resend timing using
the existing form and components. Extend the same-origin proxy's fixed action,
field and error allowlists. Keep temporary proof in form memory and submit it with
signup. Clear verification when email changes, proof expires or the form mode
changes. Suppress stale responses and duplicate clicks. Preserve other form fields
and username-check behavior during correctable errors.

**Acceptance** — exercise request/verify/signup through the proxy, delivery outage,
wrong/expired code, each escalating cooldown, proof expiry, email edits and stale
responses. Show server-derived long-block retry timing after reload.
Show actionable errors and accessible status/focus with keyboard and mobile
layouts. The UI starts a session only after successful signup.

**Proposed commit** — `feat(next): add email verification to patient signup`

### Step 5 — Verify the complete flow and prepare release

**Location** — both worktrees, combined local acceptance and owning documentation.

Run appropriate backend build/type/lint/authentication checks and Next typecheck,
focused tests and production build. Use disposable data for real proxy-to-API
signup acceptance. Verify a real Gmail code reaches an agreed recipient, completes
browser signup and allows subsequent login/refresh. Cover lost responses, retries,
resend, expiry, email edits, mobile/keyboard use and existing/Google accounts.

Update the owning READMEs, architecture contracts, delivery records and this
plan/roadmap with actual results and verification limits. Match any sprint update
to its recorded dates. At planning time, the latest sprint is closed and a period
covering November 12 has not been opened.

Coordinate frontend/backend release because the new signup field changes the
required API contract. Recheck all supported signup clients and runtime SMTP
configuration before enabling the requirement in a shared environment.

**Acceptance** — record automated, disposable-stack, real inbox and browser results
separately. Mark FI-08 Completed after the agreed flow and acceptance pass, with
the actual completion date and any deployment limits.

**Proposed commits** — `test(backend): verify email signup lifecycle` and
`test(next): verify email signup integration`, adjusted to the actual final diffs.

## Progress

- Plan and FI-08 roadmap entry prepared November 12, 2026.
- Steps 1–5 pending. Implementation, SMTP authentication and inbox/browser
  acceptance remain pending.
