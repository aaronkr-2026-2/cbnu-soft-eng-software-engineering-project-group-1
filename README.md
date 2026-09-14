# MedConnect API

Booking-platform API foundation for clinics. Routes are versioned under `/api/v1`, allowing clinic tenancy and booking models to be added without breaking clients.

Copy `.env.example` to `.env` and set `MONGO_URI` to your MongoDB Atlas string. `MONGO_DEV` and `MONGO_PROD` are also supported for backward compatibility. Production requires `mongodb+srv://`.

Endpoints: `GET /api/v1`, `GET /api/v1/health/live`, and `GET /api/v1/health/ready`. The readiness endpoint returns 503 until MongoDB has connected and never exposes credentials or driver details.

Application, request, and error logs are written as JSON lines to `logs/medconnect.log`. Set `LOG_FILE` to choose another location. Request bodies, responses, authorization headers, cookies, and query strings are intentionally excluded.

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

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

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Member authentication (REST)

Set `JWT_ACCESS_SECRET` to a cryptographically random secret of at least 32 bytes
in `.env` (for example, generate one with `openssl rand -hex 48`). Keep it private
and stable across restarts. Startup rejects missing or short secrets.

- `POST /api/v1/member/signup` returns 201. Required fields: `memberEmail`,
  `memberPassword` (12–128 characters), `memberPhone` (international format such
  as `+821012345678`), and `memberNick` (2–40 characters). `memberFullName` is optional.
- `memberType` defaults to `USER`. `CLINIC` additionally requires `clinicName`;
  `clinicTimezone` defaults to `Asia/Seoul`. `DOCTOR` requires `clinicId` of an
  active clinic, a nonempty `doctorSpecializations` enum array, and
  `professionalLicenseNumber`. Doctors start with `PENDING` clinic affiliation.
  Public signup cannot create `ADMIN` accounts or set approval/status fields.
- `POST /api/v1/member/login` accepts `memberEmail` and `memberPassword`, returning
  200. Unknown accounts, wrong passwords, non-email accounts, and suspended or
  deleted accounts return the same 401 response. Email is trimmed and lowercased;
  passwords are preserved exactly.
- Both return `{ member, accessToken, refreshToken }`. Member fields are explicitly
  allowlisted; password hashes, provider IDs, phone numbers, and license numbers
  are excluded. Passwords use salted scrypt (`N=32768, r=8, p=3`).
- Access tokens are HS256 JWTs valid for 15 minutes, with issuer `medconnect`,
  audience `medconnect-api`, subject equal to the member ID, and `tokenType=access`.
  The appointment endpoint verifies these claims and current member status;
  issuing a token does not itself protect booking or other routes.
- `POST /api/v1/member/refresh` accepts `{ "refreshToken": "..." }` and returns
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


## Get an appointment

```http
GET /api/v1/appointment/<appointment-id>
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
`MemberModule`. The reference project's multi-app, GraphQL, and Redis setup is
not required for this REST API.
