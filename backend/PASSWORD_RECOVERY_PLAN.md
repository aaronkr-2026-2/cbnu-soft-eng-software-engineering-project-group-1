# Forgot-password recovery implementation plan — FI-03

Date: November 16, 2026 (Asia/Seoul)

Status: **In progress. Steps 1–2 completed November 16; Step 3 completed locally
November 17, 2026 (Asia/Seoul).** Backend request delivery, atomic reset/session
invalidation and confirmation-intent delivery are implemented and verified.
Recovery remains default off behind `PASSWORD_RECOVERY_ENABLED`. Ten-minute links
and the selected email-verification send rules are unchanged. Steps 4–5 (Next UI
and combined acceptance) remain pending. No live recovery email, application
database setup or production activation/deployment has been performed.

Roadmap: [Future improvements](FUTURE_IMPROVEMENTS.md).

## Goal and scope

Recover an existing email/password account through an emailed, expiring, single-use
link, then sign in normally with the new password.

| Priority | Behavior |
| --- | --- |
| Must have | Forgot-password entry from Next sign-in, email request and reset form |
| Must have | Gmail delivery, neutral request responses and bounded abuse controls |
| Must have | Random hashed reset tokens, explicit expiry and atomic consumption |
| Must have | Password replacement and invalidation of all existing sessions |
| Must have | Invalid/expired/used links, delivery failure and concurrent reset handling |
| Nice to have — included | Branded HTML/plain-text email and accessible mobile/keyboard flow |
| Nice to have — included | Password-reset confirmation email with no password or reset token |
| Optional — deferred | CAPTCHA, alternate providers, SMS, support-assisted recovery and MFA recovery |
| Outside scope | Google password changes, provider linking, FI-08 signup policy changes and legacy Vite UI |

## Verified starting point

Paths are relative to their worktree roots. Backend application paths begin with
`backend/`; Next application paths begin with `next/`.

- `backend/src/components/auth/email-delivery.service.ts` sends FI-08 verification
  codes through Gmail/Nodemailer with bounded TLS/SMTP timeouts and sanitized
  NOT_SENT/REJECTED/UNKNOWN outcomes. Step 2 adds reset-link/password-changed methods
  using the same transport. Prior live Gmail evidence covers verification only.
- `backend/src/components/auth/member-password.ts` owns scrypt hashing and password
  checking. Signup and authenticated password updates use an 8–100-character new
  password policy; recovery should reuse it, without trimming passwords.
- `backend/src/components/member/member.service.ts` owns member/session writes.
  Authenticated password changes already increment `authVersion`; protected access
  validates that version. Login token issuance and refresh use transactions and a
  conditional write to the member, providing a fence against deletion/password races.
- `backend/src/schemas/member.model.ts` distinguishes EMAIL/GOOGLE providers,
  ACTIVE status, `deletedAt`, private password/authVersion and `emailVerifiedAt`.
  Recovery must not restore deleted/inactive accounts or convert provider identity.
- FI-08 has separate durable limits, managed collection/index readiness and a
  `backend/src/tools/email-verification-storage.ts` CLI. Reuse conventions, not its
  signup challenges, proof tokens or resend escalation state.
- Next sign-in is `next/components/auth/AuthPage.tsx` via `next/pages/auth.tsx`.
  `next/libs/api/auth.ts` uses the same-origin session bridge in
  `next/libs/server/session-proxy.ts`, exposed by `next/pages/api/session/[action].ts`.
  That bridge checks Origin/custom headers and allowlists request/response fields.
  Its existing `passwordChanged=1` message can support return to sign-in.
- Reviewed MediBridge API auth/member sources expose password comparison and login;
  no recovery implementation was identified there. Do not infer a reusable reset flow.
- Security reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
  Apply neutral responses, random single-use tokens, trusted link origins, normal
  sign-in after reset and session invalidation. Project policy values are recorded below.

## Policy and API contract

### Eligibility, tokens and links

- Eligible: existing ACTIVE, nondeleted EMAIL accounts across member roles. Do not
  require `emailVerifiedAt`: pre-FI-08 accounts also need recovery. Do not change
  that field as a side effect. Unknown, inactive, deleted and Google-only addresses
  receive the same request response and no recovery link.
- Normalize email exactly as login/signup (trim and lowercase; maximum 254). Generate
  32 cryptographically random bytes as a 43-character base64url token. Store only
  its SHA-256 digest, member ID, email snapshot, authVersion snapshot, generation,
  server-issued expiry and consumption state. Never reuse access/refresh/signup proof.
