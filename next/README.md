# MedConnect Next.js

<p align="center">
  <img src="public/logo.png" alt="MedConnect logo" width="480" />
</p>

Patient discovery, authentication, profile editing, booking, and waitlist journeys
use the Pages Router, MUI, and the shared blue/green SCSS palette. This is the
project’s frontend application; the legacy React/Vite setup has been removed.

## Setup

Use Node.js 20.9+ and the pinned Yarn 4.18.1. The installed stack is Next.js 16.4.1,
React 19.3.1, TypeScript 5, and MUI 9. Enable Corepack if necessary, then run from
the repository root (or the Next worktree root):

```bash
cd next
yarn install
yarn dev
```

Open [localhost:3000](http://localhost:3000). Yarn uses `node_modules` and the
committed `yarn.lock`; do not generate npm/pnpm lockfiles here.

Configure the existing ignored `.env.local`:

```dotenv
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:3333/graphql
NEXT_PUBLIC_API_URL=http://localhost:3333
API_URL=http://localhost:3333
# Optional public Google Web client ID
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Run the updated **backend branch** separately: the backend copy in this worktree
may lack these contracts. Allow `http://localhost:3000` in backend `CORS_ORIGINS`
for browser GraphQL calls. `API_URL` is the server-side Nest REST base; it falls
back to `NEXT_PUBLIC_API_URL`, then the GraphQL URL without its final `/graphql`.
Only intentionally public URLs/client IDs belong in `NEXT_PUBLIC_*` settings.
Restart development, or rebuild production, after changing public configuration.

A Next server is required for `/api/session/*`; static export alone cannot support
authentication. Production needs HTTPS for Secure HttpOnly session cookies, and
the frontend/API URLs must be reachable from their respective browser/server
contexts. Preserve the public Host/Origin through a trusted reverse proxy.

The account deletion review requires backend Step 2 (`587e5ed`), including
`accountDeletionReadiness`. Closure requires explicit agreement and a fresh zero-blocker
check, then confirms deletion and completes browser sign-out. See the
[frontend account deletion record](../docs/architecture/architecture-next.md#account-deletion-review--november-14-2026).

## Screens

- `/`: responsive landing page, searchable clinic directory, doctor previews,
  care guide, My Care links, and illustrative appointment art. The hero art is sample content.
  Desktop/mobile navigation shows My Care after sign-in. Staff see Workspace after
  sign-in. The hero banner and shared footer identify the service as helping people currently in
  South Korea find clinics and doctors.
- `/clinics`: server-paged clinic cards, clinic-name/city/specialty search, sorting,
  name suggestions and doctor previews, with filters/page preserved in the URL.
- `/doctors`: server-paged approved doctor cards, full-name search, clinic-city/
  specialty filters, A–Z/Z–A sorting, name suggestions and **View times** links.
  Committed filters/page live in shareable URLs; typing commits after300ms or Enter.
- `/auth`: email/password sign-in, patient signup with email ownership codes,
  resend timing, password visibility controls, validation, and optional Google sign-in.
- `/mypage`: authenticated private profile, inline Save/Cancel editing, optional
  current/new/confirm password fields, and square photo cropping/upload/removal.
  USER, DOCTOR and CLINIC accounts can review deletion blockers and cancel permitted
  bookings/waitlists, agree to closure and delete their account with sign-out recovery.
- `/account-deleted`: public confirmation after confirmed closure and browser sign-out.
- `/book`: clinic, doctor, specialty, visual month calendar and real 30-minute slot
  selection; review and immediate appointment confirmation or waitlist enrollment.
- `/appointments`: patient-scoped paginated visits/history, status filters,
  fresh details, cancellation, and replacement links.
- `/waitlist`: patient-scoped paginated entries, status filters, queue position,
  consent/details, withdrawal, and replacement links.
- `/notifications`: private patient inbox with unread filtering/count, explicit read
  markers, and current appointment/waitlist/slot checks.
- `/workspace`: clinic/doctor day and seven-day calendars with live revision polling;
  clinic doctor-application reviews, schedule replacement drafts, phone/walk-in
  booking for existing patients, cancellation and completion/no-show controls.

The two directories use public `searchDoctors`/`searchClinics` and their name
suggestion queries, with12 results per page and actual matching totals. They share
URL controls, removable filter chips, result states and centered pagination. Refresh and Back/Forward restore
committed controls; explicit choices add history and debounced typing replaces it.
Loading/error/retry/empty states and clear filters are included. Suggestions require
two trimmed characters and fail independently of ordinary search.

Homepage and ordinary booking clinic choices still use public `getDoctors`
(at most100 active approved doctors) and resolve unique clinics via `getMember`.
Those choices remain capped; explicit booking links can resolve their target through
public lookup. Clinic doctor previews/selection use public `getClinicDoctors`
(at most100 per clinic), so a clinic outside the global doctor cap has a working
team preview. `/clinics` itself has no first100-doctors discovery restriction. Directory
requests omit credentials, disable caching, support cancellation, and time out.
There are no sample clinic/doctor records. Ratings remain labeled placeholders;
doctor profile pages are pending. Cards reuse established image fallbacks. Doctor and clinic card
photos use a1:1 region; uploaded paths resolve against the API origin. My Page
lets members position/zoom a square crop before Save changes uploads it.

Booking and waitlist screens require a patient account. Client guards provide UI
behavior; Nest enforces identity, roles, ownership, availability and conflicts.
Times explicitly use the clinic's IANA timezone (with labeled UTC fallback if
metadata cannot be loaded), rather than the browser timezone.

Waitlists target an occupied exact doctor/time at least 48 hours ahead, require
explicit automatic-booking consent, and reserve no appointment. Inside 48 hours,
openings require manual booking. Server responses determine availability and
whether enrollment is enabled. **Automatic booking remains paused by the backend
release gate**; these screens do not enable the worker or notification delivery.
Booking, enrollment and replacement flags default off in the backend and need
its documented migration/release prerequisites before operators enable them.

The booking calendar adapts MediBridge's month header and seven-column day grid.
Previous/next navigation does not change the selected date. Dates before today in
the clinic timezone and all Saturdays/Sundays are disabled. New bookings and
waitlists are restricted to Monday–Friday by the backend. Arrow keys move by day/week, Home/End move within a week, Page
Up/Down change month, and Enter/Space select. Choosing another date clears the old
time selection and loads that day's slots. No calendar dependency was added.

Structured conflicts offer Keep and server-authorized Replace choices, showing
both commitments. All four appointment/waitlist replacement directions send one
atomic `replaceCommitment` mutation. Appointment-to-waitlist replacements require
an additional acknowledgement that a confirmed visit is forfeited. Stale versions
require a fresh review; failed replacements keep and reread the original.

Writes are not automatically retried. After a lost response, the UI checks the
owned current record, or compares patient-owned target records with IDs read
before the request. An unresolved result blocks further writes on that screen
and offers read-only checks/My Care. A negative lookup is not permission to replay
the mutation. No slot is reserved merely by selecting it.

## Sessions and Google sign-in

The same-origin `/api/session/[action]` bridge forwards allowlisted authentication
inputs to Nest login/signup/refresh/Google and email-verification endpoints. It requires same-origin JSON
POSTs and a custom header, disables caching, and stores rotating refresh tokens
in HttpOnly SameSite=Lax cookies scoped to `/api/session` (Secure in production).
JavaScript receives only the public member summary and access token. Tokens never
enter localStorage, sessionStorage, serialized props, or shared patient caches.

`libs/auth-session.ts` keeps access tokens in memory, restores the session after
reload, and refreshes before expiry. Per-tab serialization and supported Web Locks
coordinate session requests; BroadcastChannel events contain no tokens. The bridge
briefly coalesces concurrent refreshes within one Next process. Nest remains
responsible for rotation and its fixed session expiry; the cookie does not extend
that lifetime. Transient refresh failure preserves the cookie and offers retry;
invalid sessions return to sign-in. Sign-out clears browser session state/cookies;
there is no backend logout/revocation endpoint. If sign-out cannot reach the Next
server, its HttpOnly cookie cannot be cleared until connectivity returns.

Google obtains its signed nonce through this bridge, which retains the backend
nonce binding in an HttpOnly cookie and forwards only that cookie at Google login.
Use the same public Web client ID in frontend and backend `GOOGLE_CLIENT_ID` and
register the frontend origin in Google's Authorized JavaScript origins. The SDK
passes the nonce and ID token to Nest; Google tokens never authorize booking.
Nonce expiry, rejected credentials, and SDK failures are recoverable. Real Google
account login has not been verified in this step.

Patient signup requests a six-digit email code, confirms it, and submits the returned
single-use proof with account details. Wrong/expired codes, exhausted guesses and
send outages have recoverable messages. Retry send reuses an uncertain request ID;
Send new code uses a fresh ID. The backend supplies 60-second and escalating
1/3/5/24-hour waits. Codes and proof expire after 10 minutes; changing the normalized
email or switching form mode clears verification. Temporary code/proof/request ID
stay in form memory and never create a session. Username conflicts retain the form
and valid proof; only completed signup starts a session.

Run the backend's explicit verification storage setup on a replica set and configure
its private Gmail settings, as described in the
[email verification contract](../backend/EMAIL_VERIFICATION_PLAN.md#storage-setup-and-operations).
Next receives no SMTP credentials. Request/verify routes set no session cookies.
Proxied clients currently share the Next server's upstream IP budget (10 code
requests and 30 confirmations per minute per API process); forwarded-IP attribution
needs a verified deployment configuration. A reload retains no proof, and the next
explicit send obtains authoritative cooldown timing.

Local acceptance passed with a real Gmail code, browser signup, subsequent login
and reload/refresh against disposable MongoDB. Failure/race tests use stubbed mail
separately. Application-database setup and coordinated deployment remain unverified;
see [FI-08 release preparation](../backend/EMAIL_VERIFICATION_PLAN.md#coordinated-release-preparation).

Patient signup remains `USER` only. Doctor/clinic registration UI is pending.
Successful profile password changes clear the browser session and require login;
Nest handles password verification and credential invalidation. Private profile
contact/password fields are separate from public discovery projections.

## Code and checks

Routes compose feature components under `components/`; GraphQL documents live in
`apollo/user/`, transport/session helpers in `libs/`, and booking types in `types/`.
`pages/_app.tsx` initializes sessions and loads the global theme/styles;
`_document.tsx` uses MUI's Pages Router Emotion SSR integration. Feature SCSS is
forwarded through `styles/sections/features/_index.scss`. Reuse brand variables in
`styles/variables.scss`; focus outlines and responsive rules remain beside features.

```bash
yarn typecheck
yarn test
yarn build
# Serve the production build
yarn start
```

Webpack is intentional: earlier Turbopack workers hit local port restrictions and
development Emotion hydration differences in this environment.

Step 9 verification (October 31, 2026): typecheck and production build passed;
26 Node tests cover profile behavior, session bridge/cookies/CSRF, directory
contracts, conflict normalization, timezone display and mutation transport.
All 18 executable GraphQL documents validate against the real API schema.
Chrome used actual Nest services and a disposable local MongoDB replica set with
synthetic records: booking, all four replacement directions, Keep/Replace
conflicts, competing-target failure preserving the original, waitlist details and
withdrawal, inside-48-hour disabled enrollment, refresh after reload, and sign-out
surviving reload passed. A local proxy dropped committed booking/cancellation
responses; read reconciliation recovered both without replaying writes. A 390px
layout and keyboard slot selection/review/confirmation passed.

This is local integration evidence, not deployment verification. Google login,
production TLS/proxy/multi-instance behavior, timed natural access-token expiry,
and live profile image/storage/password flows were not exercised here. Clinic
notification UI is delivered in Step 11 below; the promotion
release gate remains closed pending controlled rollout. No frontend sprint covers October 31; no sprint was
created. See [Next architecture](../docs/architecture/architecture-next.md).

Calendar follow-up (October 31): typecheck, all 29 Node tests and production build
passed. Three calendar tests cover weekday rows/leap years, month-end/year rollover,
and date-only day movement. Chrome with a synthetic API fixture verified past-date
blocking, keyboard month-boundary selection, month navigation retaining selection,
weekend selection, clearing a stale time, correct waitlist review date, and a 390px
layout. This UI follow-up did not repeat Step 9's real Nest/database acceptance.

## Clinic and doctor workspace (Step 10)

Sign in with an existing CLINIC or DOCTOR account and use **Workspace** in desktop
or mobile navigation. Patients/admins cannot use this workspace. Nest scopes every
private read/write; a doctor has only their own read-only schedule, without clinic
staff controls. Doctor/clinic registration forms remain separate future work;
clinic onboarding here reviews existing pending doctor affiliation applications.

The day view or seven days starting on the selected clinic-local date show current
appointment status/source, with doctor filtering for clinics. Cards open a fresh
owned detail read; clinics can cancel confirmed future appointments and record
COMPLETED/NO_SHOW after the end. Confirmation checks the record/version again.
Compact card times share the workspace timezone; details label their clinic timezone.
The client resyncs its date window if authoritative clinic timezone context changes.

`myCalendar` pages are buffered with the same revision and published together.
A later-page conflict discards partial results and restarts, with bounded retries.
`calendarUpdates` checks the same authorized window about every five seconds;
changed revisions load a full snapshot. Errors retain a visibly stale snapshot and
back off up to 30 seconds; hidden/offline tabs pause, and returning/reconnecting
forces a full resync. No SSE/WebSocket deployment support is assumed. Calendar
snapshot limits remain 100 per page/5,000 per window; choose day view or a doctor
when the backend asks for a narrower window. Polling observes committed changes;
it never replays a booking mutation.

Clinic controls use `myClinicDoctors` (first 100 active records), pending application
approve/reject, and complete weekly/date override replacement mutations. The API
has no saved-hours read query, so schedule forms are explicitly blank replacement
drafts, require acknowledgement/review, and never imply they loaded current hours.
Weekday split intervals, half-hour boundaries, custom hours, full/partial closures,
and clearing overrides are supported. Weekend custom hours cannot reopen a date. A public effective-slots preview helps inspect
the result; Nest protects working hours needed by bookings/waitlists.

Phone/walk-in creation requires an existing active patient ID, approved doctor,
specialty and fresh available slot; clinic identity comes from Nest authentication.
There is no patient-account creation/search shortcut. Writes require a review and
are never automatically retried. Lost appointment/affiliation responses offer owned
read checks. A lost schedule-write response cannot be verified as saved configuration
through the current API: the UI explains that limit and blocks further local writes.

Step 10 verification (October 31): typecheck, production build, all 41 Node tests,
and 26 executable operations against the real API schema passed. Chrome used real
Nest services and a disposable MongoDB replica set: clinic calendar, approval,
weekly replacement, date closure, phone/walk-in creation, completion/cancellation,
failed hours removal preserving existing commitments, doctor-only view, patient
denial, and mobile/keyboard details passed. A committed phone response was dropped;
read reconciliation found one booking. A controlled proxy outage marked the prior
calendar stale; automatic recovery included missed online and WAITLIST-source
bookings once each. That promotion used the real worker with a fixture-only enable
hook, matching backend tests; the release gate/production flags remain unchanged.
Foreign-clinic reads exposed no records, and a doctor's foreign-doctor scope was
forbidden. A real 150-record, two-page read with a committed later-page change
restarted and returned 150 unique records. A historical outcome fixture initially
lacked its ledger; correcting that disposable fixture made completion pass.

No deployment, application database/configuration, backend/Vite files, real provider
traffic or promotion release activation changed. Step 11 notification delivery is recorded below; Step 12 rollout remains separate. Production proxy/load/concurrency and full browser
OS-offline simulation were not verified; outage recovery used the controlled proxy.

## Patient notification center (Step 11)

Open `/notifications` using the patient care navigation or the signed-in patient
header/mobile menu. This is the configured **IN_APP** delivery surface. It uses
`myNotifications`, `getNotification`, `notificationContext` and
`markNotificationRead`; patient identity is derived by Nest, never a URL/input.
There are no email/SMS/push preferences that can suppress required booking notices.
The existing backend delivery/lifecycle workers must be configured by operators;
this UI does not enable them. Backend Step 12 replaces the former hard-coded
block with validated activation prerequisites; see the local acceptance below.

The inbox shows delivered records, server unread count, all/unread filtering,
explicit Read/Unread labels and paginated history. It refreshes about every 15s
while visible/online, pauses when hidden/offline and retries transient errors with
backoff. Load more refreshes the displayed pages from the newest notice and
removes duplicate IDs; up to 1,000 notices can be displayed. No patient data enters
static props, shared caches or browser storage. Sign-out/identity changes unmount
private state. Opening a notice does **not** mark it read.

Notice text is labeled historical. Opening details fetches the current owned
appointment/waitlist/exact slot through `notificationContext`, including a checked
time and explicit clinic timezone/UTC fallback. Confirmed appointment, canceled
appointment, occupied slot and unreserved availability are distinct. During a read
outage, current-state panels and target actions are hidden until a fresh check
succeeds. A historical opening is never proof a slot remains free.

`/notifications?notificationId=<64-character ID>` opens a current check. Links to
`/appointments?appointmentId=...` and `/waitlist?waitlistId=...` perform new owned
reads even when a record is outside the list's active filter. Exact-slot links to
`/book` carry doctor/clinic/specialty/startsAt only, re-read available slots, and
select only an eligible match. A linked doctor can be resolved outside the capped
public list; current active/approved affiliation is still required. Navigation
never books automatically; the existing review/confirmation and Nest checks remain.

Mark as read is explicit and never automatically retried. A lost response offers
an owned read check (also resolvable by background reads), preserving the server's
monotonic read marker. Neither inbox filters nor read markers alter delivery or
create/cancel appointments.

Step 11 verification (November 1, 2026, Asia/Seoul): typecheck, final production
build without fixture API settings, all **50 Node tests**, and **30 executable
GraphQL operations** against the real API schema passed. Chrome with real Nest
services/disposable MongoDB verified a real promotion's required notice failing
once, retrying into the patient-visible inbox, and replaying without another
booking/notice or reset read marker. The delivery fault and worker enable hooks
were confined to that fixture; production flags/gate were unchanged.

Browser checks also covered an occupied delayed manual alert without exposing the
occupant, canceled status through an old booking notice, explicit/lost-response
read handling, unread filtering, exact specialty/time manual booking after a fresh
slot check, fulfilled-waitlist/linked-appointment deep links, mobile 390px/keyboard
opening, stale-panel suppression and recovery during a controlled API outage, and
sign-out clearing notices. Historical cutoff fixtures included both versioned
waitlists and their matching ledgers. A foreign patient context lookup was NOT_FOUND.

This is local IN_APP integration evidence. Production worker/proxy/load behavior,
real Google, full browser OS-offline behavior and rollout/migration rehearsal remain
outside this check. No backend/Vite files, application DB/configuration, external
provider traffic, deployment, staging, commit or push changed. No frontend sprint
covers November 1; no sprint was invented. Step 12 remains separate.

## Booking Step 12 — local integration acceptance (November 1)

The normal backend entry point, real MongoDB replica set and Next development
server ran together with native promotion/lifecycle/IN_APP timers enabled. Chrome
verified patient enrollment, clinic cancellation, an automatic confirmed Waitlist
appointment appearing through calendar polling, delivery of its patient notice,
fresh appointment context and explicit mark-read. The API now reports the actual
promotion setting, so the existing UI accurately distinguishes enabled and paused.
No frontend feature code changes were necessary.

Next typecheck, all 50 Node tests and production build passed. Backend build/full
TypeScript, 22 unit, 194 API E2E and 186 real-MongoDB integration checks passed,
including actual process-kill/restart, pause/re-enable, replay, backup/restore,
reviewed migration/index installation, multi-batch audit and aggregate monitoring.
The previously known status-page/assets 404 is fixed in the backend worktree.
The project owner confirmed successful Google OAuth signup; the agent did not
complete a personal Google login.

Follow the backend branch's `backend/BOOKING_ROLLOUT.md` before staging or production
activation. Only the separate local demo configuration was enabled. Production/load,
external email/SMS, full OS-offline and live profile-storage checks are not claimed.
Earlier step notes record their historical scope; this acceptance supersedes their
pending Step 12 statements. No new sprint, commit or push was created.


## Project records

- [Sprint 03](SPRINT_03.md): October 16–22 discovery, sign-in and profiles.
- [Sprint 04](SPRINT_04.md): October 23–29 integration preparation and recorded evidence gap.
- [Sprint 05](SPRINT_05.md): October 30–November 5 booking, notifications, usernames, directories and square photos; closed November 5 with release checks carried forward.
- [AI collaboration log](AI_LOG.md): implementation decisions and recorded verification.
