# AI_LOG.md

Every time you update your project, please make a note of what you did in the `AI_LOG.md` file, according to the following template.

---

## [Milestone name] — [Date]
**Tool(s) used:**
**What I asked for:**
**What I kept as-is:**
**What I changed or rejected, and why:**
**Something the AI got wrong that I had to catch:**

---

These entries summarize SESSION_LOG.md. Dates and validation results refer to the recorded sessions; historical checks were not rerun for this backfill. Related requests on the same date are grouped into milestones. Codex is listed as the AI tool, as confirmed by the user. The reflection fields include recorded corrections and preference changes; where no specific mistake was documented, that is stated explicitly.

## MongoDB API foundation and application logging — 2026-09-12
**Tool(s) used:** Codex; build, unit/E2E tests, and lint.
**What I asked for:** Set up the MongoDB API foundation and structured application logging (summarized from the recorded completed work).
**What I kept as-is:** Kept database details and sensitive request data out of public responses and logs.
**What I changed or rejected, and why:** Added Atlas-compatible connectivity, environment validation, health endpoints, an initial API prefix, JSON-line file logging, and startup URLs. The API prefix was removed in a later milestone.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## Member and appointment data models — 2026-09-13
**Tool(s) used:** Codex; build, unit/E2E tests, and lint.
**What I asked for:** Create the member and appointment data-model foundation (summarized from the recorded completed work).
**What I kept as-is:** Kept clinic, doctor, user, and admin roles, doctor affiliation approval, and fixed 30-minute appointments.
**What I changed or rejected, and why:** Added member, appointment, weekly availability, and date-specific override schemas, including UTC timestamps and active-slot uniqueness. Registered the schemas without claiming booking or approval APIs were implemented.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## Member type review and refinement — 2026-09-13
**Tool(s) used:** Codex; TypeScript, lint, and Git whitespace checks.
**What I asked for:** Review member types, preserve my MEMBER rename, and address the remaining type issues.
**What I kept as-is:** Kept schema-derived entity/document types and the schema’s MEMBER constant.
**What I changed or rejected, and why:** Removed redundant timestamps, token fields, and the duplicate model constant; added a separate authentication response type. Runtime password removal remained necessary. The initial full type check exposed an existing Supertest import issue.
**Something the AI got wrong that I had to catch:** I clarified that my MEMBER rename needed to be preserved while the remaining type issues were fixed.

---

## Session continuity and local notes — 2026-09-13
**Tool(s) used:** Codex; Git ignore and whitespace checks.
**What I asked for:** Keep brief daily context across sessions and ignore the local continuity files.
**What I kept as-is:** Preserved pre-existing working-tree changes.
**What I changed or rejected, and why:** Created AGENTS.md and SESSION_LOG.md, separated instructions from history, and added root-scoped ignore rules for both files.
**Something the AI got wrong that I had to catch:** I had to specify that AGENTS.md and SESSION_LOG.md should stay local and be ignored by Git.

---

## REST member authentication — 2026-09-13
**Tool(s) used:** Codex; TypeScript, build, Jest/HTTP tests, lint, and Git whitespace checks.
**What I asked for:** Implement signup and login with public registration for USER, CLINIC, and DOCTOR.
**What I kept as-is:** Kept ADMIN out of public signup and required doctors to start with pending clinic affiliation.
**What I changed or rejected, and why:** Added validated signup/login/refresh routes, scrypt password hashing, allowlisted member responses, access JWTs, hashed rotating refresh tokens, and auth rate limiting. Fixed the existing Supertest import. Build, type check, 1 unit test, and 17 HTTP tests passed; persistence was simulated.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## Appointment lookup and access control — 2026-09-14
**Tool(s) used:** Codex; build, TypeScript, unit/HTTP tests, lint, and Git whitespace checks.
**What I asked for:** Fetch an appointment by ID for USER, CLINIC, and DOCTOR.
**What I kept as-is:** Kept access limited to the appointment’s patient, clinic, or doctor, without an ADMIN override.
**What I changed or rejected, and why:** Added a reusable access guard, current-account checks, role-scoped lookup, projected responses, and no-store caching. Invalid IDs return 400; missing or unrelated records return 404. Build, type check, 1 unit test, and 31 HTTP tests passed.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## Project folder conventions — 2026-09-14
**Tool(s) used:** Codex; reference-project inspection, TypeScript, build, unit/HTTP tests, lint, and Git whitespace checks.
**What I asked for:** Centralize DTOs and feature components, then apply the Medi-Bridge API folder conventions.
**What I kept as-is:** Kept this project’s single-app src root and existing endpoint behavior.
**What I changed or rejected, and why:** Grouped features under src/components and DTOs under src/libs/dto/<feature>; added ComponentsModule and HealthModule. Moved auth helpers/guards, schemas, interceptor, and logger to the agreed folders and used singular appointment filenames. Updated imports and documentation. Final checks passed with 1 unit test and 31 HTTP tests; the existing empty config.ts lint warning remained.
**Something the AI got wrong that I had to catch:** The initial layout did not match the structure I wanted. I asked to centralize DTOs and feature components, then align the folders and filenames with Medi-Bridge.

