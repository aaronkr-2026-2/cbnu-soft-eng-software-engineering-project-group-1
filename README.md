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
- **Authentication protection:** Authentication rate limiting and current-account
  checks for protected appointment operations.
- **Public member profiles:** GraphQL lookup for active USER, DOCTOR, and CLINIC
  members, with private contact and credential fields excluded.
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
| `MONGO_DEV` | Development MongoDB connection | Required for the documented development setup |
| `MONGO_PROD` | Production MongoDB connection | Used in production when `MONGO_DEV` is unset; use `mongodb+srv://` |
| `JWT_ACCESS_SECRET` | Access-token signing secret | Required; at least 32 bytes |
| `CORS_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:3000,http://localhost:5173` |

**Current database configuration limitation:** Startup validation recognizes
`MONGO_URI`, but `DatabaseModule` does not use it. The module also prefers
`MONGO_DEV` even in production. Use `MONGO_DEV` for development; for production,
unset `MONGO_DEV` and set `MONGO_PROD` to an Atlas SRV connection string. Do not rely
on `MONGO_URI` alone until these configuration paths are aligned.

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
npm run test:cov     # Unit-test coverage
```

For a compiled production run, configure the production environment first:

```bash
npm run build
npm run start:prod
```

HTTP tests use an in-memory persistence substitute with Mongoose validation;
they do not connect to Atlas or verify real MongoDB concurrency/index enforcement.

## Architecture

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
  }
}
```

Variables: `{ "id": "<member-id>" }`. Doctor profiles include their clinic ID,
affiliation status, and specializations; clinic profiles include their name and
timezone. Optional GraphQL fields return `null` when absent. This lookup does not
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
- Real MongoDB booking races and index enforcement are not integration-tested.
- Patient bookings with different doctors can overlap.
- Authentication rate limiting is per process, without a shared multi-instance store.
- Database environment-variable handling and local deployment scripts need the
  alignment described above.

## Project records

- [Sprint 01](backend/SPRINT_01.md): October 1–8 scope and delivery review.
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
