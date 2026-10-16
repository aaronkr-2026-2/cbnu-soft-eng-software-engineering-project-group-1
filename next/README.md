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
cp .env.example .env.local
yarn dev
```

Open [the landing page](http://localhost:3000). Yarn uses `node_modules/`; the
generated `yarn.lock` is included. Do not use `npm install` for this application.

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

Sign-in, signup, booking, and appointment-management screens are not implemented.
The sign-in control is disabled and those flows are labeled coming soon. The hero
appointment is illustrative, not a patient record or a confirmed booking. Doctor
previews do not claim live appointment availability.

`pages/_app.tsx` loads the shared styles and MUI theme. `_document.tsx` uses MUI’s
[Pages Router SSR integration](https://mui.com/material-ui/integrations/nextjs/)
to place Emotion styles in the document head. The theme uses
[native CSS color variables](https://mui.com/material-ui/customization/css-theme-variables/native-color/)
from the existing Sass-derived tokens, keeping one brand palette.

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

An authenticated Apollo client/provider, cache/session state, token refresh, and
appointment-page integration remain pending. Future appointment calls must send
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
- No authentication or booking requests were sent. No deployment was performed.
- A lint script is not configured. No sprint record covers October 16, 2026;
  the latest recorded sprint ended October 15.