- Owner-selected link lifetime: ten minutes; `now >= expiresAt` is invalid.
  Token expiry is the earlier of reservation + ten minutes and the request's
  original ten-minute deadline, so retries never extend the recovery window.
  TTL is cleanup only. One current generation per member; a later allowed send
  supersedes the earlier generation. A failed request never changes the password,
  locks the account or invalidates login sessions.
- Add a backend-only `PASSWORD_RESET_WEB_ORIGIN`, validated as an explicit origin
  without credentials/path/query/fragment. Require HTTPS outside explicit local
  development. Build only `/reset-password#token=...`; never use Host, forwarded
  headers, client origins or a client-supplied redirect to construct email links.
- Fragment tokens stay out of HTTP request URLs. The standalone Next page captures
  the token in memory and promptly replaces browser history with the clean path.
  Refresh after removal asks the user to reopen the email. No local/session storage,
  analytics, third-party scripts or arbitrary external links on the reset page.
  Audit `_app`/layout imports before choosing that page's composition.
- Use `Cache-Control: no-store` and `Referrer-Policy: no-referrer` on reset pages/API
  responses. Link opening/GET never consumes a token; email scanners cannot reset
  an account. Only the explicit form POST can change credentials.
- Repeated link openings do not identify a particular guest and do not count as
  resend attempts. A digest identifies the same recovery link across browsers or
  devices, including forwarded copies. No visitor ID/cookie/fingerprint or click
  counter is needed. Atomic reset consumption later allows only one successful
  submission; expiry/consumed state is authoritative, not a count of page visits.

### Public endpoints

| Endpoint | Input | Success |
| --- | --- | --- |
| `POST /member/password-recovery/request` | `memberEmail`, UUID-v4 `requestId` | HTTP 202 `{ accepted: true }` |
| `POST /member/password-recovery/reset` | `token`, `newPassword`, `confirmPassword` | HTTP 200 `{ passwordChanged: true }` |

- Request UI always says: “If an eligible account exists, we’ll email a password
  reset link.” Acceptance means queued, not SMTP acceptance or inbox delivery.
  Persist requests through the same bounded path for all valid addresses; perform
  eligibility lookup and SMTP outside the response path. Do not expose account,
  provider, challenge ID, per-address cooldown or delivery outcome.
- A repeated email/request ID is one action, with no extra email or expiry extension.
  A deliberate resend uses a new UUID. Persist idempotency for at least 24 hours.
- Owner-selected send rules reuse FI-08's shared implementation: 60-second spacing,
  initial send separate, then blocks of 1 hour, 3 hours, 5 hours and 24 hours after
  each group of three resends. The block level caps at 24 hours. Reset after 24 hours
  without a send attempt, only when no block/reservation is active. Blocked attempts
  update activity but never extend the existing block deadline. Evaluate inactivity
  against the previous activity timestamp; equality with the deadline is eligible.
  Accepted/ambiguous sends count once; definite NOT_SENT/REJECTED results retain
  allowance while still applying spacing/activity, matching email verification.
  Automatic delivery retries remain bounded separately. Keep recovery counters in
  separate collections so signup and recovery cannot block each other. Suppressed
  per-address calls still return 202, including nonexistent addresses.
- Separate peer-IP limits: ten requests/minute and thirty reset submissions/minute
  before expensive work; return 429 with allowlisted Retry-After. Existing middleware
  sees Next's server as peer. Preserve that trust boundary; do not trust arbitrary
  forwarded IPs. Validate capacity for shared proxy traffic and require upstream
  client-IP protection before broad production activation. Bound queue admission and
  storage retention so random addresses cannot grow storage without limit.
- DTO validation failures return 400. All missing/expired/used/superseded/wrong-version
  tokens and ineligible members share 400 `PASSWORD_RECOVERY_INVALID`. Global storage,
  queue-capacity or configuration failure returns 503 `PASSWORD_RECOVERY_UNAVAILABLE`
  independently of account identity. No raw provider errors reach clients.
- Enforce matching 8–100-character passwords server-side and through UI validation.
  Extra fields are rejected. No standalone token-status endpoint is required.
- Extend the Next session proxy with explicit recovery actions, bounded inputs and
  response/error allowlists. Preserve Origin/header checks and no-store behavior.
  Recovery request/reset never issue authentication tokens or create refresh cookies.

### Delivery and atomic credential change