---

## Appointment booking API — 2026-09-14
**Tool(s) used:** Codex; build, TypeScript, Jest/HTTP tests, lint, and Git whitespace checks.
**What I asked for:** Implement bookAppointment using the established component and DTO layout.
**What I kept as-is:** Kept authenticated patient identity, PENDING status, and fixed 30-minute appointments.
**What I changed or rejected, and why:** Added USER-only booking with active clinic/approved doctor checks, timezone-aware availability, future half-hour slots, overlap checks, and duplicate-key conflict handling. Documented prerequisites; availability management remained unimplemented. All 5 unit tests and 53 HTTP tests passed with simulated persistence.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## GraphQL appointment operations — 2026-09-14
**Tool(s) used:** Codex; Medi-Bridge inspection, build, TypeScript, Jest/HTTP tests, lint, and Git whitespace checks.
**What I asked for:** Use GraphQL for appointments while retaining REST authentication.
**What I kept as-is:** Kept existing appointment REST endpoints and shared service validation, authorization, and booking behavior.
**What I changed or rejected, and why:** Added /graphql, bookAppointment and getAppointment operations, shared input/output DTOs, and HTTP/GraphQL guard support. Added sanitized errors, no-store responses, and README examples. All 5 unit tests and 60 HTTP tests passed; no live Atlas validation occurred.
**Something the AI got wrong that I had to catch:** The first appointment APIs used REST. I asked to use GraphQL for appointments while keeping authentication on REST; this was an architecture change I requested.

---

## Simplify the booking service — 2026-09-14
**Tool(s) used:** Codex; reference-project inspection, build, TypeScript, Jest/HTTP tests, lint, and Git whitespace checks.
**What I asked for:** Compare the booking implementation with Medi-Bridge and simplify the lengthy service.
**What I kept as-is:** Kept direct booking, PENDING status, schedule checks, timezone behavior, ownership rules, and race protection.
**What I changed or rejected, and why:** Extracted private helpers so bookAppointment reads as a short sequence of steps. Did not adopt the reference project’s Redis holds or notifications because those require a different workflow. All 5 unit tests and 60 HTTP tests passed.
**Something the AI got wrong that I had to catch:** The booking method was too long for the structure I wanted. I asked Codex to compare it with Medi-Bridge and simplify it into smaller helpers.

---

## Compose deployment configuration — 2026-09-16
**Tool(s) used:** Codex; js-yaml parsing, shell syntax, interpolation assertions, and Git whitespace checks.
**What I asked for:** Adapt the supplied Compose style for MedConnect, using PORT_API=3333 and reserving PORT_BATCH=4444.
**What I kept as-is:** Kept a single API service and the existing deploy script’s Git behavior; no deployment was executed.
**What I changed or rejected, and why:** Configured Node 24.12.0, production settings, Seoul timezone, a bind mount, and the external medconnect-shared network. Updated deploy.sh to select docker.compose.yml and replaced fixed ports with required PORT_API interpolation. Omitted batch and Redis because they are not implemented. Docker Compose/runtime validation was unavailable.
**Something the AI got wrong that I had to catch:** The first configuration chose host port 4003 and internal port 3000; I clarified the intended ports, and the API mapping was corrected.

---

