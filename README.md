# MedConnect

<p align="center">
  <img src="next/public/logo.png" alt="MedConnect logo" width="480" />
</p>

MedConnect is a healthcare appointment platform for patients, doctors, and clinics.
It brings booking information and appointment statuses into one place, reducing
reliance on phone calls and scattered messages.

**Live site:** [MedConnect](https://cbnu-soft-group1.vercel.app/)

The backend lives in `backend/` and uses NestJS, TypeScript, MongoDB/Mongoose, and
GraphQL, with REST for member authentication and existing appointment routes.
See this README's [backend setup](#requirements-and-quick-start) and
[API documentation](#api-documentation-and-status) for backend instructions.
A React/Vite frontend lives in `frontend/`; see its [README](frontend/README.md)
for frontend instructions.
A separate Next.js frontend is being prepared in `next/` using Yarn; see its
[README](next/README.md) for setup and current limitations. Its root landing page uses MUI,
shared brand styles, and public GraphQL clinic/doctor discovery with search and
retry states. `/auth` provides email/password sign-in and patient signup in one
page, with in-memory sessions and a Google Identity Services callback flow. Booking
remains pending. Real
API/database integration is not yet verified.

## Contents

- [Existing Features list](#existing-features-list)
- [Requirements and quick start](#requirements-and-quick-start)
- [Environment configuration](#environment-configuration)
- [API documentation and status](#api-documentation-and-status)
- [Development and testing](#development-and-testing)
- [Architecture](#architecture)
- [Member authentication](#member-authentication-rest)
- [Member profiles](#get-a-user-doctor-or-clinic-member)
- [Image uploads](#image-uploads-graphql)
- [My private profile](#my-private-profile-graphql)
- [Update your member information](#update-your-member-information-graphql)
- [Appointment lookup](#get-an-appointment)
- [Clinic schedules and slots](#clinic-schedules-and-slots-graphql)
- [Appointment booking](#book-an-appointment)
- [GraphQL appointments](#graphql-appointments)
- [Appointment changes and clinic bookings](#appointment-changes-and-clinic-bookings-graphql)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)
- [Project records](#project-records)

## Existing Features list

- **Member registration and login:** REST signup for USER, DOCTOR, and CLINIC
  accounts, password hashing, input validation, and JWT access tokens.
- **Session refresh:** Rotating refresh tokens with expiry and reuse rejection.
- **Member editing:** Authenticated GraphQL `updateMember` edits your profile/contact
  fields, changes passwords with current-password verification and confirmation, and
  saves uploaded profile images. Password changes invalidate existing sessions;
  successful image replacement deletes the previous owned image.
- **Google sign-in API:** Nonce-bound Google ID-token verification, automatic USER
  registration without phone/password, Google-name or unique fallback nicknames,
  and the existing access/refresh session contract. Next.js includes the Google
  button/callback flow; successful live provider login remains unverified.
- **Authentication protection:** Authentication rate limiting and current-account
  checks for protected appointment operations.
- **Public member profiles:** GraphQL lookup for active USER, DOCTOR, and CLINIC
  members, with private contact and credential fields excluded.
- **Private current-member profile:** Authenticated `myProfile` returns your profile,
  email, phone, and `canChangePassword` for settings screens. Public queries retain
  their existing fields.
  Public clinic discovery remains available through `getClinics` and `getClinicDoctors`;
  doctor cities are derived from their current clinics in both doctor-directory queries.
- **Clinic and doctor cities:** Clinics must select a city from MediBridge’s 10-city
  `Location` enum during signup. Doctor cities are derived from their current clinic
  in auth responses and public profiles, including the doctor directory.
- **Public doctor directory:** GraphQL `getDoctors` returns up to 100 active,
  approved, nondeleted doctors, using public fields and name/ID ordering.
  Focused tests use mocked persistence; live database integration is unverified.
- **Image uploads:** Authenticated GraphQL single/batch PNG, JPEG, and WebP uploads
  for member/clinic images; up to five files, 10 MB each, with public URLs and local disk storage.
- **Clinic/doctor calendar APIs:** Authorized, paginated calendar snapshots and
  revision-based polling for committed changes. Frontend calendar work remains pending.
- **My Appointments API:** Current patients can list their own appointments with
  bounded cursor pagination and optional status/UTC date filters. Screens remain pending.
- **Appointment booking:** Authenticated USER booking through GraphQL and REST,
  creating an immediately CONFIRMED, specialty-aware 30-minute appointment. Writes
  require policy V2 activation and completed migration; disabled by default.
- **Booking validation:** Approved doctor affiliation, active clinic/doctor checks,
  clinic-timezone slot alignment, weekly working hours, date-specific overrides,
  occupied-slot checks backed by a unique active-slot index, transactional 24-hour
  spacing at one clinic/specialty across doctors, and patient overlap prevention
  across clinics/specialties. Conflicts preserve existing commitments.
- **Clinic scheduling:** Clinics list and approve/reject pending doctor affiliations,
  replace weekly working hours, and manage date-specific hours/closures through
  guarded GraphQL mutations. Edits preserve existing bookings and waitlist targets.
- **Dynamic appointment slots:** Public GraphQL queries generate clinic-local
  30-minute slots for up to 31 days, showing occupancy and allocation holds without
  patient details. Waitlist policy eligibility and flag-controlled enrollment are shown.
- **In-app notifications:** Durable waitlist notices, private paginated inbox/read APIs,
  retryable delivery and operator aggregate status. Lifecycle and delivery flags
  default off; the browser notification center remains Step 11 work.
- **Waitlists and replacement:** Patient enrollment/withdrawal with recorded consent,
  FIFO ordering and scoped reads. All four booking/waitlist replacements are atomic
  and version checked. Enrollment/replacement flags default off; the FIFO worker is implemented behind a notification-delivery release gate.
- **Appointment lifecycle:** Patients/the owning clinic can cancel confirmed visits
  before start; clinics record completion/no-show at or after the end. Repeated
  identical actions are idempotent; appointment/ledger/outbox changes are atomic.
- **Clinic bookings:** Clinics create PHONE/WALK_IN bookings for existing active
  patients using the same scheduling/conflict rules, with clinic identity from auth.
- **Appointment lookup:** GraphQL and REST retrieval for the appointment's patient,
  doctor, or clinic, with ownership checks.
- **API documentation:** Swagger UI and OpenAPI JSON for REST, plus a GraphQL
  schema and development GraphiQL interface.
- **Request logging:** HTTP and GraphQL execution logging, including timings and
  failures, without logging GraphQL arguments or response data.
- **Service monitoring:** API information, liveness and database readiness checks,
  and a public status page with manual refresh and automatic polling.
- **Frontend starter screens:** Login, registration, and a protected dashboard
  layout. Dashboard statistics and appointments currently use sample data;
  frontend/backend integration is not verified.
- **Next.js landing page:** `next/` provides a responsive root page, clinic search,
  doctor previews, a care guide, and upcoming-portal information. Public discovery
  uses existing GraphQL operations; successful real API integration is unverified.
  Booking is marked coming soon. See [Next.js setup](next/README.md).
- **Next.js clinics page:** `/clinics` displays reusable image/name/address cards,
  local search, loading/empty/error states, and doctor previews through existing
  public GraphQL queries. Ratings are marked coming soon. The current API returns
  at most 100 clinics; search covers those results. Mocked rendering and production
  HTTP checks passed; browser interaction and live backend integration are unverified.
- **Next.js doctors page:** `/doctors` renders doctor cards with name/specialization
  search, photo fallback, and loading/empty/error states. Its public `getDoctors`
  backend query is implemented; live frontend/backend integration remains unverified.
  Ratings, profile pages, and pagination remain pending. Frontend mocked checks and production page HTTP checks passed;
  browser interaction and live database integration are unverified.
- **Next.js sign-in and signup:** `/auth` switches forms in place, validates patient
  signup, provides password eye controls, and calls the existing REST endpoints.
  Client sessions stay in memory until reload/expiry; local sign-out is available.
  Google uses its official popup button and the existing cookie-bound nonce/login
  endpoints. Email/password browser flows were checked with a local fixture; real
  Google/Nest/database completion and persistent sessions remain unverified/pending.

- **Next.js My Page:** `/mypage` loads the signed-in member's private profile,
  supports inline editing with Save/Cancel, optional password changes, and image
  preview/upload/removal. Signed-in desktop/mobile navigation includes My Page.
  Requires the backend branch's `myProfile`, `updateMember`, and `imageUploader`
  operations. Backend-schema validation, focused tests, and a local browser
  fixture passed; real Nest/database integration remains unverified. Reload
  still ends the in-memory session.

Update this list whenever a new feature is added. Keep entries aligned with the
implemented behavior, and revise them when features change or are removed.

Clinics can approve doctors and configure hours through the GraphQL operations
below. Booking also requires the existing policy V2 activation/migration checks.

## Requirements and quick start

Use Node.js 24.x with npm for the backend and a reachable MongoDB instance or Atlas
cluster. The project uses Node's built-in `.env` loading. For Atlas, configure
network access and a database account before starting the API.

From the repository root:

```bash
cd backend
npm ci
```

Create `backend/.env` with the following development settings. Replace the MongoDB
URI with your connection string and the JWT placeholder with a generated secret.
Do not commit this file.

```dotenv
NODE_ENV=development
PORT_API=3333
MONGO_DEV=mongodb://127.0.0.1:27017/medconnect
JWT_ACCESS_SECRET=replace-with-a-random-secret-of-at-least-32-bytes
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

Generate a secret with `openssl rand -hex 48`, then paste it into your local `.env`.
The sample MongoDB URI requires a local MongoDB server already running.

Start the backend from `backend/`:

```bash
npm run start:dev
```

Open [Swagger](http://localhost:3333/docs) or the
[status page](http://localhost:3333/status). Examples use `PORT_API=3333`; substitute
your configured port. If neither `PORT_API` nor `PORT` is set, the default is 3000.

From the repository root, you can also run:

```bash
npm --prefix backend run start:dev
```

## Environment configuration

The backend loads `.env` from its working directory before loading application modules.

| Variable | Purpose | Default or requirement |
|---|---|---|
| `NODE_ENV` | Runtime environment | Set `development` locally; `production` on the server |
| `PORT_API` | API listening port | Falls back to `PORT`, then 3000 |
| `MONGO_URI` | Explicit MongoDB connection override | Takes precedence in all environments |
| `MONGO_DEV` | Development/test MongoDB connection | Used outside production when `MONGO_URI` is unset |
| `MONGO_PROD` | Production MongoDB connection | Used in production when `MONGO_URI` is unset; use `mongodb+srv://` |
| `BOOKING_POLICY_V2_ENABLED` | Enables confirmed specialty-aware booking | `false`; set exactly `true` only after migration on a replica set |
| `JWT_ACCESS_SECRET` | Access-token signing secret | Required; at least 32 bytes |
| `GOOGLE_CLIENT_ID` | Expected Google web client ID for sign-in verification | Required only for Google sign-in; absent configuration returns 503 |
| `UPLOAD_DIR` | Local public image storage directory | `uploads`, relative to the backend working directory; persist this directory in deployment |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:3000,http://localhost:5173` |

Startup, database connection, and feature modules share URI selection through
`backend/src/database/database.config.ts`. Production never falls back to
`MONGO_DEV`. An explicitly empty override fails startup instead of selecting an
unexpected database. Production retains the `mongodb+srv://` requirement.

## API documentation and status

REST routes have no global prefix. With the example port:

| URL | Purpose |
|---|---|
| `http://localhost:3333/docs` | Swagger UI for REST endpoints |
| `http://localhost:3333/docs-json` | OpenAPI JSON specification |
| `http://localhost:3333/graphql` | GraphQL endpoint; GraphiQL outside production |
| `http://localhost:3333/status` | Visual API and database status |
| `http://localhost:3333/` | API information as JSON |
| `http://localhost:3333/health/live` | Liveness check |
| `http://localhost:3333/health/ready` | Database readiness; 503 when unavailable |

In Swagger, click **Authorize** and enter the access token returned by login to
try protected appointment endpoints. Signup, login, and refresh do not require an
access token. Swagger covers REST; GraphQL uses its own schema. Request schemas
are generated through the Nest Swagger CLI plugin; full response schemas remain
incomplete. Restart the development server after changing `nest-cli.json`.

The public `/status` page shows API information, liveness, and database readiness,
with manual refresh and 30-second polling while visible. It exposes no patient
data or administrative controls.

## Development and testing

Run these commands from `backend/`:

```bash
npm run start:dev    # Development with watch mode
npm run build        # Compile the backend
npm run lint         # Check source and tests
npm test             # Unit tests
npm run test:e2e     # HTTP/GraphQL tests
npm run test:booking:integration # Disposable real MongoDB concurrency tests
npm run test:cov     # Unit-test coverage
```

For a compiled production run, configure the production environment first:

```bash
npm run build
npm run start:prod
```

HTTP tests use an in-memory persistence substitute with Mongoose validation;
they do not connect to Atlas or verify real MongoDB concurrency/index enforcement.

The separate booking integration command requires `mongod` on PATH, or a
`MONGOD_BINARY` path. It starts a single-member replica set and a standalone server
on dynamically selected localhost ports, runs races/rollback/retry/index checks,
then stops both and removes their temporary data. It does not load `.env` or use
the application's database. A single-member replica set is a disposable test
fixture, not a production availability setup.

`AppointmentService` uses `BookingCoordinationService` to save an appointment and
its active commitment ledger entry together under patient/doctor-slot locks.
Booking requires a replica set; it has no standalone or legacy-write fallback.
The integration command builds the backend and tests the real API, migration CLI,
conflict races, rollback, activation gates, and appointment lifecycle events.
Waitlist enrollment and atomic replacements share those transactions; FIFO promotion, cutoff lifecycle and in-app delivery workers are implemented behind default-off flags.

## Architecture

See the [backend architecture](docs/architecture/architecture-backend.md) for the
technology stack, component responsibilities, request/data flows, shared services,
integration status, logical/deployment diagrams, and documented concerns.

The MedConnect backend is organized as a single NestJS application:

```text
backend/src/
  components/
    components.module.ts
    appointment/          # controller, service, module
    auth/
      guards/             # access guard
      member-password.ts
      member-rate-limit.ts
    health/               # controller, module
    member/               # controller, service, module, resolver
    upload/               # image resolver, service, HTTP setup, module
  database/
  libs/
    dto/
      appointment/
      member/
    enum/
    interceptor/
    logger/
    types/
  schemas/                # Mongoose models
  app.module.ts
  main.ts
```

Feature filenames use the singular feature name (for example,
`appointment.service.ts`). `AppModule` imports `ComponentsModule`, which registers
feature modules. DTOs stay under `libs/dto/<feature>`. Auth helpers and guards are
located under `components/auth`; their current provider wiring stays in
`MemberModule`.
Appointment GraphQL operations share the existing service with REST routes.

## Member authentication (REST)

Set `JWT_ACCESS_SECRET` to a cryptographically random secret of at least 32 bytes
in `.env` (for example, generate one with `openssl rand -hex 48`). Keep it private
and stable across restarts. Startup rejects missing or short secrets.

- `POST /member/signup` returns 201. Required fields: `memberEmail`,
  `memberPassword` (8–100 characters), `memberPhone` (international format such
  as `+821012345678`), and `memberNick` (2–40 characters). `memberFullName` is optional.
- `memberType` defaults to `USER`. `CLINIC` additionally requires `clinicName`;
  `clinicTimezone` defaults to `Asia/Seoul`. `DOCTOR` requires `clinicId` of an
  active clinic, a nonempty `doctorSpecializations` enum array, and
  `professionalLicenseNumber`. Doctors start with `PENDING` clinic affiliation.
  Public signup cannot create `ADMIN` accounts or set approval/status fields.
- `CLINIC` signup requires `location`, for example `"location": "SEOUL"`.
  Supported values match MediBridge: `SEOUL`, `INCHEON`, `BUSAN`, `JEJU`, `DAEGU`,
  `DAEJEON`, `GWANGJU`, `ULSAN`, `SUWON`, `SEJONG`. Missing/unsupported/null values
  are rejected. DOCTOR and USER signup must omit `location`.
- Clinics own city storage. Doctors choose a clinic with `clinicId`; their `location`
  is derived from that current clinic in signup/login/refresh responses, `getMember`,
  and `getDoctors`. Changing the affiliation or the clinic's city is reflected on
  the next response without copying a city onto doctor records. Directory hydration
  uses one batched clinic query. Legacy doctor city values are ignored.
  Missing/inactive/deleted clinics and legacy clinics without a city resolve to no
  city (`null` in GraphQL, omitted in auth JSON). No data migration, workplace-change
  endpoint or browser integration is included. Clinics can edit their own city through
  `updateMember`; doctors continue to inherit it.
- `POST /member/login` accepts `memberEmail` and `memberPassword`, returning 200. Unknown accounts, wrong passwords, non-email accounts, and suspended or
  deleted accounts return the same 401 response. Email is trimmed and lowercased;
  passwords are preserved exactly.
- Both return `{ member, accessToken, refreshToken }`. Member fields are explicitly
  allowlisted; password hashes, provider IDs, phone numbers, and license numbers
  are excluded. Passwords use salted scrypt (`N=32768, r=8, p=3`).
- Access tokens are HS256 JWTs valid for 15 minutes, with issuer `medconnect`,
  audience `medconnect-api`, subject equal to the member ID, and `tokenType=access`.
  The appointment endpoint verifies these claims and current member status;
  issuing a token does not itself protect booking or other routes.
- `POST /member/refresh` accepts `{ "refreshToken": "..." }` and returns
  a new token pair and member data. Refresh tokens are opaque random values;
  only SHA-256 hashes are stored in `member_sessions`. Each session lasts seven
  days from login/signup. Refresh rotates the token atomically without extending
  that deadline; reuse and expired sessions return 401. MongoDB TTL cleanup is
  supplemented by an explicit expiry check.
- Invalid/extra fields return 400; duplicate email, phone, nickname, or license
  returns 409. Authentication responses have `Cache-Control: no-store`.
- Authentication routes share a limit of 20 requests per minute per client IP
  per API process (429 on excess). For multiple instances, use a shared rate-limit
  store; configure trusted proxies explicitly for your deployment.

HTTP tests use Mongoose document validation with an in-memory persistence substitute;
they do not connect to Atlas. Separate clinic verification, email verification,
and logout/revocation remain unimplemented; clinic-owned doctor affiliation review
is available through GraphQL. Protected booking
and appointment lookup are implemented; their prerequisites are described below.

### Google sign-in (REST)

Google sign-in uses `google-auth-library` to verify an ID token. Set
`GOOGLE_CLIENT_ID` to your Google web application's client ID and configure its
authorized JavaScript origins for the frontend. `GOOGLE_CLIENT_SECRET` is not
used by this ID-token flow; keep any configured secret server-only. No Google
API access/refresh tokens are requested or stored.

The Next.js `/auth` page implements the following Google flow. Configure matching
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` and backend `GOOGLE_CLIENT_ID` values, and register
the frontend origin in the Google Web client. Live account sign-in remains unverified:

1. Send `POST /member/google/nonce` with credentials included. It returns
   `{ "nonce": "..." }` and sets a five-minute HttpOnly nonce cookie.
2. Initialize Google Identity Services with the same client ID and the returned
   `nonce`. Its credential callback supplies the Google ID token.
3. Send `POST /member/google/login` with JSON `{ "idToken": "<credential>" }`
   and credentials included, preserving the cookie from step 1. Do not send
   phone, nickname, role, profile, or approval fields.
4. On success, the nonce cookie is cleared and the endpoint returns HTTP 200
   with `{ member, accessToken, refreshToken }`, matching existing authentication.

Google signature/audience/issuer/expiry checks and the token's nonce bind the
identity to this browser's sign-in attempt. The nonce is also a server-signed,
five-minute challenge; it cannot authorize protected appointment routes.
Production uses a Secure, host-only `__Host-medconnect_google_nonce` cookie with
`SameSite=None`; development uses `medconnect_google_nonce` with `SameSite=Lax`.
Use HTTPS in production and configure `CORS_ORIGINS` for the actual frontend.
Cross-site deployments also depend on the browser allowing the nonce cookie;
a same-site frontend/API deployment avoids third-party-cookie restrictions.

New identities become active `USER` accounts with `authProvider=GOOGLE`; phone
and password are omitted. The provider's trimmed display name supplies the
nickname (up to 40 characters) and full name (up to 100). Missing/blank names or
nickname collisions use `google_user` plus six random digits, such as
`google_user004271`, with bounded retries against the unique database index.
Verified Google email and picture are copied when supplied. Email is optional;
unverified email is not persisted. Google `sub`, not email/name, identifies the account.

Returning accounts retain their nickname/profile/role. Suspended/deleted accounts
are rejected. Matching an existing email returns 409 without automatic linking
or overwriting; a dedicated account-linking flow is not implemented. This endpoint
cannot register a new doctor, clinic, or admin. Email/password signup still
requires phone and nickname.

Errors: 400 for invalid/extra input; 401 for invalid credentials, missing/mismatched/
expired nonce, or inactive accounts; 409 for account conflicts or exhausted
nickname retries; 503 for missing Google configuration or recognized provider
network/server failures. Both Google endpoints share the existing auth rate limit
and return `Cache-Control: no-store`.

Automated tests use locally signed tokens and a substituted public-key fetch to
exercise the real verification library with simulated persistence. Actual Google
browser sign-in and MongoDB uniqueness races have not been integration-tested.

## Get a User, Doctor, or Clinic member

Public GraphQL lookup of one active `USER`, `DOCTOR`, or `CLINIC` by MongoDB member ID
at `POST /graphql`, without an access token:

```graphql
query GetMember($id: ID!) {
  getMember(id: $id) {
    _id
    memberType
    memberStatus
    memberNick
    memberFullName
    memberImage
    memberAddress
    memberDesc
    clinicId
    clinicName
    clinicTimezone
    doctorClinicStatus
    doctorSpecializations
    location
  }
}
```

Variables: `{ "id": "<member-id>" }`. Doctor profiles include their clinic ID,
affiliation status, and specializations; clinic profiles include their name and
timezone. Both expose optional `location` as a GraphQL `Location` enum. Optional
GraphQL fields return `null` when absent. This lookup does not
require approved doctor affiliation; check `doctorClinicStatus` before offering
booking. It does not populate the related clinic or list a clinic's doctors.

Responses allowlist profile fields, excluding email, phone, password hashes,
license numbers, and authentication provider IDs, with `Cache-Control: no-store`.
Malformed IDs return `BAD_USER_INPUT`. Missing, suspended, deleted, and
`ADMIN` accounts return `NOT_FOUND`. Unavailable persistence returns
`SERVICE_UNAVAILABLE`.
GraphQL application errors appear in the `errors` array with HTTP 200.

Use the `_id` returned by signup/login for an active `USER`, `DOCTOR`, or `CLINIC`.
Signup defaults to `USER` when `memberType` is omitted; those accounts are also
returned by this query. Resolver execution logs include
`MemberResolver.getMember` and `GraphQL Query.getMember` start/completion/failure
messages without logging GraphQL arguments, query text, or response data.

### Public doctor directory

Call `getDoctors` at `POST /graphql` without an access token:

```graphql
query GetDoctors {
  getDoctors {
    _id
    memberNick
    memberFullName
    memberImage
    memberDesc
    doctorSpecializations
    location
  }
}
```

Returns active, nondeleted DOCTOR accounts with `APPROVED` clinic affiliation,
sorted by full name then ID and limited to 100. Uses the same public-field
allowlist as `getMember`, excluding private contact and credential fields.
Clinic details are not populated; pagination and ratings remain pending.
GraphQL application errors use the `errors` array; responses use `Cache-Control: no-store`.

## Image uploads (GraphQL)

Adapted from MediBridge's `imageUploader` and `imagesUploader` mutations using
[`graphql-upload-ts`](https://github.com/meabed/graphql-upload-ts). Send a multipart
POST to `/graphql` with a current Bearer access token and the
`Apollo-Require-Preflight: true` header. Keep Apollo's CSRF protection enabled.

```graphql
mutation UploadImage($file: Upload!, $target: String!) {
  imageUploader(file: $file, target: $target)
}

mutation UploadImages($files: [Upload!]!, $target: String!) {
  imagesUploader(files: $files, target: $target)
}
```

Copyable single-file request (replace the token and image path):

```bash
curl http://localhost:3333/graphql \
  -H 'Authorization: Bearer REPLACE_WITH_ACCESS_TOKEN' \
  -H 'Apollo-Require-Preflight: true' \
  -F 'operations={"query":"mutation($file: Upload!, $target: String!) { imageUploader(file: $file, target: $target) }","variables":{"file":null,"target":"member"}}' \
  -F 'map={"0":["variables.file"]}' \
  -F '0=@/path/to/photo.png;type=image/png'
```

- Targets: `member` (including doctor profile images) and `clinic`.
- Allowed formats: PNG, JPEG (`image/jpeg` or `image/jpg`), and WebP. MIME types
  and file signatures are checked; this does not perform full image decoding or malware scanning.
- Limits: 10 MB per file and 1–5 files per batch/request. Failed batches remove
  files already saved by that batch; failed writes remove temporary files.
- Returned values are public relative URLs such as `/uploads/member/<member-id>/<uuid>.png`.
  The owner ID comes from authentication. Fetch them from the API origin. Original
  filenames are not used as storage paths. Older flat upload URLs remain readable,
  but cannot be newly assigned or automatically deleted without proven ownership.
- Files are stored beneath `UPLOAD_DIR` (default `backend/uploads` when started
  from `backend/`). Temporary files are hidden from static serving. Persist this
  directory across releases; object storage and deletion/retention APIs are not implemented.
- Uploading returns URLs only; Save calls `updateMember` with the new `memberImage`.
  Browser upload/profile integration is pending. Upload only public images;
  these URLs are publicly readable and are not suitable for private medical records.

## My private profile (GraphQL)

The Next.js settings page can load the current account with a Bearer access token;
no member ID argument is accepted:

```graphql
query MyProfile {
  myProfile {
    _id
    memberType
    memberStatus
    memberNick
    memberFullName
    memberEmail
    memberPhone
    memberImage
    memberAddress
    memberDesc
    clinicId
    clinicName
    clinicTimezone
    doctorClinicStatus
    doctorSpecializations
    location
    canChangePassword
  }
}
```

`myProfile: MemberSelf!` derives identity from the authenticated account and reads
fresh profile data from the database. Doctor city remains derived from the current
active clinic. Optional missing fields return `null`. `canChangePassword` is true
for EMAIL accounts and false for Google/other providers, matching updateMember's
password-change rule. The frontend can use it to show password controls; the server
still enforces the rule during Save.

Load this query when opening settings and refresh the displayed profile after Save.
`updateMember.member` returns the same MemberSelf fields, including canChangePassword,
so the frontend can also use that response immediately. Expired/revoked tokens and
inactive/deleted accounts are rejected. Responses use `Cache-Control: no-store`.
Public `getMember`/`getDoctors` do not expose email, phone, or canChangePassword.
Neither self-profile operation exposes password hashes, provider IDs, authVersion,
or tokens. Frontend wiring and live database integration were not verified here.

## Update your member information (GraphQL)

Use one authenticated mutation for profile edits and optional password changes:

```graphql
mutation UpdateMember($input: MemberUpdateInput!) {
  updateMember(input: $input) {
    member {
      _id
      memberFullName
      memberNick
      memberPhone
      memberImage
      location
    }
    requiresLogin
    imageCleanupPending
  }
}
```

Send a Bearer access token. Example variables for a profile edit:

```json
{
  "input": {
    "memberFullName": "Example Name",
    "memberPhone": "+821012345678"
  }
}
```

All fields are optional; omitted fields remain unchanged. Empty updates and explicit
`null` values are rejected. Allowed fields are `memberFullName` (1–100 characters),
`memberNick` (2–40, unique), `memberPhone` (international format, unique), `memberImage`,
`memberAddress` (up to 300), and `memberDesc` (up to 2,000). Clinics may additionally
edit `clinicName` (1–150) and `location` (Location enum). Empty address/description
strings clear those fields. Account IDs, roles/status, email/provider, clinic affiliation,
and approval fields are not editable. The authenticated account determines ownership.
Phone changes update the stored contact; SMS verification is not implemented.

To change an EMAIL account's password, include all three fields together, optionally
alongside profile edits:

```json
{
  "input": {
    "currentPassword": "your current password",
    "newPassword": "your replacement password",
    "confirmPassword": "your replacement password"
  }
}
```

The current password is verified, the new pair must match, and the new password must
be 8–100 characters. Password whitespace is preserved. Only its salted hash is stored;
confirmation/current-password values are not saved. Google-only accounts can edit
profiles but cannot set a local password here. Successful password changes increment
the member's internal authentication version: existing access tokens and refresh
sessions become unusable immediately. `requiresLogin: true` tells the frontend to
clear its local session and show login. The API does not issue replacement tokens.
Legacy credentials without a version remain valid only while the member version is zero.

Image flow: choose → validate → `imageUploader` → Save through `updateMember`.
Send the returned owner-scoped URL unchanged (`member` target for users/doctors,
`clinic` for clinics). The backend checks ownership/file existence and claims the
pending image before the database write. After successful Save it deletes only the
previously attached owned local image. An unchanged URL keeps the current image;
`memberImage: ""` removes it. External Google images and unowned legacy files are
never deleted automatically. Hidden persistent attachment markers prevent reuse of
retired URLs and are stored alongside the files; persist the entire `UPLOAD_DIR`.

Validation failures save none of the requested member fields. One conditional MongoDB
update applies profile/password changes; duplicate phone/nickname or concurrent saves
return GraphQL `CONFLICT`. Known failed saves release the new image claim for retry
and retain the old image. An unknown database write outcome conservatively retains
the claim. If old-file deletion fails after Save, the member edit stays successful
and `imageCleanupPending` is true. Unused uploads, retained markers, and cleanup retries
are left for the deferred cleanup tool; no background cleanup/retry job is implemented.

The response's `member` is an authenticated self-profile, including phone/email and
clinic-derived doctor city. Public `getMember`/`getDoctors` continue to exclude contact
and credential fields. Integration tests use real GraphQL validation, password helpers,
and filesystem writes with simulated persistence; live database/browser flows remain
unverified.

## Get an appointment

```http
GET /appointment/<appointment-id>
Authorization: Bearer <accessToken>
```

No request body is needed. The ID must be a 24-character MongoDB ObjectId.
The endpoint returns the appointment object directly, with UTC ISO date strings,
participant IDs, status, duration, change-request/cancellation details, and timestamps.
It does not populate member records or expose their credentials; responses use
`Cache-Control: no-store`.

Access is based on the authenticated member's current database role:

- `USER`: the appointment's `patientId` must match the member ID.
- `CLINIC`: the appointment's `clinicId` must match the member ID.
- `DOCTOR`: the appointment's `doctorId` must match the member ID. Another doctor
  in the same clinic cannot view it.

This route grants no ADMIN override. Missing appointments and appointments outside
these access rules both return 404. Malformed appointment IDs return 400 for
an authenticated caller. Missing/invalid/expired access tokens, missing accounts,
and suspended/deleted members return 401. Refresh tokens cannot authorize this route.
Current account status and role are checked on every request, including after a
previously valid token was issued. Existing appointments in any status can be read
by their matching participants; this endpoint does not create appointments.

## Clinic schedules and slots (GraphQL)

Schedule mutations require a current CLINIC Bearer token and a doctor approved at
that clinic. They use replica-set transactions and can be configured before
booking policy activation. Existing REST routes remain unchanged.

| Operation | Access / behavior |
| --- | --- |
| myClinicDoctors | CLINIC; up to 100 active doctors at its own clinic, including pending affiliations; public profile fields only |
| reviewDoctorAffiliation(doctorId, approve) | Owning CLINIC; approve/reject a PENDING affiliation; repeated identical decisions are harmless. Approved affiliations cannot be revoked through this operation. |
| setDoctorWeeklyHours(input) | Owning CLINIC; atomically replaces all weekly intervals; an empty list clears them |
| setDoctorDateOverrides(input) | Owning CLINIC; replaces one clinic-local date's overrides; an empty list restores weekly hours |
| getAvailableSlots(input) | Public; active clinic/approved doctor/offered specialty; inclusive clinic-local date range of 1–31 days |

For example, review a pending application and configure split Monday hours:

```graphql
mutation Review($doctorId: ID!) {
  reviewDoctorAffiliation(doctorId: $doctorId, approve: true)
}
```

```graphql
mutation Hours($input: DoctorWeeklyHoursInput!) {
  setDoctorWeeklyHours(input: $input)
}
```

```json
{
  "input": {
    "doctorId": "<doctor-member-id>",
    "intervals": [
      { "weekday": 1, "startMinute": 540, "endMinute": 720 },
      { "weekday": 1, "startMinute": 780, "endMinute": 1020 }
    ]
  }
}
```

Weekdays are 0=Sunday through 6=Saturday; intervals use minutes since local
midnight. They must be positive, aligned to 30 minutes and non-overlapping within
a day (maximum 56 weekly intervals). These split hours generate 14 complete slots;
none crosses lunch or closing time. Different doctors keep separate hours.

Date override input is `{ doctorId, date, overrides }`, with at most 16 rows.
Each row has type CUSTOM_HOURS or UNAVAILABLE and optional startMinute/endMinute.
CUSTOM_HOURS requires both limits and replaces weekly hours on that date;
UNAVAILABLE blocks its interval, or the whole date when both limits are omitted.
A single missing limit is invalid. Rows of the same type cannot overlap and all
rows need distinct start minutes, matching the existing stored schedule format.

```graphql
mutation Overrides($input: DoctorDateOverridesInput!) {
  setDoctorDateOverrides(input: $input)
}
```

```graphql
query Slots($input: AvailableSlotsInput!) {
  getAvailableSlots(input: $input) {
    doctorId clinicId specialty clinicTimezone
    startsAt endsAt state waitlistEligible canJoinWaitlist
  }
}
```

Slots input contains doctorId, clinicId, specialty, fromDate and toDate; dates are
YYYY-MM-DD in clinic time. Returns future scheduled slots as UTC timestamps.
AVAILABLE means unoccupied, OCCUPIED includes PENDING/CONFIRMED reservations, and
UNAVAILABLE indicates allocation is pending. Closed/break periods return no slots.
`waitlistEligible` describes occupied-slot policy eligibility at least 48 hours
ahead; `canJoinWaitlist` also requires WAITLIST_ENROLLMENT_ENABLED=true and booking policy V2.
No patient identity or queue membership is exposed. Availability is advisory,
not a reservation or proof that the patient passes booking conflict checks.

Schedule edits return CONFLICT if they would invalidate an existing future/in-progress
booking or active waitlist target. Resolve those commitments first; edits never
move or cancel them. Booking and schedule writes share a doctor gate, so a racing
booking cannot bypass this preservation check. Candidate generation and booking
reuse the same clinic-timezone alignment and override calculations, including DST.

## Book an appointment

```http
POST /appointment/bookAppointment
Authorization: Bearer <USER-accessToken>
Content-Type: application/json
```

```json
{
  "doctorId": "<doctor-member-id>",
  "clinicId": "<clinic-member-id>",
  "specialty": "CARDIOLOGIST",
  "startsAt": "2030-01-07T10:00:00+09:00"
}
```

The caller must be an active USER; patient identity comes from authentication.
`specialty` is required and must be a DoctorSpecialization offered by that doctor.
The API rejects client-supplied patientId, status, source, version, endsAt and
visit duration. Start must be a future ISO timestamp with an explicit timezone,
aligned to a clinic-local :00/:30 boundary. The server returns HTTP 201 with a
CONFIRMED appointment, its recorded specialty, source ONLINE, and an opaque version.

The active clinic and its active doctor must have APPROVED affiliation. Working
hours must exist in doctor_availability or doctor_availability_overrides. Weekly
hours use the clinic-local weekday; CUSTOM_HOURS replace weekly hours for that
local date, and UNAVAILABLE blocks overlapping intervals or a whole day. The
complete 30-minute slot must fit. Clinics manage approval and schedules through
the GraphQL operations above.

For the same patient, clinic and booked specialty, active commitments must start
at least 24 elapsed hours apart across all doctors. Exactly 24 hours is allowed.
Active appointments also cannot overlap across any clinic/specialty; adjacent
appointments are allowed. Appointment and ledger writes share one transaction;
the unique active doctor/start index remains a final occupancy safeguard.

REST conflicts use HTTP 409 and `booking: { reason, existingCommitments, choices }`.
COMMITMENT_CONFLICT and PATIENT_OVERLAP include only the caller's own blocking
commitment summaries (kind, ID/version, doctor/clinic, specialty, times and status).
SLOT_OCCUPIED/SLOT_UNAVAILABLE expose no other patient's details. Choices contain KEEP for own commitment conflicts and REPLACE when enabled for
one future replaceable blocker. The server revalidates every replacement. Ordinary booking never cancels or replaces an existing appointment.

Other errors: 400 for invalid input/specialty/slot or clinic/doctor relationships;
401 for invalid/currently revoked sessions; 403 for non-USER callers; 503 with
FEATURE_DISABLED or MIGRATION_REQUIRED until activation is ready. Responses are
no-store. Historical records remain participant-scoped and retain their statuses;
specialty/version may be absent until resolved/migrated, and source reads as LEGACY.
There is no arbitrary status-edit or legacy PENDING creation endpoint; supported
transitions are described below.

### Activate booking policy V2

This release defaults booking writes off, including the old booking behavior.
Reads and member/auth features remain available. Activation requires a
transaction-capable replica set, compatible clients supplying specialty, a backup,
and a maintenance window with **all old/new API and worker writers stopped**.
The CLI flag records that operational prerequisite; it cannot stop other processes.
Do not restart an older binary after activation because it ignores the ledger.
No application database migration or deployment was performed during development.

From backend/ after configuring the intended database:

```bash
npm run build
BOOKING_POLICY_V2_ENABLED=false npm run booking:migrate -- --dry-run --report /private/tmp/booking-report.json
```

Dry-run reads data without creating collections/indexes or updating records. Console
output contains aggregate counts; the optional report contains record IDs/issues
and is created exclusively with mode 0600. Use a fresh private path, keep reports
and resolution files out of Git/logs, and do not put patient/contact details in
an evidence reference. A dry-run against live writers is advisory; apply rechecks
within its transaction after writers are stopped.

PENDING records require an explicit status decision; active records need a known
booked specialty. The tool never infers it from today's doctor specialties or
silently confirms old requests. Resolve conflicts, stale active records,
participant/slot anomalies and ambiguous specialty before applying. A resolution
file is a JSON array, for example:

```json
[
  {
    "appointmentId": "<existing-appointment-id>",
    "specialty": "CARDIOLOGIST",
    "status": "CONFIRMED",
    "evidenceRef": "<review-record-reference>"
  }
]
```

Only supply decisions backed by an actual review. Historical terminal records may
retain unknown specialty. Past requests cannot be newly confirmed, future visits
cannot be marked completed/no-show, and terminal status transitions are rejected.
The tool handles at most 5000 appointments; larger datasets need a separately
reviewed batch migration. It refuses any existing waitlist records or ledger entries because this
is the initial booking migration, before waitlist rollout. Startup snapshot auditing
separately validates active queues, FIFO counters and the combined ledger.

After backup/review and stopping all writers, apply explicitly:

```bash
BOOKING_POLICY_V2_ENABLED=false npm run booking:migrate -- --apply --writers-stopped --resolutions /private/tmp/booking-resolutions.json
```

Omit --resolutions if no decisions are needed. Apply atomically backfills source,
stable versions and known specialties/statuses, records audit evidence, rebuilds
the active appointment ledger, and writes the readiness marker. Failure rolls
back all document changes; index preparation happens before that transaction.
Repeated apply preserves versions and does not duplicate unchanged audit entries.
Then set BOOKING_POLICY_V2_ENABLED=true in server configuration and restart the
new backend. Startup verifies indexes, the marker and a consistent snapshot of
legacy metadata/ledger coverage; missing prerequisites prevent activation.
Disabling the flag pauses new booking writes without reverting to old rules.

## GraphQL appointments

Appointments support GraphQL at `POST /graphql`. Signup, login, and refresh remain REST endpoints. Existing appointment
REST routes remain available and call the same service.

In Postman, use GraphQL body mode with `http://localhost:3333/graphql` (or your
configured API port). Add `Authorization: Bearer <accessToken>` and send:

```graphql
mutation BookAppointment($input: BookAppointmentInput!) {
  bookAppointment(input: $input) {
    _id
    patientId
    doctorId
    clinicId
    startsAt
    endsAt
    durationMinutes
    specialty
    source
    version
    status
  }
}
```

Variables:

```json
{
  "input": {
    "doctorId": "<doctor-member-id>",
    "clinicId": "<clinic-member-id>",
    "specialty": "CARDIOLOGIST",
    "startsAt": "2030-01-07T10:00:00+09:00"
  }
}
```

Fetch one appointment:

```graphql
query GetAppointment($id: ID!) {
  getAppointment(id: $id) {
    _id
    startsAt
    endsAt
    status
    doctorId
    clinicId
    patientId
    doctorChangeRequest {
      type
      status
      reason
    }
  }
}
```

Variables: `{ "id": "<appointment-id>" }`.

All existing booking prerequisites, current-account checks, and ownership rules
apply. For bookAppointment, patientId comes from authentication; clinic creation
uses an existing patient ID as described below. ID values
are strings; output dates are UTC ISO timestamps. Member relations are not
populated by these operations.

Inspect GraphQL's `errors` array even for HTTP 200 responses. Application errors
use codes such as `UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_FOUND`, and
`CONFLICT`. Internal error details and stack traces are not returned; response
caching is disabled. Booking conflicts additionally expose the same allowlisted
`{ reason, existingCommitments, choices }` at `errors[].extensions.booking`.
No REPLACE choice is advertised before the replacement API exists. GraphiQL is available at `/graphql` outside production.

The schema is generated from DTO decorators in memory. `AppointmentResolver`
handles GraphQL arguments/context and delegates to `AppointmentService`.
Setup follows the [Nest GraphQL guide](https://docs.nestjs.com/graphql/quick-start).

## Appointment changes and clinic bookings (GraphQL)

All three operations require a current Bearer token and verified booking migration
on a replica set. New clinic bookings also require BOOKING_POLICY_V2_ENABLED=true;
cancellation/outcomes remain available when new bookings are paused. The offline
migration procedure still requires stopping all API/worker writers.

| Operation | Allowed actor and transition |
| --- | --- |
| cancelAppointment(id) | Own patient or owning CLINIC; CONFIRMED → CANCELED strictly before start |
| setAppointmentOutcome(id, outcome) | Owning CLINIC; CONFIRMED → COMPLETED or NO_SHOW at/after visit end |
| createClinicAppointment(input) | CLINIC; existing active USER, approved own-clinic doctor; PHONE or WALK_IN source; creates CONFIRMED |

Identical repeated cancellation/outcomes return the existing result without another
release/event. Other terminal transitions conflict. Unrelated records return
NOT_FOUND; doctors/ADMIN receive no cancellation or outcome override. Changes bump
the opaque appointment version and record lastChangedBy; cancellation records
canceledAt/canceledBy. No action silently replaces another commitment.

```graphql
mutation Cancel($id: ID!) {
  cancelAppointment(id: $id) { _id status version canceledAt canceledBy }
}
```

```graphql
mutation Outcome($id: ID!, $outcome: AppointmentOutcome!) {
  setAppointmentOutcome(id: $id, outcome: $outcome) { _id status version }
}
```

```graphql
mutation ClinicBooking($input: ClinicAppointmentInput!) {
  createClinicAppointment(input: $input) { _id patientId clinicId source status }
}
```

```json
{
  "input": {
    "patientId": "<existing-patient-member-id>",
    "doctorId": "<own-clinic-doctor-id>",
    "specialty": "CARDIOLOGIST",
    "startsAt": "2030-01-07T10:00:00+09:00",
    "source": "PHONE"
  }
}
```

Clinic ID is derived from the caller and is not an input field. Guest patients are
not supported. Staff booking enforces the same patient-wide conflicts as online
booking, but conflict errors omit commitment details to protect other clinics'
records. Input cannot set status, version, duration or end time.

Status changes remove the active commitment and save APPOINTMENT_STATUS_CHANGED
in appointment_events within the same transaction. Cancellation also saves
SLOT_RELEASED with a stable event ID, appointment version and slot generation.
Manual allocations advance the generation so older openings become stale. Events
remain private. Step 7 consumes queue-release events; status and notification events
are handled by the Step 8 delivery outbox. The in-app inbox API is implemented;
its browser notification center remains Step 11 work.

If a cancellation has waiting entries at least 48 hours before start, the slot
stays behind its allocation gate for queue processing. Inside 48 hours it is open
for manual competition if current schedule/eligibility permits; the release event
feeds the Step 8 notification/lifecycle work. Release events for closed/ineligible schedules
have mode UNAVAILABLE and do not announce bookable time. With no waiting entries,
available slots also open manually outside the cutoff. Release modes are snapshots:
workers must recheck the current generation, occupancy, schedule and actual
allocation-time cutoff.

## Clinic and doctor calendars (Step 10 backend)

Calendar synchronization uses authenticated GraphQL polling over the existing HTTP
transport. There is no WebSocket/SSE deployment configuration verified in this repo;
this implementation needs no broker, long-lived connection or process-local feed.
Every request verifies the current Bearer session and reads an authoritative MongoDB
snapshot. A replica set is required. New-booking flags/migration readiness do not
block authorized historical calendar reads.

```graphql
query Calendar($input: CalendarInput!) {
  myCalendar(input: $input) {
    revision nextCursor clinicTimezone
    entries {
      _id patientId doctorId clinicId clinicTimezone
      specialty source version startsAt endsAt durationMinutes status
    }
  }
}
query WatchCalendar($input: CalendarUpdatesInput!) {
  calendarUpdates(input: $input) { revision changed pollAfterSeconds }
}
```

Both inputs require from/to DateTime bounds (UTC instants, from before to, at most
31 elapsed days), with an optional doctorId. Clinics see only appointments recorded
at their own clinic; a doctor filter intersects that scope. Doctors see only their
own appointments and cannot select another doctor. Patients use myAppointments;
ADMIN does not grant clinical calendar access. No target clinic/patient ID is accepted.
Entries overlap the requested window (`startsAt < to && endsAt > from`) and include
all statuses. Times stay UTC; clinicTimezone supplies display context and may be
null for incomplete historical clinic metadata. Empty windows also return the
clinic/current doctor's clinic timezone when available.

CalendarInput additionally accepts limit (default/max100), after (the previous
nextCursor) and revision. Pages order by startsAt then ID. Every continuation page
requires the first page's revision. If data changed, CONFLICT requires restarting
the first page; results are never silently truncated. Windows above5000 appointments
must be narrowed or filtered to one doctor. These are calendar read limits, not
booking limits. The per-clinic/per-doctor time/ID indexes support bounded reads.

CalendarUpdatesInput accepts knownRevision. Poll at the returned pollAfterSeconds
(currently5). When changed is false, retain the complete local snapshot. When true,
fetch myCalendar from the first page, collect all pages with the same revision, and
replace local state only after the complete window is fetched. Discard partial
pages and restart on CONFLICT. After reconnect/reload, fetch a fresh window instead
of assuming cached IDs are current. Deduplicate by appointment ID/version; never
replay a booking mutation to recover a missed calendar update.

Revisions hash the entire authorized appointment window plus its timezone context,
including pages not yet fetched. They are state tokens, not event sequences or
audit logs. Committed online, phone/walk-in, promoted and replacement bookings,
cancellations and outcomes are reflected; uncommitted/rolled-back transactions are
not published. Other doctors' or clinics' private changes do not invalidate a
scope that cannot see them. Responses remain no-store and reuse appointment output
allowlists; no patient contact or persistence-only fields are added.

Calendar revisions cover appointments/timezone context. Clinic onboarding and
schedule controls use the existing myClinicDoctors/reviewDoctorAffiliation,
setDoctorWeeklyHours/setDoctorDateOverrides and getAvailableSlots APIs; scheduling
availability remains authoritative only at booking time. All Next.js calendar,
workspace, polling/reconnect and browser acceptance work is deferred. No runtime
configuration, hosting/proxy or frontend code was changed.

## My Appointments (GraphQL, Step 9 backend)

`myAppointments` returns only the current patient's appointments. It requires a
current USER Bearer token, accepts no patient ID, and remains readable while
booking is paused. The response uses the same allowlisted fields and legacy source
fallback as getAppointment; it is marked Cache-Control: no-store.

```graphql
query MyAppointments($input: MyAppointmentsInput!) {
  myAppointments(input: $input) {
    entries {
      _id doctorId clinicId specialty source version
      startsAt endsAt durationMinutes status createdAt updatedAt
    }
    nextCursor
  }
}
```

Input is optional (defaults to `{}`). Supported fields:

| Field | Behavior |
| --- | --- |
| limit | Default 20; integer from 1 to 100 |
| after | Pass the previous nextCursor; it must reference an appointment owned by this patient |
| status | Optional AppointmentStatus filter |
| from | Optional inclusive UTC start-time lower bound (DateTime) |
| to | Optional exclusive UTC start-time upper bound (DateTime); must be after from |

Results are ordered by startsAt, then ID, ascending. Without date/status filters,
history and future appointments are included; an upcoming view can supply from.
A null nextCursor means the final page. Invalid or foreign cursors produce the same
generic BAD_USER_INPUT response. An owned cursor remains usable if that appointment
changes status; pages read current state and are not a frozen snapshot. Refetch the
first page after changing filters or after an uncertain booking/replacement result.

This returns a page object, not an appointment array. The postponed Next.js screen
must use entries/nextCursor when it is implemented. Existing backend login/refresh,
booking, lookup, slots, waitlist and replacement operations supply the other Step 9
contracts. Browser session persistence and all screens remain frontend work.
Per the October 31 scope change, remaining steps are being completed backend first;
this change does not implement any Next.js or Vite behavior.

## Waitlist enrollment and replacement (GraphQL)

Step 6 adds authenticated patient operations. Both new flags default to false:
WAITLIST_ENROLLMENT_ENABLED requires BOOKING_POLICY_V2_ENABLED; then
COMMITMENT_REPLACEMENT_ENABLED enables replacements. Invalid flag combinations
fail startup. Reads and withdrawal remain available while enrollment is paused.
No application environment has been enabled as part of this change.

```graphql
mutation Join($input: JoinWaitlistInput!) {
  joinWaitlist(input: $input) {
    _id version status startsAt queuePosition automaticBookingEligible automaticBookingEnabled
  }
}
mutation Leave($id: ID!) {
  leaveWaitlist(id: $id) { _id status version }
}
query Mine($input: MyWaitlistInput!) {
  myWaitlist(input: $input) { entries { _id version status startsAt } nextCursor }
}
mutation Replace($input: ReplaceCommitmentInput!) {
  replaceCommitment(input: $input) {
    kind appointment { _id version status } waitlist { _id version status queuePosition }
  }
}
```

JoinWaitlistInput contains doctorId, clinicId, specialty, UTC startsAt and
`automaticBookingConsent: true`. The exact slot must be occupied, otherwise valid,
and at least 48 elapsed hours away (exactly 48 allowed). Consent time/policy and a
server-assigned FIFO sequence are persisted. The same clinic/specialty 24-hour
commitment rule applies across doctors; exactly 24 hours is allowed. Duplicate
active entries fail. Withdrawing and joining again gets a new queue position.

ReplaceCommitmentInput contains originalKind (APPOINTMENT or WAITLIST), originalId,
originalVersion, destinationKind and destination (booking fields, plus true consent
for a waitlist). All four directions share one transaction; only the specified
original is excluded from conflict checks. Destination failure rolls back the
original, queue position, ledger, holds and release events. Stale versions and
same-kind/same-target requests fail. Replacing an appointment with a waitlist
forfeits the confirmed appointment only when enrollment succeeds.

getWaitlist(id: ID!) permits the patient or owning clinic; clinics cannot see FIFO
sequence/position. myWaitlist accepts limit (default 20, max 100), after (the previous
nextCursor) and optional status. Own doctors and clinics can call
getWaitlistCount(doctorId: ID!, startsAt: DateTime!); doctors cannot read entry details.
Other participants cannot enumerate entries through these operations.

Ordinary booking of one's matching waitlist slot fulfills that entry atomically.
It cannot jump a held queue outside the cutoff. Withdrawal of the last active
waiter releases the hold; withdrawing a fulfilled entry never cancels its appointment.
`automaticBookingEnabled` remains false: the promotion worker is implemented but
its release gate awaits verification of the patient-facing flow. automaticBookingEligible
reflects the current cutoff; the Step 8 lifecycle worker persists
NOTIFICATION_ONLY/EXPIRED transitions when enabled. Existing active
entries remain commitments until explicitly closed. Clients must refetch after an
uncertain/busy response before retrying or confirming a replacement.

## FIFO promotion worker (Step 7)

AppointmentPromotionService processes private SLOT_RELEASED events with QUEUE or
UNAVAILABLE hints. It claims one event per poll using a unique token and a
30-second lease. Expired claims are recoverable by another instance; every
transaction fences the current token and checks the slot generation. Once enabled
in a later release, polling runs in the Nest process at one-second intervals and
stops on module shutdown. No worker API or new queue dependency is introduced.

The worker selects ACTIVE entries by server FIFO sequence, then locks the doctor,
patient and slot and rechecks the head. It verifies consent, current patient and
clinic/doctor eligibility, schedule, occupancy, specialty spacing and patient
appointment overlap. Definite eligibility failures become INELIGIBLE with a safe
reason; database failures preserve the head and retry. NOTIFICATION_ONLY entries
are never automatically booked. A claim handles at most 25 candidates before
rescheduling; exhausted eligible queues release the hold for normal booking.

Successful promotion atomically creates a CONFIRMED appointment with source
WAITLIST, fulfills the selected entry, changes the active ledger, releases the hold,
and saves WAITLIST_BOOKING_CREATED plus the Step 8 delivery intent. Replays and
stale owners cannot create another booking. The cutoff is checked inside the
allocation transaction: exactly 48 hours is allowed; inside 48 hours no automatic
booking commits. Such releases become DEFERRED with MANUAL_CUTOFF (or SLOT_STARTED),
and the hold is released. The Step 8 lifecycle worker consumes that durable handoff for notification
fan-out/expiry. Existing MANUAL releases are consumed by the separate Step 8 lifecycle worker.

Worker state is persisted in appointment_events: state, attempts, claimToken,
leaseUntil, nextAttemptAt, lastFailureCode, processedAt and result. Failures use
WORKER_RETRY with exponential backoff capped at 60 seconds; bounded batches use
BATCH_LIMIT and a one-second delay. Error payloads and patient details are not logged.
Operators can inspect aggregate pending/retrying/expired-claim counts and last safe
failure codes through private database tooling. Public status endpoints expose no
queue records. Full monitoring/reconciliation and process-crash rehearsal remain
Step 12 work; recovery tests currently use fresh worker instances and abandoned leases.

WAITLIST_PROMOTION_ENABLED defaults to false. Setting it to true currently rejects
startup until the patient-facing notification flow is integrated and verified.
The in-app backend delivery path now exists; Step 11 must verify the browser flow before
production activation. Tests replace only the worker's internal enablement check;
MongoDB claims, transactions, booking and event persistence remain real. Enrollment
can be piloted separately with automation accurately labeled as disabled.

## Cutoff lifecycle and in-app notifications (Step 8)

Inside 48 hours, cancellation atomically captures one manual-opening delivery intent
per active recipient. It checks current schedule/occupancy and the slot generation;
no automatic booking is created. Recipients are captured before the cancellation
commits, so delayed delivery or subsequent withdrawal cannot lose the opening's
recipient snapshot. Replay uses the same event ID; a distinct opening event may
produce another notice. Alerts explicitly promise no reservation.

AppointmentWaitlistLifecycleService handles manual/deferred releases, moves ACTIVE
entries to NOTIFICATION_ONLY strictly inside 48 hours, and expires unfilled entries
at slot start. Status/version and the active ledger change together under the
existing doctor/patient/slot locks. Withdrawal remains supported. When a booking
succeeds, it records a durable queue-sequence high-water mark; cleanup closes the
remaining old entries with SLOT_TAKEN. Later enrollments survive older cleanup jobs.
Entries pending that cleanup cannot be promoted or reused for replacement; a fresh
same-slot enrollment closes one's old entry and gets a new FIFO position. Cleanup
is eventual and resumes after a pause/restart, rather than locking every patient
inside the booking transaction.

The private notification_outbox stores WAITLIST_JOINED, WAITLIST_BOOKING_CREATED,
SLOT_OPEN_FOR_MANUAL_BOOKING and WAITLIST_EXPIRED intents. Event + recipient + IN_APP
is unique. NotificationService claims deliveries with a token/30-second lease and
atomically upserts the inbox item and acknowledges delivery on a replica set.
Retries/backoff and expired-lease recovery never recreate appointments or undo
successful bookings. Replays preserve read state. Safe failure code
IN_APP_DELIVERY_RETRY and aggregate operator counts expose failures without payloads.

Two independent flags default to false: WAITLIST_LIFECYCLE_ENABLED runs cutoff and
cleanup work; WAITLIST_NOTIFICATIONS_ENABLED runs in-app delivery. Both require the
verified migration marker, including while new booking is paused. Pausing delivery
preserves pending intents and does not pause lifecycle processing. Each worker polls
once per second, processes at most 25 units per poll and drains its current unit on
shutdown. No application configuration was activated by this change.

```graphql
query Inbox($input: MyNotificationsInput!) {
  myNotifications(input: $input) {
    entries {
      _id type message waitlistId doctorId clinicId startsAt endsAt
      appointmentId occurredAt readAt
    }
    nextCursor unreadCount
  }
}
mutation Read($id: ID!) {
  markNotificationRead(id: $id) { _id readAt }
}
query DeliveryStatus {
  notificationDeliveryStatus { pending processing delivered retrying expiredClaims }
}
```

Inbox/read operations require a current USER Bearer token and always scope to that
patient. Pagination is newest occurrence first; limit defaults to 20 (max 100),
with nextCursor passed as after. Read is idempotent. DeliveryStatus requires ADMIN
and returns aggregate counts only. Private outbox event IDs, claims, failure payloads
and other patients' appointment IDs are never included in patient output.

Targets can now be resolved through notificationContext (Step 11 backend), which
returns current appointment/slot/waitlist data with the needed specialty. Existing
getAppointment/getAvailableSlots reads remain available. The browser must fetch current state
before booking or treating an old notice as confirmation. The Step 11 notification
center/link flow has not been built or browser-verified. No email/SMS provider is
configured; IN_APP is the implemented delivery adapter. Automatic promotion remains
disabled until the patient-facing flow is integrated and verified.

## Notification center backend (Step 11)

The existing in-app channel now has owned detail and current-target lookups.
`getNotification(id: ID!)` returns the patient's historical notice without marking
it read. `myNotifications(input: {unreadOnly: true})` filters unread items while
unreadCount remains the patient's total unread count. Its cursor remains usable
after that cursor notice is marked read. Default/all-item pagination is unchanged.

```graphql
query NoticeTarget($id: ID!) {
  notificationContext(id: $id) {
    notification { _id type message readAt }
    targetKind checkedAt
    appointment { _id status source version startsAt endsAt }
    slot { doctorId clinicId specialty startsAt clinicTimezone state }
    waitlist { _id specialty status appointmentId }
  }
}
```

Only the notification ID is accepted; patient and target references are resolved
server-side after ownership validation. Current USER authentication is required for
both lookups. Foreign IDs return NOT_FOUND; staff roles cannot read patient notices.
These queries are no-store and do not change read state. Use markNotificationRead
explicitly when the future UI decides the notice has been seen.

| targetKind | Current data |
| --- | --- |
| APPOINTMENT | The patient's current appointment, including cancellation/completion/no-show status |
| SLOT | Current public slot data; inspect state, which can be OCCUPIED or UNAVAILABLE |
| WAITLIST | The patient's current entry, including terminal state and recorded specialty |
| UNAVAILABLE | Missing reference, past/closed slot or ineligible target; the historical notice remains readable |

Manual alerts are historical opening events, never reservations. A delayed alert
can resolve to OCCUPIED after another patient books; no new owner's appointment or
identity is returned. Exact-slot lookup uses the clinic-local date (including UTC
day boundaries) and the existing schedule/eligibility rules. checkedAt is the server
evaluation time, not a reservation or atomic booking guarantee. Availability remains
advisory; creation must revalidate conflicts/occupancy. Database failures remain
request errors instead of being reported as a known closed target.

In-app delivery is verified through the real MongoDB/HTTP API from promotion to
inbox, including current status after cancellation, late/manual alerts, unread
paging, outage/restart retries, duplicate replay and stale-claim takeover. Required
booking intents remain pending during delivery outages and can drain while new
booking/enrollment are paused. There is no delivery-preference API that suppresses
required booking notices; unreadOnly changes only a read view. IN_APP is the only
configured channel; no external email/SMS provider has been selected or contacted.
Browser notification-center/link behavior remains deferred. Promotion stays disabled
until that patient-facing flow is integrated and verified; this backend work does
not activate any feature flag or deployment.

## Deployment

The project records a Hostinger VPS deployment. Its recorded status URL is
[http://72.62.195.195:3333/status](http://72.62.195.195:3333/status); live availability
was not verified during this documentation update.

For a server running the compiled backend, use `backend/` as the working directory,
install dependencies with `npm ci`, configure the production environment, then run
`npm run build` and `npm run start:prod`. Configure the process manager, browser
origins, reverse proxy, and TLS for the actual hosting environment.

Local `deploy.sh` and `docker-compose.yml` are Git-ignored. Their current contents
need reconciliation before reuse: the script selects `master`, and Compose runs
npm from the repository root instead of `backend/`. They are not a verified
checkout-to-deployment procedure for the current layout.

## Known limitations

- Email verification and logout/revocation endpoints are not implemented.
- Swagger response schemas are incomplete.
- Booking, migration and concurrency are tested against disposable MongoDB;
  application-database cutover, frontend integration and Atlas rollout remain unverified.
- FIFO promotion remains gated until the patient-facing notification flow is verified.
  Cutoff lifecycle and in-app inbox delivery are implemented; their flags default off.
  Browser notification screens and external delivery providers remain pending.
- Authentication rate limiting is per process, without a shared multi-instance store.
- Local deployment scripts still need the alignment described above.

## Project records

- [Booking and waitlist contracts](backend/BOOKING_WAITLIST_CONTRACT.md): Step 1
  target policy, API contracts, legacy-data strategy, and rollout gates. These
  contract includes future stages; the API sections above describe current behavior.
- [Sprint 01](backend/SPRINT_01.md): October 1–8 scope and delivery review.
- [Sprint 02](backend/SPRINT_02.md): October 9–15 Google sign-in backend delivery and remaining integration work.
- [AI usage log](backend/AI_LOG.md): prompts, retained behavior, changes, corrections, and decisions.
- [Software engineering project guide](resources/software-engineering-project-guide.md).

After meaningful project work, append an accurate entry to `backend/AI_LOG.md`:

```markdown
## <Task title> — YYYY-MM-DD

**Tool(s) used:**
**What I asked for:**
**What I kept as-is:**
**What I changed or rejected, and why:**
**Something the AI got wrong that I had to catch:**
**One decision I can explain without AI:**
```

Write reflections in first person, record only checks actually performed, and do
not invent mistakes. Keep secrets and sensitive personal data out of project records.