- Use a small durable recovery-specific job collection and bounded, shutdown-aware
  worker in the existing Nest process. No Redis, external queue or separate batch app.
  Do not route email through the waitlist's in-app notification delivery contract.
- Claim with an expiring lease and generation fence; generate the raw token only
  in worker memory and persist its digest before SMTP. Recheck current eligibility
  when reserving. Use at most three delivery attempts within the original ten-minute
  request window, with bounded backoff and no expiry extension.
- Retry definitive NOT_SENT/REJECTED failures within that budget, with at least
  60 seconds before another attempt. UNKNOWN outcomes are terminal: retain the
  potentially delivered token until expiry and let the user request another link
  after cooldown. An expired lease is finalized once as AMBIGUOUS at its original
  deadline, matching FI-08. Do not resend automatically after a crash: the worker
  cannot know whether SMTP accepted the prior message. A new deliberate request
  replaces the current digest when reserved. Definitive failure removes that
  attempt's digest; a retry uses a fresh generation. Slot replacement supersedes
  the earlier link even if the new delivery later fails. Fence stale completions;
  never reactivate superseded digests or persist raw tokens for retry convenience.
  SMTP does not provide an exactly-once delivery guarantee.
- MemberService exposes the credential-write operation; recovery service owns token
  and send policy. Use a transaction callback/narrow interface modeled on FI-08 to
  share one MongoDB session without a circular service dependency.
- Atomically consume the current unexpired digest, conditionally update an ACTIVE
  EMAIL/nondeleted member matching email and authVersion, write the scrypt password,
  increment `authVersion` and `__v`, delete all member sessions and invalidate all
  outstanding recovery generations/jobs. Failure rolls everything back. Treat a
  missing legacy authVersion as zero, matching existing authentication logic.
- Incrementing authVersion also invalidates links after authenticated password
  changes. Reset, profile/password saves, login, refresh and deletion must serialize
  on the member write. Do not rely on a snapshot read alone to fence those races.
- Hash passwords outside retrying transactions after cheap bounds/rate checks;
  never call SMTP inside a database transaction. A successful reset returns no
  session. Clear the browser's stale local session/cookie through existing logout
  behavior and show the sign-in success message. Other devices fail their next
  protected request/refresh; no remote-browser UI update is promised.
- Commit a token-free confirmation-mail intent with the reset. Deliver independently
  using bounded retries/deduplication; mail failure never rolls back a changed password
  or makes reset success look like failure. Lost reset responses are ambiguous:
  explain that the user can try signing in or request a fresh link; do not replay
  consumption as an authenticated success.

## Worktree ownership and implementation steps

Backend: branch `backend`, `.worktrees/backend/backend/`. Next: branch `next`,
`.worktrees/next/next/`. Read the owning instructions/current context and verify
branch/status before editing. Keep one shared plan here; do not copy source between
worktrees. Implement one agreed step, verify it, report a provisional Conventional
Commit message and stop for the owner's manual staging/commit. No commits/pushes
are authorized. Sprint 05 is closed and no Sprint 06 exists; this plan assigns no
sprint or deadline. Confirm the next period if sprint planning is requested.

### Step 1 — Finalize contracts and recovery storage

**Completed locally November 16, 2026.** New DTOs validate normalized email/UUID,
43-character tokens and matching untrimmed 8–100-character passwords. Shared
`email-send-policy.ts` and `email-rate-limit.ts` preserve existing verification rules
and provide recovery-specific limiter factories without wiring public routes.
Recovery helpers define token generation/hashing, explicit expiry and trusted links.
Native validators/indexes cover separate send limits, request jobs, one current
token slot per member and token-free confirmation jobs. No startup DDL is added.

**Place:** backend. Add recovery DTOs/types/policy/schema under existing `libs/`,
`components/auth/` and `schemas/` conventions. Add a recovery storage CLI under
`src/tools/` with explicit --check/--apply behavior, following FI-08 readiness checks.

Finalize proposed lifetime, limits, origin, generation/retry and error contracts.
Define native validators, unique digest/current-member/idempotency constraints,
lease/due/TTL indexes and bounded job retention. Keep limits separate from TTL.
Preserve no-database startup; configured recovery fails closed if managed storage
or prerequisites are missing. No public endpoint is active before readiness.

**Acceptance:** policy boundary/DTO tests, disposable replica-set storage setup,
duplicate identities/concurrent rate-row compare-and-swap and missing-index/
configuration tests; build/full TypeScript. Durable request admission and middleware
wiring are Step 2. No application DB migration or SMTP traffic.