## CommonJS migration and sample Jest test — 2026-09-16
**Tool(s) used:** Codex; build, TypeScript, Jest/HTTP tests, lint, compiled-output inspection, and Git whitespace checks.
**What I asked for:** Restore my preferred CommonJS format and add one sample Jest test.
**What I kept as-is:** Kept NodeNext resolution, deferred startup imports, and application business logic.
**What I changed or rejected, and why:** Set package.json to commonjs, renamed Jest configuration to jest.config.cjs, and retained VM module flags needed by NestJS 12 ESM dependencies. Added a commented Arrange/Act/Assert test in src/app.service.spec.ts. Migration checks passed with 5 unit and 60 HTTP tests; the later targeted sample test also passed. Deployment on Node 24 was not tested.
**Something the AI got wrong that I had to catch:** The project used ESM, but I wanted CommonJS. I asked Codex to restore that preference; tests then showed that the VM module flags still had to remain for NestJS dependencies.

---

## Frontend CORS review — 2026-09-16
**Tool(s) used:** Codex; read-only API bootstrap and GraphQL configuration inspection.
**What I asked for:** Inspect Medi-Bridge and present a frontend CORS plan.
**What I kept as-is:** Left existing source and environment configuration unchanged because this was a plan-only request.
**What I changed or rejected, and why:** Proposed explicit production origins, localhost development defaults, origin validation, and REST/GraphQL preflight checks. Actual frontend URLs remained necessary before implementation; no tests were run.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## Remove remaining REST prefix references — 2026-09-16
**Tool(s) used:** Codex; source/documentation searches, build, HTTP/GraphQL tests, and Git whitespace checks.
**What I asked for:** Review my removal of the REST prefix, then clean up the remaining references.
**What I kept as-is:** Preserved my main.ts changes, test prefix-setup removals, and other README edits.
**What I changed or rejected, and why:** Updated 20 test request URLs and README route examples/descriptions to match routes starting at /. Build and all 60 HTTP/GraphQL tests passed, and no old prefix references remained in the checked source, tests, README, or rebuilt JavaScript. Historical session entries retained their original paths.
**Something the AI got wrong that I had to catch:** I removed the REST prefix and requested follow-up reviews and cleanup. Those reviews found old request URLs and README examples that still needed to match the new routes.

---

## Visual service status page and separate assets — 2026-09-17
**Tool(s) used:** Codex; build, TypeScript, HTTP tests, Node VM client checks, JavaScript syntax checks, and asset inspection.
**What I asked for:** Create a visual API/liveness/readiness page, then use EJS or similar after I reported rendering trouble.
**What I kept as-is:** Kept existing JSON endpoints and browser-side data fetching.
**What I changed or rejected, and why:** Added /status with status cards, response times, manual refresh, and 30-second polling. Later replaced the embedded TypeScript template with HTML/CSS/JS files under src/components/health/views and configured Nest asset copying. EJS was unnecessary for browser-fetched data. The first version passed 61 HTTP tests; separated assets passed 62. No real-browser or VPS verification was performed.
**Something the AI got wrong that I had to catch:** I reported rendering trouble with the initial page. The cause was not confirmed or reproduced, so the asset separation was not verified as a fix for that symptom.

---

## Frontend handoff and agent instructions — 2026-09-17
**Tool(s) used:** Codex; backend contract/path inspection and official Next.js documentation.
**What I asked for:** Prepare a separate App Router frontend plan and portable context, then create frontend agent instructions with the backend repository path.
**What I kept as-is:** Kept Nest as the proposed sole business backend, with REST authentication and GraphQL appointment operations.
**What I changed or rejected, and why:** Created FRONTEND_CONTEXT.md with verified contracts, missing APIs, phased plans, connectivity decisions, and a kickoff prompt. Added FRONT_AGENTS.md with the backend path and a source-reference table. The frontend layout and in-memory session approach remained proposals; no frontend scaffold or backend behavior changed.
**Something the AI got wrong that I had to catch:** No specific AI mistake was documented in the session log.

---

## Backfill the AI project log — 2026-09-17
**Tool(s) used:** Codex; local file inspection, Python, and Git whitespace checks.
**What I asked for:** Create AI_LOG.md entries from SESSION_LOG.md while preserving the existing log structure.
**What I kept as-is:** Kept the original template, its five fields, and unrelated README changes.
**What I changed or rejected, and why:** Grouped the recorded history into dated milestones and distinguished completed work, proposals, and unverified results. Updated the tool attribution to Codex following my clarification and expanded reflection fields with recorded corrections and preference changes.
**Something the AI got wrong that I had to catch:** Codex initially wrote “specific tool not recorded” instead of naming Codex and left most reflection fields as “Not recorded.” I asked it to name the tool and include the corrections supported by the session history.

