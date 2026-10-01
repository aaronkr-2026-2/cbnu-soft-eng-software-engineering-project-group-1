# MedConnect

## Description

**FOR** patients and clinics
**WHO** need a simpler way to book and manage medical appointments,
**THE** MedConnect IS A healthcare appointment platform
**THAT** connects patients with doctors and helps clinics coordinate bookings,
**UNLIKE** scheduling through phone calls and scattered messages,
**OUR PRODUCT** brings patients, doctors, and clinics into one place with shared appointment information and clear booking statuses.

## `AI_LOG.md`

Every time you update your project, please make a note of what you did in the `AI_LOG.md` file, according to the following template.

```markdown
## [Milestone name] — [Date]

**Tool(s) used:**
**What I asked for:**
**What I kept as-is:**
**What I changed or rejected, and why:**
**Something the AI got wrong that I had to catch:**
```

# MedConnect API

Open `/status` for a visual dashboard of API information, liveness, and database readiness. It checks the existing JSON endpoints from your browser, supports manual refresh, and refreshes every 30 seconds while visible. It is a public status page with no patient data or administrative controls. The root `/` continues to return API information as JSON.

Booking-platform API foundation for clinics. REST routes start at `/` with no global prefix. The application builds as CommonJS (`"type": "commonjs"`).

Endpoints: `GET /`, `GET /health/live`, and `GET /health/ready`. The readiness endpoint returns 503 until MongoDB has connected and never exposes credentials or driver details.

## Description

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

I have deployed backend on Hostinger vps. Status accesible at http://72.62.195.195:3333/status

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
email verification, logout/revocation, and protected booking routes are separate work.

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

## Folder structure

This single-app API follows the relevant conventions of the `medi-bridge` API:

```text
src/
  components/
    components.module.ts
    appointment/          # controller, service, module
    auth/
      guards/             # access guard
      member-password.ts
      member-rate-limit.ts
    health/               # controller, module
    member/               # controller, service, module, resolver placeholder
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
`MemberModule`. The reference project's multi-app and Redis setup is not required here.
Appointment GraphQL operations share the existing service with REST routes.

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

In Postman, use GraphQL body mode with `http://localhost:3003/graphql` (or your
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