**Actual checks:** build/full TypeScript, 122 unit tests, 222 API tests, 46 existing
email-verification integration tests and 23 recovery storage/limiter integration
tests passed (413 total). Lint has only the existing empty `src/libs/config.ts`
warning. The asset-watch/local-socket sandbox restrictions were cleared by authorized
reruns. Tests used owned disposable replica-set/standalone processes and stubbed
email. No recovery endpoint is registered and no Next files were edited.

**Commit:** `feat(backend): define password recovery contracts and storage`

### Step 2 — Implement requests, Gmail templates and delivery worker

**Completed locally November 16, 2026.** `PasswordRecoveryService` owns admission,
separate durable counters, generation-fenced claims/finalization and a nonoverlapping
shutdown-aware worker. The public request path applies the shared ten-per-minute
peer limiter before DTO validation and returns only 202 `{ accepted: true }` after
persistence. Eligibility lookup and SMTP run exclusively in the worker. Unknown,
Google and deleted accounts receive no email; virtual sends apply the same quota
policy without exposing eligibility or cooldown through the response.

A singleton admission guard serializes bounded indexed counts across processes:
at most 10,000 retained email-limit rows and 20,000 retained request jobs. Capacity
exhaustion returns safe 503 for every address before address lookup, including
idempotent retries. Worker cleanup reclaims one fully inactive, unblocked,
unreserved limit row per iteration after 24 hours; request TTL frees job capacity
separately. These are engineering caps, not measured production throughput claims.

The shared Gmail transport preserves verification delivery semantics. Reset and
password-changed templates include the CID logo, escaped HTML and plain text.
Confirmation rendering/delivery methods were delivered in Step 2; Step 3 now
implements confirmation job creation/processing alongside successful reset. Process-local metrics expose only queued
admissions, finalized attempt outcomes and worker failure counts.

**Actual checks:** build/full TypeScript, 127 unit, 222 API, 46 email-verification
and 41 recovery integration tests passed (436 total). Lint retains only the existing
empty config.ts warning. Tests cover actual controller responses/headers before
member lookup or SMTP; a broad admission latency comparison (not constant-time
proof); concurrent duplicate/distinct-address admission; caps; role/provider/status
rules; spacing/escalation; definitive/unknown failures; retry bounds; expiry; lease
restart; stale callbacks; superseding generations; no-database/configuration failure;
timer execution and shutdown. Integration SMTP and unit Nodemailer are stubbed.
The build asset-watcher restriction cleared on an authorized rerun. No application
database setup or live email was performed.

**Place:** backend `MemberController`/`MemberModule`, new recovery service/worker,
existing `EmailDeliveryService` and dedicated reset/confirmation templates.

Implement neutral request admission, durable idempotency/limits, lease recovery and
generation fencing. Extract only the transport reuse needed to preserve existing
verification-code behavior and error mapping. Add branded HTML/plain-text link and
confirmation templates, fixed trusted destination and redacted aggregate monitoring.

**Acceptance:** eligible/nonexistent/Google/deleted response equivalence; admission
latency comparison without SMTP work; shared quotas, expiry, duplicate request IDs,
worker restart, two workers, stale completion, SMTP failure/UNKNOWN and attempt bounds.
Check template escaping and URL rejection; FI-08 mail/verification regressions pass.

**Commit:** `feat(backend): deliver password recovery links through Gmail`

### Step 3 — Implement atomic reset and session invalidation

**Completed locally November 17, 2026; started November 16 (Asia/Seoul).** The real
`POST /member/password-recovery/reset` route validates matching 8–100-character
passwords, applies a separate 30/minute peer-IP budget before route work and returns
only `{ passwordChanged: true }` on success, with no authentication tokens/cookies.
Invalid token shapes/digests, expiry, consumption, supersession and account/provider/
email/version ineligibility are rejected before scrypt. Hashing occurs once outside
retrying transactions; expiry and current generation are checked again inside.

`PasswordRecoveryService.consumeReset` owns one transaction covering conditional
consumption, MemberService's credential-write callback, outstanding request/lease
cancellation, durable limit coordination and a deterministic token-free confirmation
intent. MemberService conditionally writes only an ACTIVE/nondeleted EMAIL member
matching ID/email/authVersion, sets the scrypt hash and next authVersion, increments
`__v` and deletes every member session in the same transaction. Legacy absent/null
versions are treated as zero. Concurrent profile, login, refresh, authenticated
password change and account deletion serialize through existing member writes;
reset cannot restore a deleted account. `emailVerifiedAt` is not changed.

