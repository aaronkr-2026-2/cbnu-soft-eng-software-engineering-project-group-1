# MedConnect Next.js

<p align="center">
  <img src="public/logo.png" alt="MedConnect logo" width="480" />
</p>

MedConnect’s Next.js frontend now includes a responsive root landing page built
with MUI and the existing blue/green SCSS palette. It uses the Pages Router.
The existing React/Vite frontend remains in `../frontend/`.

The manifest declares Next.js 16.4.1, React 19.3.1, TypeScript 5.x, and Yarn 4.18.1.
It requires Node.js 20.9 or newer; Node.js 24 LTS is the recommended project baseline.
The dependency versions were checked against the [Next.js registry metadata](https://registry.npmjs.org/next/latest),
[React registry metadata](https://registry.npmjs.org/react/latest), and
[Yarn release tags](https://repo.yarnpkg.com/tags).

## Install dependencies

If Corepack is unavailable, install and enable it as described in the
[Yarn installation guide](https://yarnpkg.com/getting-started/install):

```bash
npm install --global corepack
corepack enable
```

From the repository root:

```bash
cd next
yarn install
yarn dev
```

Open [the landing page](http://localhost:3000). Yarn uses `node_modules/`; the
generated `yarn.lock` is included. Do not use `npm install` for this application.

Add public API settings to your existing `.env` or `.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3333
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:3333/graphql
```

`NEXT_PUBLIC_API_URL` is the Nest REST base URL. If omitted, authentication derives
the base from the existing GraphQL URL by removing its final `/graphql` path.
`NEXT_PUBLIC_GRAPHQL_URL` is the public Nest GraphQL URL, normally
`http://localhost:3333/graphql` for local development. Only public URLs belong in
this setting. Start the backend separately and allow `http://localhost:3000` in
its `CORS_ORIGINS` (or `http://127.0.0.1:3000` when opening that host). Restart the
frontend after changing public environment variables. The page still renders
without a reachable API and shows a retry state in the clinic directory.

## Landing page

`pages/index.tsx` renders `components/landing/LandingPage.tsx`. It includes:

- Responsive header/mobile menu, hero, and clearly labeled sample appointment art.
- Three-step guide and upcoming patient-portal section.
- A searchable clinic directory and doctor-preview dialog in `ClinicDirectory.tsx`.
- Loading, empty, no-match, error, and retry states; no sample clinics are shipped.
- Section navigation, skip link, page metadata, and footer.

The browser reuses `GET_CLINICS` and `GET_CLINIC_DOCTORS` through the public-only
fetch helper in `libs/api/public-members.ts`. Requests omit cookies and tokens,
disable caching, support cancellation, and time out after ten seconds. HTTP and
GraphQL errors are normalized without exposing raw API responses. Search filters
the returned records; the backend currently limits each discovery query to 100.
Clinic timezone is displayed when supplied. Initials/icons stand in for profile
images until image URL handling is established.

The header Sign in link opens `/auth`, which switches between email/password
sign-in and patient signup in place. Booking and appointment-management screens
remain upcoming. The hero
appointment is illustrative, not a patient record or a confirmed booking. Doctor
previews do not claim live appointment availability.

`pages/_app.tsx` loads the shared styles and MUI theme. `_document.tsx` uses MUI’s
[Pages Router SSR integration](https://mui.com/material-ui/integrations/nextjs/)
to place Emotion styles in the document head. The theme uses
[native CSS color variables](https://mui.com/material-ui/customization/css-theme-variables/native-color/)
from the existing Sass-derived tokens, keeping one brand palette.

## Reusable clinic card

`components/clinics/ClinicCard.tsx` accepts a `clinic: PublicMember` and optional
`onViewDoctors(clinic)` callback. It displays `memberImage`, the clinic name,
address, and noninteractive empty stars labeled “Ratings coming soon.” Missing
or failed images use `/images/clinics/defaultClinic.png`; absent addresses show explicit fallback
text. Image values should be browser-loadable URLs or public paths. The component
does not fetch data or calculate ratings. Shared SCSS is already loaded globally.
The card is used by `/clinics`; backend ratings remain pending.

## Reusable doctor card

`components/doctors/DoctorCard.tsx` accepts `doctor: PublicMember`, optional
`clinicName` supplied by the caller, and optional `onViewProfile(doctor)`. It shows
the doctor's full name (falling back to nickname), photo, readable specializations,
optional clinic name and bio, and empty stars labeled “Ratings coming soon.”
Missing or failed photos use `/images/users/defaultUser.svg`; absent specializations
show “Specialization not listed.” Image values should be browser-loadable URLs or
public paths. The profile button appears only when its callback is provided.

The card owns presentation only; API requests and navigation stay with its caller.
Shared styles are loaded globally. It is not yet used by a route or dialog;
the doctors page and backend ratings remain pending. Typecheck/build and a
server-render smoke check passed. Visual layout, image-error transitions, and
callback interaction were not verified in a browser.

## Clinics page

`pages/clinics.tsx` composes `components/clinics/ClinicsPage.tsx`. Open
[/clinics](http://localhost:3000/clinics) or use the site's Find a clinic links.
The page reuses `useMembers` and the existing public `getClinics` GraphQL query,
rendering a responsive three/two/one-column card grid. Search matches clinic names
and addresses in the returned records. Loading skeletons, empty/no-match states,
clear-search and retry controls are included. View doctors opens the shared
`DoctorsDialog`, which calls `getClinicDoctors` for that clinic.

The existing backend returns at most 100 clinics; a notice appears when the
returned list reaches that limit. Search only covers that returned list. Backend
pagination and rating support remain pending. No sample clinics are shipped.
`components/layout/SiteHeader.tsx` and `SiteFooter.tsx` are shared with the landing
page, preserving its mobile menu and sign-in/sign-out behavior.

Typecheck/build, eight mocked rendering scenarios, and production HTTP checks for
the route, homepage links, and default image passed. Browser visual/interaction
checks were unavailable; successful live Nest/database integration is unverified.

## Sign in and patient signup

`pages/auth.tsx` composes `components/auth/AuthPage.tsx`. Sign in and Sign up switch
forms without changing the route. Non-password fields are retained when switching;
passwords, visibility state, and validation errors reset. Each password input has
an accessible eye button. Signup collects nickname, email, international phone,
password/confirmation, and optional full name; the request fixes `memberType` to
`USER` and omits confirmation. Doctor/clinic registration UI is not included.

`libs/api/auth.ts` posts JSON to `/member/login` or `/member/signup`, matching the
Nest DTOs. It omits cookies, disables caching, limits requests to 15 seconds, and
normalizes errors without exposing server payloads. Submission cannot overlap;
requests are canceled on unmount and never automatically retried. Login preserves
the backend's 1–128-character legacy password compatibility; new passwords require
8–100 characters. Patient phone numbers use the backend's international format.

After success, `libs/auth-session.ts` keeps the public member and access token in
client memory and navigates home through the Next router. The header then offers
Sign out. Reloading or access-token expiry ends this local session. Refresh tokens
are discarded; persistent sessions and automatic refresh remain pending. Local
sign-out does not revoke the server session, and client session state grants no
backend authorization. No tokens are written to browser storage or page props.

### Google sign-in

`components/auth/GoogleSignIn.tsx` now loads Google's official Identity Services
button through `libs/google-identity.ts`. Both sign-in and signup use the same
Google flow. It requests `/member/google/nonce` with credentials included, passes
the exact nonce to Google's popup client, then sends `{ idToken }` to
`/member/google/login` with the binding cookie. The Nest service verifies the token
and nonce and returns the MedConnect session. Google credentials are never used
as MedConnect API access tokens or stored by the frontend.

Configure the same public Web client ID in both applications:

```dotenv
# next/.env or next/.env.local (intentionally public)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
# backend/.env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

The matching public ID was added to this checkout's ignored `next/.env`; no client
secret was copied. Restart `yarn dev` after public settings change. Configure the
frontend origin (scheme, hostname, port) in the Google Web client's Authorized
JavaScript origins, including `http://localhost:3000` for local use, and allow it
in backend `CORS_ORIGINS`. Use the same hostname for frontend and API during local
HTTP development: `localhost` and `127.0.0.1` are different sites for cookies.
Production requires HTTPS for the backend's Secure nonce cookie; cross-site
cookie restrictions can still prevent sign-in. This popup/callback flow needs no
new redirect route and no client secret. See Google's
[setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
and [JavaScript API reference](https://developers.google.com/identity/gsi/web/reference/js-reference).

The SDK loads once and can retry failed loading. Missing configuration, script/API
failure, stale challenges, and rejected credentials show recoverable states. Idle
challenges expire from the UI after four minutes (the backend allows five); retry
obtains a fresh nonce. No One Tap or automatic account selection is requested.
Duplicate/late callbacks are ignored; password submissions and Google verification
cannot overlap. Google-account email conflicts require the original sign-in method;
accounts are not automatically linked. Both methods reuse the current temporary
in-memory session and redirect home.

Google QA: 16 mocked transport/SDK/component-lifecycle checks passed, alongside the
15 existing auth/session checks and production build/typecheck. A local preview
with a temporary nonce fixture returned HTTP 200. Chrome's preview surface did not
reliably expose the page, so official-button rendering, authorized-origin settings,
real Google login, and live Nest/database completion remain unverified.

Auth QA: typecheck/production build and 15 mocked transport/session checks passed.
Chrome checks covered same-route mode switching, independent password visibility,
validation, retained email/cleared passwords, and sign-in/signup redirects plus
local sign-out using a temporary local fixture. Desktop and 400px layouts were
inspected during email/password implementation. No real Nest/database account
creation or Google account sign-in has been exercised.

## Scripts and styling

Shared brand colors live in `styles/variables.scss`: blue `$primary` (`#014b9f`),
green `$secondaryColor` (`#1ca54c`), and `$whiteColor` (`#ffffff`). Blue and green
are representative colors sampled from the gradient logo. Stylesheets can import
them with `@use "./variables" as *;` (adjust the path for their location).
Dependencies were installed with Yarn 4.18.1, including MUI 9.5.0 and Emotion.
The Yarn warning about disabled `@parcel/watcher` build scripts did not prevent
type checking, Sass compilation, or the Webpack production build.

### Style foundation

```text
styles/
  variables.scss           # Shared Sass values, including logo colors
  _tokens.scss             # CSS custom properties derived from those values
  style.scss               # Single global stylesheet entry point
  sections/
    _index.scss            # Loads base, layout, then feature styles
    base/                  # Minimal reset, typography/focus, shared button
    layout/                # Site shell, responsive container, section spacing
    features/              # Add feature partials as screens are implemented
```

`pages/_app.tsx` imports `../styles/style.scss` once. Landing styles live in
`styles/sections/features/_landing.scss` and are forwarded by the feature index.
Use `.site-shell` around the app with a direct `<main>` child, `.container` for
centered content, `.section` for section spacing, and `.button` on semantic buttons
or navigation links. Use native `disabled` on buttons; `aria-disabled` only styles
the state and does not prevent link activation.

Add a feature partial under `sections/features/` and forward it from that folder's
`_index.scss`. Scope selectors under a feature class and keep its responsive rules
in the same partial. Use `var(--color-primary)` for normal CSS values and import
`variables.scss` with `@use` when Sass calculations are needed. Do not repeat brand
hex values in components or add a second palette. Dark mode is not implemented.

Development and production builds use Webpack. In this environment Turbopack
build workers failed to bind local ports, and its development output did not
share the Emotion SSR cache with the client, causing hydration differences.
Webpack produces the expected head styles in development and production.

| Command | Purpose |
|---|---|
| `yarn dev` | Start development (`next dev --webpack`) |
| `yarn build` | Create a production build (`next build --webpack`) |
| `yarn start` | Start the production server after building |
| `yarn typecheck` | Check TypeScript without emitting files (`tsc --noEmit`) |

### GraphQL operation structure

```text
apollo/
  user/
    fragment.ts   # Shared MemberFields and AppointmentFields selections
    query.ts      # Member/clinic discovery and appointment reads
    mutation.ts   # Appointment booking
```

Import documents directly from `apollo/user/query.ts` or `mutation.ts`.
The exports match the current Nest resolvers and DTOs:

| Export | Variables | Access |
|---|---|---|
| `GET_MEMBER` | `{ id }` | Public |
| `GET_CLINICS` | None | Public |
| `GET_CLINIC_DOCTORS` | `{ clinicId }` | Public |
| `GET_APPOINTMENT` | `{ id }` | Authenticated participant |
| `MY_APPOINTMENTS` | None | Authenticated member |
| `BOOK_APPOINTMENT` | `{ input: { doctorId, clinicId, startsAt } }` | Active USER |

IDs are MongoDB ObjectId strings. For booking, `startsAt` is an ISO 8601 string
with an explicit timezone, for example `2030-01-07T10:00:00+09:00`; the backend
enforces clinic-timezone slot alignment and derives the patient from authentication.
Member reads return the public profile fields, not credentials or contact details.
GraphQL date outputs are serialized ISO strings.

The manifest declares Apollo Client 4, GraphQL 16 (matching the backend major),
and RxJS, following [Apollo's installation guidance](https://www.apollographql.com/docs/react/get-started).
Public discovery queries are imported by the landing-page fetch helper.
All six documents, including their fragments, were validated against a schema
generated from the backend's source resolvers and DTOs using installed backend
tooling. That check was offline. Apollo Client 4.3.3 is now installed, but no authenticated
Apollo client/provider has been configured.

An authenticated Apollo client/provider, persistent sessions, token refresh, and
appointment-page integration remain pending. Email/password auth currently uses
the separate REST helper and in-memory session described above. Future appointment calls must send
`Authorization: Bearer <accessToken>` to the backend's `/graphql` endpoint.
Signup, login, Google sign-in, and refresh remain REST operations. No admin or
subscription documents are included because the backend has no such resolvers.

The default frontend port is 3000; configure the backend separately.

## Verification and limits

- `yarn typecheck` and `yarn build` passed with the declared Webpack scripts.
- The local root returned HTTP 200; both development and production HTML contain
  one main heading, valid internal anchors, and Emotion styles in the head.
- Seven mocked transport checks passed for public clinic/doctor requests, safe
  HTTP/GraphQL errors, malformed/empty data handling, and missing configuration.
- Desktop and a 400-pixel mobile layout were inspected in Chrome. Reloading the
  Webpack preview showed no fresh hydration warning; the absent API produced the
  expected directory error state. Successful clinic/doctor browser integration,
  menu interactions, and real Nest/database responses remain unverified.
- Auth exchanges were exercised against temporary fixtures; the Google SDK was
  requested by the preview. No real accounts were signed in, no bookings were made,
  and no deployment was performed.
- A lint script is not configured. No sprint record covers October 16, 2026;
  the latest recorded sprint ended October 15.
