# MedConnect

MedConnect is a healthcare appointment platform for patients, doctors, and clinics.
It brings booking information and appointment statuses into one place, reducing
reliance on phone calls and scattered messages.

The backend uses NestJS, TypeScript, MongoDB/Mongoose, and GraphQL, with REST for
member authentication and existing appointment routes. A React/Vite frontend lives
in `frontend/`; see its [README](frontend/README.md) for frontend instructions.

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
- [Appointment booking](#book-an-appointment)
- [GraphQL appointments](#graphql-appointments)
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
  and the existing access/refresh session contract. Browser UI integration is pending.
- **Authentication protection:** Authentication rate limiting and current-account
  checks for protected appointment operations.
- **Public member profiles:** GraphQL lookup for active USER, DOCTOR, and CLINIC
  members, with private contact and credential fields excluded.
- **Private current-member profile:** Authenticated `myProfile` returns your profile,
  email, phone, and `canChangePassword` for settings screens. Public queries retain
  their existing fields.
- **Clinic and doctor cities:** Clinics must select a city from MediBridge’s 10-city
  `Location` enum during signup. Doctor cities are derived from their current clinic
  in auth responses and public profiles, including the doctor directory.
- **Public doctor directory:** GraphQL `getDoctors` returns up to 100 active,
  approved, nondeleted doctors, using public fields and name/ID ordering.
  Focused tests use mocked persistence; live database integration is unverified.
- **Image uploads:** Authenticated GraphQL single/batch PNG, JPEG, and WebP uploads
  for member/clinic images; up to five files, 10 MB each, with public URLs and local disk storage.
- **Appointment booking:** Authenticated USER booking through GraphQL and REST,
  creating a PENDING appointment for a fixed 30-minute slot.
- **Booking validation:** Approved doctor affiliation, active clinic/doctor checks,
  clinic-timezone slot alignment, weekly working hours, date-specific overrides,
  and occupied-slot checks backed by a unique active-slot index.
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

Update this list whenever a new feature is added. Keep entries aligned with the
implemented behavior, and revise them when features change or are removed.

Clinic approval and availability management APIs are not yet implemented. Booking
requires an approved doctor and configured working hours in the database.

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

`BookingCoordinationService` now provides internal transaction foundations with
patient locks, doctor-slot allocation gates, and an active-commitment ledger. It
requires a replica set and has no standalone fallback. Existing public booking
still creates PENDING appointments and does not call these primitives. Wiring
them into specialty-aware booking and migrating existing data belong to Step 3;
waitlist/lifecycle APIs and workers remain later steps.

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
they do not connect to Atlas. Clinic verification, affiliation approval endpoints,
email verification, and logout/revocation remain unimplemented. Protected booking
and appointment lookup are implemented; their prerequisites are described below.

### Google sign-in (REST)

Google sign-in uses `google-auth-library` to verify an ID token. Set
`GOOGLE_CLIENT_ID` to your Google web application's client ID and configure its
authorized JavaScript origins for the frontend. `GOOGLE_CLIENT_SECRET` is not
used by this ID-token flow; keep any configured secret server-only. No Google
API access/refresh tokens are requested or stored.

The browser integration must follow this sequence (the checked-in frontend does
not yet provide a Google button):

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
  "startsAt": "2030-01-07T10:00:00+09:00"
}
```

The caller must be an active USER. The patient ID comes from authentication;
request fields such as `patientId`, `status`, `endsAt`, and `durationMinutes` are
rejected. The start must be a future ISO timestamp with an explicit timezone
(`Z` or an offset), aligned to a 30-minute boundary in the clinic timezone.
The server computes the end as exactly 30 elapsed minutes later and creates a
PENDING appointment, returning the appointment object with HTTP 201.

Before booking, the doctor must be active, belong to the selected active clinic,
and have APPROVED affiliation. Working hours must already exist in
`doctor_availability` or `doctor_availability_overrides` for that doctor and clinic.
There are no approval/availability-management APIs yet; new doctors start PENDING
and cannot be booked until these prerequisites are configured.

Weekly hours use the clinic-local weekday. Date-specific CUSTOM_HOURS replace
weekly hours for that local date. UNAVAILABLE overrides block overlapping time
intervals, or the full day when no interval is provided. The complete slot must
fit within an available interval. No schedule means unavailable.

PENDING and CONFIRMED appointments reserve the doctor's slot. An overlap check
handles existing bookings, and MongoDB's unique active-slot index resolves
simultaneous attempts at the same start time. Model initialization is awaited
before booking; the existing unique index must remain enabled in the database.
Canceled slots can be reused. This endpoint does not prevent a patient from
booking different doctors at the same time.

Errors: 400 for invalid input, past/misaligned starts, or invalid clinic/doctor
relationships; 401 for invalid authentication; 403 for a non-USER caller;
409 for unavailable or occupied slots. Responses use `Cache-Control: no-store`.
Tests simulate persistence and duplicate-key races; actual Atlas index enforcement
has not been integration-tested.

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
apply. `patientId` comes from authentication; it is not an input field. ID values
are strings; output dates are UTC ISO timestamps. Member relations are not
populated by these operations.

Inspect GraphQL's `errors` array even for HTTP 200 responses. Application errors
use codes such as `UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `NOT_FOUND`, and
`CONFLICT`. Internal error details and stack traces are not returned; response
caching is disabled. GraphiQL is available at `/graphql` outside production.

The schema is generated from DTO decorators in memory. `AppointmentResolver`
handles GraphQL arguments/context and delegates to `AppointmentService`.
Setup follows the [Nest GraphQL guide](https://docs.nestjs.com/graphql/quick-start).

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

- Clinic affiliation approval and availability management APIs are not implemented.
- Email verification and logout/revocation endpoints are not implemented.
- Swagger response schemas are incomplete.
- Internal coordination races, rollback and active-slot indexes are tested on a
  disposable replica set; public booking is not yet integrated with this ledger.
- Patient bookings with different doctors can overlap.
- Authentication rate limiting is per process, without a shared multi-instance store.
- Local deployment scripts still need the alignment described above.

## Project records

- [Booking and waitlist contracts](backend/BOOKING_WAITLIST_CONTRACT.md): Step 1
  target policy, API contracts, legacy-data strategy, and rollout gates. These
  changes are not implemented; the API sections above describe current behavior.
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