When reset races a still-finalizing link email, its leased send allowance is counted
once before cancellation; the late SMTP callback cannot reactivate it. Queued resends
are canceled and cannot mint another token after the same reset transaction commits.
New requests admitted after commit remain legitimate new recovery attempts.

`password-recovery-confirmation.ts` uses atomic claims and lease-generation fences.
The existing worker alternates priority between link and confirmation jobs so both
make progress. Confirmation work expires after 24 hours; definitive failures retry
at most three times with 60/120-second backoff. Unknown SMTP outcomes or abandoned
leases end as FAILED (possibly delivered, not automatically repeated); stale callbacks
cannot mark them SENT. Confirmation failure never rolls back an already committed
password change. Metrics add only aggregate sent/failed counters. No schema/DDL change
was required beyond Step 2 storage.

**Actual checks:** build/full TypeScript, 127 unit, 222 API, 71 recovery integration,
62 account-deletion and 46 email-verification tests passed (528 total). Lint has only
the existing empty config.ts warning; passing integrations emit existing Mongoose
new-option deprecation notices. Real AppModule/disposable-Mongo tests prove one
concurrent winner, full rollback on confirmation persistence failure, replay/expiry/
version/email/provider/status rejection before hashing, legacy versions, queued/leased
resend cancellation, old password/access/refresh rejection, new-password login, real
login/refresh/profile/password/deletion races, and confirmation delivery/failure/
expiry/claim recovery. A synthetic commit-result failure after actual commit returns
safe 503; replay rejects rather than changing the password again. Real module IP
limiting and malformed/oversized/extra-field rejection run before hashing.

The first draft used an unavailable class-validator helper; build/TypeScript caught
it and the installed public `length` helper fixed it. The final build asset watcher
passed outside its sandbox restriction. One parallel email-verification run stalled
without a result; its verified owned runner was stopped through its cleanup handler,
then all 46 tests passed alone. Cause is unconfirmed; no application defect is claimed.
All email is stubbed, disposable fixtures were cleaned, and application data/environment,
Next code, deployment and Git staging/commits were not changed.

**Place:** backend recovery service, `MemberService`, controller and focused tests.

Implement the transaction and token-free confirmation intent described above. Reuse
password helpers and existing member/session fencing without changing signup or
Google sign-in policy. Add allowlisted recovery errors and no-store headers.

**Acceptance:** real MongoDB proves single winner for simultaneous reset, expiry
equality, rollback, supersession and email/authVersion binding. Race against login,
refresh, authenticated password/profile save and deletion. Old passwords, access
tokens and refresh tokens fail after success; new password signs in; provider/status
restrictions and legacy version-zero accounts behave correctly. Test unknown commit
outcome and confirmation-mail failure independently of password success.

**Commit:** `feat(backend): reset passwords and revoke existing sessions`

### Step 4 — Add the Next recovery flow

**Place:** Next `AuthPage.tsx`, new focused recovery components, public Pages Router
routes `/forgot-password` and `/reset-password`, API helpers/session proxy and tests.

Reuse `PasswordField`, styles and session helpers. Add forgot-password entry,
neutral request/resend feedback, explicit reset submission, password confirmation,
invalid/expired-link recovery and return to sign-in. Keep raw tokens/passwords out
of persistence, URLs after capture, error reports and browser logs. Inspect actual
layout/scripts and set response headers for the reset route.

**Acceptance:** proxy method/origin/header/field allowlists, no auth cookies on reset,
token removal, reload/reopen semantics, network failure and repeated submit, existing
signed-in session cleanup, keyboard/focus/mobile checks; typecheck, focused tests
and isolated production build. Existing email signup and Google sign-in pass.

**Commit:** `feat(next): add forgot-password and reset-password flows`

### Step 5 — Combined acceptance, operations and roadmap completion

**Place:** backend disposable tests and shared plan/roadmap; Next browser/tests and
owning documentation. Extend `test/run-booking-integration.cjs` with focused recovery
configuration instead of loading application database settings.

Run real Next proxy → normal Nest → disposable MongoDB request/email-link/reset/
login flow, worker-loop/restart checks and the race matrix above. Stub email in
automated runs. Real Gmail inbox/link/confirmation acceptance requires an explicitly
selected recipient and authorized message budget; do not email real accounts while
planning or silently reuse old FI-08 email authorization. Clean up owned fixtures.