---

## Get Doctor and Clinic member profiles — 2026-10-01
**Tool(s) used:** Codex; Nest build, TypeScript check, HTTP/GraphQL and unit tests, lint.
**What I asked for:** Create a getMember API for Doctor and Clinic members.
**What I kept as-is:** Existing authentication responses, appointment operations, schemas, and shared-service architecture.
**What I changed or rejected, and why:** Added public GraphQL getMember(id) and REST GET /member/:id for active provider profiles, ID validation, an explicit profile projection, and tests/docs. Kept email, phone, credentials, and license/provider IDs out of public profiles. Scoped the existing rate limit to auth POST routes so profile reads do not consume the auth budget. Build, type check, 72 HTTP/GraphQL tests, and 6 unit tests passed; lint retains its existing empty-file warning.
**Something the AI got wrong that I had to catch:** No user-caught mistake recorded for this task.

## Use GraphQL only for member lookup — 2026-10-01
**Tool(s) used:** Codex; TypeScript check and HTTP/GraphQL tests.
**What I asked for:** Remove REST from getMember.
**What I kept as-is:** GraphQL member lookup, shared service logic, REST authentication, and existing appointment routes.
**What I changed or rejected, and why:** Removed the REST member lookup and updated docs/tests to reflect GraphQL-only reads. All 73 HTTP/GraphQL tests, full TypeScript check, and whitespace check passed.
**Something the AI got wrong that I had to catch:** Codex initially assumed both transports were wanted because appointment operations exposed both; the user questioned that assumption and requested removal of REST member reads.

## Adopt MediBridge member DTO pattern — 2026-10-01
**Tool(s) used:** Codex; TypeScript check and HTTP/GraphQL tests.
**What I asked for:** Use MediBridge's DTO pattern and prefer its patterns when better than ours.
**What I kept as-is:** getMember(id: ID!) contract, service ID validation, profile fields, and GraphQL-only lookup.
**What I changed or rejected, and why:** Replaced the separate ID DTO with inline @Args and renamed the output class to Member, following the inspected MediBridge pattern with less code. Recorded the conditional preference in backend/AGENTS.md. Full TypeScript check and all 73 HTTP/GraphQL tests passed.
**Something the AI got wrong that I had to catch:** The original separate ID DTO followed our appointment pattern; the user requested MediBridge's simpler member pattern and a future preference for better reference patterns.

## Log GraphQL member lookup — 2026-10-01
**Tool(s) used:** Codex; TypeScript check, HTTP/GraphQL tests, and lint.
**What I asked for:** Investigate getMember NOT_FOUND and missing backend logs after signup/login.
**What I kept as-is:** Provider-only lookup filters, privacy projection, HTTP logging, and the user's password-length edit.
**What I changed or rejected, and why:** Extended the logging interceptor to GraphQL resolver execution, added success/failure/privacy assertions and README troubleshooting. Full TypeScript check and 73 HTTP/GraphQL tests passed; lint retains its existing empty-file warning. Actual target role/ID remains unverified; signup defaults to USER.
**Something the AI got wrong that I had to catch:** The user noticed missing GraphQL logs; the existing interceptor only logged HTTP requests and had not been extended when GraphQL was introduced.

## Signup passwords of 8–100 characters — 2026-10-01
**Tool(s) used:** Codex; member authentication E2E tests.
**What I asked for:** Lower password length to 8–100 characters.
**What I kept as-is:** Existing login validation, password hashing, and unrelated working changes.
**What I changed or rejected, and why:** Updated signup validation and README to 8–100; added boundary acceptance/rejection coverage. All 20 authentication tests and whitespace check passed.
**Something the AI got wrong that I had to catch:** No user-caught mistake recorded for this change.

## Include User profiles in getMember — 2026-10-01
**Tool(s) used:** Codex; TypeScript check and HTTP/GraphQL tests.
**What I asked for:** getMember should also get USER accounts.
**What I kept as-is:** GraphQL contract, active/non-deleted requirements, ADMIN exclusion, and profile field projection.
**What I changed or rejected, and why:** Added USER to the role filter and updated tests/docs so default signup accounts can be retrieved. Full TypeScript check and all 77 HTTP/GraphQL tests passed.
**Something the AI got wrong that I had to catch:** The previous provider-only lookup excluded USER accounts; the user clarified that these should also be returned.
