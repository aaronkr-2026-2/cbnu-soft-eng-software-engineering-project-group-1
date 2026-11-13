# Email verification implementation plan — FI-08

Date — November 12, 2026 (Asia/Seoul)

Status — **In progress**. Step 1 policy and contract design completed November 12,
2026. Step 2 completed November 13 after real SMTP delivery and owner-confirmed
inbox receipt. Step 3 backend enforcement completed locally November 13. Steps 4–5
remain pending. The contract below is the implementation baseline.
Owner-specified rules and selected engineering defaults are identified explicitly.

Roadmap — [Future improvements](FUTURE_IMPROVEMENTS.md#fi-08--email-verification--in-progress)

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
| Nice to have — included | Branded HTML email with logo and plain-text fallback, requested November 13 |
| Optional — later | Configurable provider adapters |
| Deferred | Existing-account verification campaign, email changes, MFA, SMS and password recovery (FI-03) |

## Current implementation and prerequisites

Paths are relative to the named worktree root.

- Backend work belongs to branch `backend` in `.worktrees/backend/`.
  `backend/src/components/member/member.service.ts` currently creates ACTIVE
  accounts only after consuming verified email proof in a replica-set transaction,
  then issues access/refresh credentials.
  `backend/src/libs/dto/member/member-auth.dto.ts` requires `emailVerificationToken`.
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
  Step 2 verified real SMTP authentication and owner-confirmed receipt.
  Step 3 used controlled SMTP stubs and disposable databases; the combined
  live-code/browser signup acceptance remains Step 5.
- Read each worktree's `AGENTS.md`, session context and relevant bug-register
  entries before implementation. Recheck current callers and installed packages.

## Step 1 policy and API contract

### Decision record

| Decision | Source |
| --- | --- |
| Gmail credentials named `GOOGLE_SMTP_USER` and `GOOGLE_SMTP` | Owner supplied |
| Escalating send blocks of 1, 3, 5 and 24 hours | Owner requested |
| Reset after 24 hours without a send attempt | Owner selected during Step 1 |
| Three resends per group, excluding the initial email, with a 24-hour maximum | Selected interpretation of the requested progression |
| Six-digit code, 10-minute code and proof lifetimes, 60-second spacing and five failed guesses | Selected defaults from the initial plan |
| Existing-account and Google compatibility, IP limits, storage and recovery rules below | Engineering defaults selected in Step 1 |

### Registration policy

- Apply verification to all new email/password registrations supported by the
  backend, including USER, DOCTOR and CLINIC. The current Next.js form creates USER
  accounts. Doctor/clinic approval continues to be a separate business rule.
- Let existing accounts continue their current login/refresh flow. Treat missing
  historical verification metadata as unknown. Record the actual verification
  time for newly verified emails.
- Continue Google authentication through the existing verified-claim and subject
  rules. A Google account with no verified email retains its existing behavior.
- Generate a cryptographically random six-digit code, preserving leading zeros.
  Lifetime is 10 minutes from send reservation, with a 60-second resend cooldown and at most
  five failed code guesses per challenge. Apply the escalating resend policy below
  per normalized email, plus separate per-IP limits of 10 request/resend calls and
  30 verification calls per minute. All calls count toward their IP budget.
  Start with the existing per-process middleware convention. Durable email limits
  apply across processes. A future shared IP store can support aggregate IP limits
  across multiple API processes.
- A successful resend replaces the previous challenge. Changing the normalized
  email clears the browser's challenge/proof. Server checks always bind proof to
  the normalized email submitted during signup.
- Successful code verification yields a high-entropy signup proof with a
  10-minute lifetime. Create the account only when signup consumes valid proof.
- Use the current email normalization consistently, trimming and lowercasing.
  Apply the existing DTO email validator and 254-character maximum. Preserve dots
  and plus tags when normalizing addresses.
- Request/resend sends the same verification message for syntactically valid
  existing and new addresses, subject to the same limits. Account existence does
  not change the request response. Signup's existing unique-contact conflicts apply
  when an already registered address attempts registration.
- The API currently observes Next's server as the peer for proxied calls, because
  `main.ts` sets no trusted proxy policy and `session-proxy.ts` forwards no trusted
  client address. Those users share the upstream IP budget. Document that initial
  limitation and verify it with two browser clients. Deployment-specific trusted
  proxy configuration requires verified topology and spoofing tests before release
  if individual forwarded-IP attribution is needed.

### Escalating resend cooldowns

Apply the requested cooldowns after repeated groups of three resends.

| Resend group | After its third accepted resend | Next permitted action |
| --- | --- | --- |
| First | Block further sends for 1 hour | Begin the next group after the block expires |
| Second | Block further sends for 3 hours | Begin the next group after the block expires |
| Third | Block further sends for 5 hours | Begin the next group after the block expires |
| Fourth and subsequent | Block further sends for 24 hours | Repeat at the 24-hour level unless inactivity resets it |

- The initial email is separate from the resend count. Within each group, enforce
  the existing 60-second minimum between accepted sends. The third resend is sent,
  then the longer block starts from its acceptance time.
- After a block expires, reset the group's resend count and retain the escalation
  level, subject to the inactivity reset below. Reopening the page, changing email capitalization, expiring a code,
  restarting the server or using another device must preserve the email's limits.
- During a send block, allow verification of the latest code until its normal
  expiry, and signup using valid proof. Return server-derived retry timing and
  show when another send becomes available in the UI.
- Count SMTP-accepted resends toward the group. An ambiguous send, including a
  crash after SMTP starts, also consumes one allowance because acceptance cannot
  be ruled out. Definitive rejection releases that allowance. Each send reservation
  starts the 60-second minimum even on rejection, preventing failure retry floods.
  Reserve requests atomically before SMTP. Finalization is idempotent and fenced
  by reservation identity so counters advance once.
- Keep send throttling independent of wrong-code attempts. Requests made while
  blocked retain the current block deadline and escalation level.
- Maximum cooldown is 24 hours. After a full 24 hours without a send attempt,
  reset escalation and group count. The next send begins a fresh cycle with its
  initial email. Evaluate reset against the previous `lastSendAttemptAt` before
  recording the current attempt. An active block and in-flight reservation must
  both have ended before reset can apply.
- A send attempt is a valid request/resend reaching the email policy after DTO
  validation and the IP limiter. Include cooldown-blocked calls, SMTP failures and
  idempotent request retries in `lastSendAttemptAt`. Verification and signup calls
  do not change that timestamp. Blocked calls never extend `blockedUntil`.
- At exact equality with `blockedUntil`, sending becomes eligible. At exact
  equality with `lastSendAttemptAt + 24 hours`, inactivity reset becomes eligible.
  Consequently, after an uninterrupted 24-hour block, the next send starts a fresh
  cycle. Attempts made during that block can retain the 24-hour escalation level.
- Keep escalation in durable storage separate from challenge TTL cleanup. This
  reset uses elapsed UTC time and server timestamps.

### REST endpoints and DTOs

| Endpoint | Input | Successful response and effect |
| --- | --- | --- |
| `POST /member/email-verification/request` | `memberEmail`, `requestId` | HTTP 200 with opaque `challengeId`, `expiresInSeconds` and `retryAfterSeconds` after mail acceptance |
| `POST /member/email-verification/verify` | `memberEmail`, `challengeId`, six-digit `code` | HTTP 200 with `emailVerificationToken` and `expiresInSeconds` |
| Existing `POST /member/signup` | Existing signup fields plus `emailVerificationToken` | Existing HTTP 201 member/access/refresh response after proof consumption and account creation |

Request also serves as resend. Add DTOs in `backend/src/libs/dto/member/` and retain
the production whitelist/extra-field rejection. `requestId` is a client-generated
UUID v4, reused only for retries of one send action. A deliberate resend uses a new
ID. `challengeId` and `emailVerificationToken` are 32 random bytes encoded as
43-character base64url strings. `code` is a string matching exactly six ASCII digits.
Signup requires `emailVerificationToken` for every email/password member type.

Return `Cache-Control: no-store` on every response. Success bodies contain only the
listed fields. Durations are integer seconds, rounded up from server timestamps.
Request retries with the same email/request ID return the still-current accepted
challenge and remaining durations without sending, extending expiry or incrementing
the resend group. A retry while its send is pending returns retry timing. A retry
after expiry or supersession asks for a fresh request ID.

| HTTP status | Allowlisted `reason` | Recovery |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Correct malformed/missing input |
| 400 | `EMAIL_VERIFICATION_INVALID` | Correct the code or request a fresh challenge for expired, superseded, mismatched or used credentials |
| 400 | `EMAIL_VERIFICATION_ATTEMPTS_EXHAUSTED` | Request a new code when sending becomes available |
| 400 | `EMAIL_VERIFICATION_REQUIRED` | Complete verification before signup when proof is absent |
| 429 | `EMAIL_VERIFICATION_THROTTLED` | Wait `retryAfterSeconds`, also supplied in the `Retry-After` header |
| 503 | `EMAIL_VERIFICATION_UNAVAILABLE` | Retry the same request ID after the supplied delay if a send outcome is uncertain |
| 409 | Existing `USERNAME_TAKEN` with `field` equal to `memberNick` | Change/check username and retry signup with valid proof |

Preserve other existing signup conflict responses. Use generic safe messages and
an allowlisted reason rather than exposing provider exceptions or account lookup
results. Missing signup proof gets the dedicated required marker, while other
missing or malformed fields use `INVALID_REQUEST`. Exact error creation belongs
to the affected DTO/controller path, keeping global validation behavior intact.
Every send error with a temporary wait includes `retryAfterSeconds`. An accepted
third resend returns the long-block duration in its successful response as well.

### Persistence and failure handling

- Keep verification records separate from members and sessions. Store normalized
  email, opaque challenge identity, a keyed code hash, expiry, failed-attempt count,
  send cooldown/counters and delivery state. Persist resend group count, escalation
  level and `blockedUntil` in the email's durable send-limit record. Store only a
  hash of the signup proof. Derive a code-hashing key with HMAC-SHA-256 from the
  existing `JWT_ACCESS_SECRET` and the fixed label `medconnect:email-code:v1`.
  HMAC a canonical tuple of purpose, normalized email, challenge ID and code.
  Compare hashes with a constant-time comparison. Existing JWT key validation
  requires at least 32 bytes. Key rotation expires outstanding code challenges
  naturally through failed validation. Proofs use SHA-256 of their random token,
  with their email binding and expiry stored alongside the hash.
  Keep codes, proof tokens and SMTP credentials out of logs and
  profile responses.
- Enforce expiry in queries as well as through TTL cleanup. Update attempt counts,
  cooldown reservations and challenge/proof transitions atomically across processes.
  Retain send-limit counters and escalation state independently of challenge TTL
  cleanup. Serialize concurrent sends against the same email's cooldown state.
- Confirm code validity and transition to verified state atomically. Cover two
  simultaneous correct submissions and invalid guesses racing the final attempt.
  Persist `verifiedAt`, one proof hash and proof expiry on the winning transition.
  Serialize the active-challenge check and verification with resend promotion by
  conditionally writing the same send-limit version in the transaction. A stale
  active-challenge read alone cannot authorize verification after supersession.
  A resend invalidates the prior code. Previously issued proof remains valid until
  its own expiry or consumption. The UI clears its proof on deliberate resend.
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

### Storage, transaction and delivery design

| Planned collection | Required storage and indexes |
| --- | --- |
| `member_email_send_limits` | One unique normalized email, initial-send flag, group count, next block level, `blockedUntil`, `nextSendAt`, `lastSendAttemptAt`, active challenge ID and a versioned pending-send lease |
| `member_email_verifications` | Unique challenge ID, unique email/request-ID pair, code hash, creation/code expiry, attempts, delivery state, verification time, proof hash/expiry, consumption state and cleanup time |

Use a 30-second pending-send lease and a 10-second overall SMTP deadline, with
bounded DNS/connect/greeting/socket timeouts. Keep SMTP outside transactions.
The send-limit row serializes reservation/finalization and active-challenge changes.
Create the reservation and staged challenge atomically. Keep the prior active
challenge until accepted or ambiguous delivery promotes the replacement. Definitive
rejection preserves that prior challenge. An expired lease is conservatively
finalized as ambiguous once. Late callbacks only update their matching reservation.
Email delivery can remain uncertain after a timeout, so SMTP retry is always an
explicit new action or recovery of the same request ID.

Request retries can recover the same accepted/ambiguous current challenge without
another email. Return its original challenge ID and remaining lifetime, allowing
the user to enter a code that arrived despite a lost response. After definitive
rejection, retrying the same ID repeats the safe failed outcome and next-send timing.
A fresh send action uses a fresh ID. Expired code records remain available through
their proof lifetime and a 24-hour request-id recovery window. Use `cleanupAt` TTL
with explicit validity queries. Retain durable send-limit rows until policy-aware
cleanup can prove inactivity reset eligibility and absence of pending sends.

Use the members model's database connection and a bounded MongoDB transaction to
conditionally consume proof, insert the member and persist `emailVerifiedAt`.
Hash the password and validate static fields before opening the transaction.
Run database-dependent role validation with the transaction's session. Abort rolls
back both proof consumption and insertion. Create refresh credentials only after
commit through the existing session flow. A consumed proof cannot create another
account, and an uncertain commit/credential response directs the client to login.
Use replica-set transactions with snapshot reads, majority writes and bounded retry.
The existing booking transaction infrastructure supplies a pattern to inspect,
without adding a dependency from member authentication to booking services.

Create/verify the new collections and indexes explicitly in the implementation's
storage setup command and readiness check, following the existing username storage
pattern. The command name and implementation belong to Step 3. Existing members
retain absent verification timestamps. Missing transaction support or storage
prerequisites makes email registration return a safe unavailable response.

The inspected MediBridge `apps/medibridge-batch/src/batch.service.ts` uses
Nodemailer, Gmail authentication and the authenticated sender address for reminders.
Adopt that transport pattern with this project's key names, bounded calls and
sanitized errors. Verification state stays in the Nest member/auth feature.
SMTP behavior is documented by [Nodemailer](https://nodemailer.com/smtp).
Multi-document commit/rollback behavior is documented by
[MongoDB](https://www.mongodb.com/docs/manual/core/transactions/).

### Storage setup and operations

From the backend worktree's `backend/` directory, after selecting the intended
MongoDB replica-set/sharded database and configuring the existing JWT/SMTP settings:

```bash
npm run build
npm run member:email:storage -- --check
# Explicitly create only the two verification collections and their indexes:
npm run member:email:storage -- --apply
npm run member:email:storage -- --check
```

The default invocation is read-only readiness checking, equivalent to `--check`.
Apply creates collections with simple collation and creates the required indexes;
it does not rewrite members or backfill historical verification times. Complete the
existing username migration separately. Missing collections/indexes or transaction
support yields safe `EMAIL_VERIFICATION_UNAVAILABLE` responses for verification and
email registration, while existing login/refresh/Google behavior is preserved.
No setup/apply command has been run against the application database in Step 3.

`npm run test:email:integration` builds and runs the owned disposable MongoDB runner
without loading `.env`. The runner creates/removes its own replica set, standalone
fixture and temporary files. SMTP is stubbed; this command sends no real mail.
The suite uses explicit future clocks rather than replacing database/driver timers.

For uncertain send responses, retry the same email/request ID. After a pending lease
expires, recovery counts it once as ambiguous and returns the still-current challenge.
A deliberate resend requires a fresh ID. After a lost signup response or credential
issuance failure, try ordinary login: account/proof commit precedes session creation.
Coordinate deployment with Next.js Step 4; old signup clients lack required proof.

### Signup callers and Next.js mapping

| Reviewed path | Required implementation change |
| --- | --- |
| `backend/src/components/member/member.controller.ts` and `member.service.ts` | Add request/verify delegation and authoritative proof enforcement before member creation |
| `backend/src/libs/dto/member/member-auth.dto.ts` | Add proof field and request/verify DTOs with existing normalization |
| `backend/src/components/member/member.module.ts` | Wire mail/verification providers, models and separate verification endpoint budgets |
| `backend/test/member-auth.e2e-spec.ts` | Adapt successful signup fixtures and add missing-proof enforcement cases |
| `backend/test/member-username.integration-spec.ts` | Obtain valid proof in signup helpers, including concurrent normalized-username conflicts |
| `backend/test/booking-policy.integration-spec.ts` | Verify the doctor email in its API-only onboarding fixture |
| `next/pages/auth.tsx` and `next/components/auth/AuthPage.tsx` | Keep route composition and add form verification state/actions |
| `next/libs/api/auth.ts` | Add request/verify transport and typed proof in `SignupInput` |
| `next/libs/api/session.ts` | Preserve exact verification reason and bounded retry seconds through `SessionError` |
| `next/libs/server/session-proxy.ts` | Allowlist two new actions/response shapes and forward signup proof |
| `next/tests/booking.test.cjs` and `next/tests/username-check.test.cjs` | Cover proxy fields/errors, USER enforcement and username-conflict compatibility |

The current tracked tree contains `backend` and `next`. The older `frontend/src/`
paths mentioned in historical instructions are absent from this checkout and HEAD.
The tracked signup call search identified the Next auth flow and the three backend
test files above. Swagger/manual REST clients must adopt the new proof field when
Step 3 updates the contract.

Add fixed proxy actions `email-request` and `email-verify`, mapped respectively to
`email-verification/request` and `email-verification/verify`. Forward only the
declared DTO fields and validate success responses. Verification responses use
their own shapes rather than `tokenResult`, and they set no session cookies.
Preserve same-origin checks, request headers, fixed upstream URL, no-store and
redaction. Browser requests keep the existing 15-second timeout and upstream calls
the existing 12-second timeout. SMTP's shorter deadline leaves time for cleanup.
Keep request IDs and signup proof in component memory. Use the same request ID
when explicitly retrying an uncertain send, and generate a fresh ID for Resend.
Expose only allowlisted error reason/retry metadata through the bridge. Clamp
valid retry durations to 1–86400 seconds, and preserve the existing username marker.
After reload, the next explicit request obtains authoritative retry timing if
sending is blocked. Re-render timing from a deadline, not an assumed interval count.

### Executable acceptance matrix

Backend EV-01–EV-10 are exercised by the Step 3 disposable MongoDB/API suite and
existing authentication/username/booking regressions. Their evidence is recorded
below. EV-11–EV-13 remain pending for Steps 4–5.

| ID | Runner/fixture | Required observation |
| --- | --- | --- |
| EV-01 | DTO/HTTP tests with production validation | Normalization, leading-zero codes, malformed/extra fields, required proof and all role inputs |
| EV-02 | Clock-controlled policy tests plus real MongoDB conditional writes | 60 seconds and 1/3/5/24-hour boundaries, initial email, third accepted resend, group reset and 24-hour cap |
| EV-03 | Same clock/storage fixtures | 24-hour inactivity reset, exact equality, blocked attempts update activity without extending block, verify/signup leave send activity untouched |
| EV-04 | Real disposable MongoDB with two service instances | Restart/case/device persistence, delayed TTL cleanup, concurrent reservations and exactly-once counter updates |
| EV-05 | Controlled SMTP stub and lease clock | Accepted, definite rejection, timeout, crash and late callback recovery, prior-code preservation and same-ID retry without duplicate send |
| EV-06 | HTTP plus real MongoDB race tests | Five wrong guesses exhaust a challenge, only one concurrent verification wins, fifth failure versus correct code serializes safely |
| EV-07 | Clock-controlled code/proof tests | Exact code/proof expiry, superseded code, wrong-email binding, lost verification response and valid proof during send blocks |
| EV-08 | Replica-set signup transactions | Competing signup/proof use yields one account, duplicate username/phone/license rolls back proof consumption, database failure rolls back member insertion |
| EV-09 | Fault injection after commit/session issuance | Uncertain signup response or failed credential creation supports ordinary login and cannot duplicate registration |
| EV-10 | Backend authentication regression suite | Existing account login/refresh, verified Google email, Google with no email, account status, doctor affiliation and approval rules |
| EV-11 | Next proxy/API tests | Fixed paths, field/response allowlists, retry metadata, USER role, exact conflict markers, same-origin rejection and credential exclusion |
| EV-12 | Browser against real Nest/disposable MongoDB | Email edits, expired proof, stale responses, resend timing/reload, retained form values, two proxied clients sharing upstream IP limits |
| EV-13 | Real Gmail and agreed recipient/browser | SMTP authentication, actual code receipt, successful signup/login/refresh, keyboard and mobile journey |

Use existing focused suites and the owned disposable-MongoDB runner where suitable.
Add meaningful transaction/race coverage for this new boundary. Provider stubs and
clock fixtures must remain distinguishable from real inbox/browser acceptance.

## Delivery steps and acceptance

Implement one agreed step at a time. After each step, record actual verification
and provide its manual commit message. The owner handles staging, commits and pushes.

### Step 1 — Finalize the policy and contracts

**Location** — backend worktree, this plan and the shared roadmap.

Completed November 12, 2026. Reviewed the actual Next-to-Nest signup/session flow,
Google claim handling, member storage, peer-IP limiter, signup test callers and
MediBridge's Gmail transport. Finalized the decision record, API/DTO/error shapes,
key derivation, transactional proof consumption, SMTP recovery, proxy mapping and
EV-01–EV-13 acceptance matrix above. The owner selected the 24-hour inactivity reset.
Other engineering choices are recorded as selected defaults for implementation.

**Acceptance** — policy decisions, tracked signup callers and the executable-check
matrix are recorded. Local document links, source references, step/status consistency
and whitespace are checked before handoff. SMTP credential location, authentication,
recipient availability and deployed proxy topology remain runtime verification
items for Steps 2 and 5.

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

**Delivery checkpoint — November 12, 2026**

- Added EmailDeliveryService to MemberModule and Nodemailer `^10.5.0` with bundled
  TypeScript declarations. Configuration is checked on invocation. Sends use the
  authenticated sender, a validated single recipient, plain text, TLS/certificate
  validation, bounded timeouts and an active-send AbortSignal at 10 seconds.
- Added safe delivery failure outcomes for later reservation handling. SMTP
  diagnostics and provider exception payloads are excluded from application output.
- Backend build, full TypeScript, 96 unit tests including 19 focused mail cases,
  and all 222 API tests passed. Lint reports the existing empty-config warning.
- Read only the two SMTP settings from the main checkout's private `.env` for a
  real Gmail connection check. TLS/authentication passed. Initial sandbox DNS
  restrictions were resolved by approved network execution. Runtime processes must
  receive the keys through their own environment or working-directory `.env`.
- November 13, 2026 — the owner selected the configured sender inbox. One test
  email sent through the compiled EmailDeliveryService was accepted by Gmail.
  The owner confirmed inbox receipt on November 13. Step 2 acceptance is complete
  for the mail provider, authentication and real delivery.
- November 13 presentation follow-up — the owner approved revised welcome copy
  and requested a styled email. Added a responsive HTML table layout, branded
  inline logo, blue heading and prominent code box with a matching plain-text
  fallback. Packaged the existing project logo as a backend asset and extended
  the mail assertions. Build/full TypeScript, changed-file lint and 19 focused
  mail tests passed. Gmail accepted one styled email to the requested recipient.
  Gmail rendering awaits recipient review, and browser preview was unavailable.

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
MongoDB. Execute EV-01–EV-10 and the recorded existing-account/Google policy.

**Delivery checkpoint — November 13, 2026**

Backend implementation complete locally. Added native verification collections,
explicit storage setup/readiness CLI, request/confirmation DTOs and scoped error
handling, separate 10/30 per-minute IP budgets, durable email policy, keyed code
hashes, lease recovery/fencing and atomic proof consumption/member insertion.
All email/password roles require proof. Existing login/refresh/Google policy and
approval rules remain intact; historical verification timestamps remain absent.
Updated successful signup callers in authentication, username and doctor-onboarding
fixtures. No application database setup, environment/provider changes or deployment
were performed. No sprint covers November 13; closed Sprint 05 is preserved.

Verification evidence is recorded in Progress below. Next.js integration and the
full real-inbox/browser signup journey remain Steps 4–5. The existing Next signup
form is temporarily incompatible with this backend contract until Step 4.

**Manual commit** — `feat(backend): require email verification for signup`

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
responses. Show server-derived long-block retry timing after reload on the next
explicit send request. Execute EV-11–EV-12.
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
- Step 1 policy/contracts completed November 12, 2026, including the owner's
  24-hour inactivity-reset choice and the reviewed acceptance matrix.
- Step 2 mail provider implemented November 12, 2026. Build/typecheck, 96 unit and
  222 API checks passed, and real Gmail SMTP authentication passed. On November 13,
  Gmail accepted one test email to the owner-selected configured sender inbox.
  The owner confirmed inbox receipt on November 13, completing Step 2.
- Step 3 backend implementation completed locally November 13. Backend EV-01–EV-10
  verification passed: build/full TypeScript; 96 unit, 222 API, 46 new email
  integration, 18 username integration and 193 booking integration tests. Lint has
  only the existing empty `config.ts` warning. Steps 4–5 and
  EV-11–EV-13 remain pending. FI-08 remains In progress.

### Step 3 verification evidence — November 13, 2026

- EV-01: production global validation plus scoped DTO tests check normalization,
  exact response fields, no-store, malformed/extra fields, leading zeros and required
  proof for USER/DOCTOR/CLINIC. Real verified USER/CLINIC creation and doctor API
  onboarding retain role/location/approval rules.
- EV-02–03: controlled clocks with real conditional writes check 60-second spacing,
  every 1/3/5/24-hour boundary, initial versus resend counting, group reset/cap,
  blocked activity without deadline extension and exact 24-hour inactivity reset.
- EV-04–05: independent service instances and controlled delivery check same/different
  concurrent requests, durable state after restart/challenge cleanup, accepted,
  rejected/NOT_SENT/ambiguous outcomes, pending retries, lease recovery exactly once,
  stale callback fencing and recovery without a second send. Crash is simulated by
  an abandoned reservation, not a process-kill rehearsal.
- EV-06–07: replica-set transactions check five guesses, concurrent correct
  confirmation, fifth failure versus success, verification versus resend, email
  binding, supersession, exact expiry, proof expiry/replay, key rotation and usable
  code/proof during send blocks. Previously issued proof survives resend.
- EV-08–09: real member uniqueness/transactions check competing signup, rollback for
  username/phone/license conflicts, rollback after insertion failure, inactive/missing
  clinic validation and ordinary login/refresh after committed account creation loses
  its credential response.
- EV-10: 222 API regressions preserve existing login/refresh, account-status, Google
  verified/no-email and role behavior. 18 username and 193 booking integration tests
  pass with real verification-aware signup fixtures. A historical email account can
  login/refresh while verification indexes are missing, without metadata backfill.
- 46 email integration tests pass; the compiled read-only storage CLI and standalone
  rejection are checked. SMTP is controlled in these tests; no fresh Gmail or Google
  provider call/browser acceptance is claimed. Disposable runners removed their data
  and processes. Initial local-socket sandbox denial was resolved through authorized
  local test execution. TypeScript/test-fixture corrections are recorded in B-022.