Run backend build/full TypeScript/lint and relevant unit/API/email/account-deletion
regressions plus recovery integration; Next typecheck/tests/build and desktop/narrow
mobile keyboard acceptance. Record actual results, timing limits and unperformed
provider/deployment checks separately; do not reuse historical test counts.

Document configuration, explicit storage setup, worker ownership/retention/retry,
shared-proxy capacity, monitoring without tokens/email bodies, rollout and rollback
in existing owning docs. Maintain `docs/architecture/architecture-backend.md` and
Next architecture docs for delivered flow; README only when entry information changes.
Follow each worktree's implementation logs after verified delivery. FI-03 remains
In progress until backend, Next and agreed combined acceptance are complete.

**Commits:** `test(backend): verify password recovery lifecycle and races`,
`docs(backend): document password recovery operation and completion`; separate
`test(next)`/`docs(next)` commits only for actual changes in that worktree.

## Storage setup and operations

From `.worktrees/backend/backend/`, after building:

```bash
npm run member:recovery:storage -- --check
```

This defaults to a read-only check; `--check` never creates storage. For an explicitly
selected/authorized target database, `npm run member:recovery:storage -- --apply`
creates collections or applies their strict validators and managed indexes.
It does not rewrite existing documents or audit their historical validity. Back up
and review existing target data before applying; unique-index creation can reject
incompatible existing rows. The CLI follows existing backend MongoDB configuration;
tests invoke it against disposable URIs without loading `.env`.

Collections are `member_recovery_send_limits`, `member_recovery_requests`,
`member_recovery_tokens`, `member_recovery_confirmations` and
`member_recovery_admission`. The last collection has a seeded `global` capacity
guard. Step 2 adds that guard and the limit-activity index; a Step 1 target needs
explicit reviewed `--apply` before enabling Step 2. Request/confirmation jobs have
due/lease indexes and 24-hour cleanup retention; tokens have a unique digest and one
member-ID slot. Limit rows have no TTL; cleanup requires full 24-hour inactivity,
no active block and no reservation. It cannot erase active escalation state.

Readiness requires replica-set/sharded transactions, simple collation, strict native
validators, exact managed indexes and the admission guard. Startup never runs DDL.
Capacity rejection is an availability condition, not account-existence evidence.
Review volume/provider limits before production activation.

`PASSWORD_RECOVERY_ENABLED` accepts only `true`/`false` and defaults off. Keep it off
until Steps 4–5 and coordinated release are complete: emailed links currently target
a Next screen that is not implemented. When enabled, startup checks database/storage,
trusted `PASSWORD_RESET_WEB_ORIGIN` and existing backend-only `GOOGLE_SMTP_USER` /
`GOOGLE_SMTP` configuration before starting the worker. Disabled recovery preserves
no-database startup and returns safe 503 from the request route. No environment
file, origin, flag or credential was changed by this task.

The worker handles one job at a time, alternating link/confirmation priority,
with a one-second pause between iterations;
SMTP timeouts affect throughput. Shutdown waits for the owned in-flight attempt.
Restart recovers expired link leases as ambiguous and confirmation leases as
FAILED/uncertain without automatically duplicating email. Confirmation retry uses
at most three attempts within 24 hours; only definitive delivery failures retry.
Configuration changes normally require restart; pausing prevents new claims, while
already-started SMTP can finish. `getMetrics()` exposes process-local aggregate
counters without emails/tokens/provider payloads; no public metrics route is added.

The peer-IP limiter sees Next's upstream server for proxied traffic. Configure and
verify guest IP limits at the trusted reverse proxy before broad production use;
never trust arbitrary forwarded-IP headers. No deployable proxy configuration was
found in this backend checkout, and no hosting/proxy settings were changed/verified.
Reset submissions now have their own 30/minute peer budget and cheap token/account
checks before hashing. Trusted per-guest proxy enforcement remains a release prerequisite.

## Current verification and next action

Backend Steps 1–3 are complete locally. Live recovery SMTP/inbox delivery, Next UI
and end-to-end browser recovery remain unperformed. No sprint covers November 17;
closed Sprint 05 is preserved. Step 1 is committed as `0691c95`, Step 2 as `e1fe0e4`.
Stop after Step 3 for the owner's manual commit. Step 4 belongs to the Next worktree
and begins when requested; leave recovery disabled until coordinated acceptance.

Suggested Step 3 commit:
`feat(backend): reset passwords and revoke existing sessions`.
