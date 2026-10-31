# MedConnect Next.js

<p align="center">
  <img src="public/logo.png" alt="MedConnect logo" width="480" />
</p>

Patient discovery, authentication, profile editing, booking, and waitlist journeys
use the Pages Router, MUI, and the shared blue/green SCSS palette. The separate
React/Vite application remains in `../frontend/`.

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

## Screens

- `/`: responsive landing page, searchable clinic directory, doctor previews,
  care guide, My Care links, and illustrative appointment art. The hero art is sample content.
- `/clinics`: clinic cards, name/address search, and doctor previews.
- `/doctors`: approved doctor cards, name/specialty search, and **View times** links.
- `/auth`: email/password sign-in, patient signup, password visibility controls,
  validation, and optional Google Identity Services popup sign-in.
- `/mypage`: authenticated private profile, inline Save/Cancel editing, optional
  current/new/confirm password fields, and image selection/upload/removal.
- `/book`: clinic, doctor, specialty, visual month calendar and real 30-minute slot
  selection; review and immediate appointment confirmation or waitlist enrollment.
- `/appointments`: patient-scoped paginated visits/history, status filters,
  fresh details, cancellation, and replacement links.
- `/waitlist`: patient-scoped paginated entries, status filters, queue position,
  consent/details, withdrawal, and replacement links.

Discovery uses public `getDoctors` (at most 100 active approved doctors), resolves
unique clinics through public `getMember`, and filters those doctors for clinic
previews. Clinics without a doctor in that returned list are absent. Search is
local to returned records; full directory pagination is not implemented. Directory
requests omit credentials, disable caching, support cancellation, and time out.
There are no sample clinic/doctor records. Ratings remain labeled placeholders;
doctor profile pages are pending. Cards reuse established image fallbacks.

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
the clinic timezone are disabled; weekends remain selectable because the API owns
working hours. Arrow keys move by day/week, Home/End move within a week, Page
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
inputs to Nest login/signup/refresh/Google endpoints. It requires same-origin JSON
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
calendar/live updates and notification UI remain Steps 10 and 11; the promotion
release gate remains closed. No frontend sprint covers October 31; no sprint was
created. See [Next architecture](../docs/architecture/architecture-next.md).

Calendar follow-up (October 31): typecheck, all 29 Node tests and production build
passed. Three calendar tests cover weekday rows/leap years, month-end/year rollover,
and date-only day movement. Chrome with a synthetic API fixture verified past-date
blocking, keyboard month-boundary selection, month navigation retaining selection,
weekend selection, clearing a stale time, correct waitlist review date, and a 390px
layout. This UI follow-up did not repeat Step 9's real Nest/database acceptance.
