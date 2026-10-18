# AI_LOG.md

Follow the logging rules in `backend/AGENTS.md`: log code tasks only after implementation and verification, and completed documentation tasks only when their workflow requires it. Do not log conversational chats, chat-only prompts, preliminary discussion, or planning-only work. Use the following template for eligible entries.

---

## [Milestone name] — [Date]
**Tool(s) used:**
**What I asked for:**
**What I kept as-is:**
**What I changed or rejected, and why:**
**Something the AI got wrong that I had to catch:**

---

These entries summarize SESSION_LOG.md. Dates and validation results refer to the recorded sessions; historical checks were not rerun for this backfill. Related requests on the same date are grouped into milestones. Codex is listed as the AI tool, as I confirmed. The reflection fields include recorded corrections and preference changes; where no specific mistake was documented, that is stated explicitly.

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
**Something the AI got wrong that I had to catch:** No AI error identified during this task.

## Use GraphQL only for member lookup — 2026-10-01
**Tool(s) used:** Codex; TypeScript check and HTTP/GraphQL tests.
**What I asked for:** Remove REST from getMember.
**What I kept as-is:** GraphQL member lookup, shared service logic, REST authentication, and existing appointment routes.
**What I changed or rejected, and why:** Removed the REST member lookup and updated docs/tests to reflect GraphQL-only reads. All 73 HTTP/GraphQL tests, full TypeScript check, and whitespace check passed.
**Something the AI got wrong that I had to catch:** Codex initially assumed both transports were wanted because appointment operations exposed both; I questioned that assumption and requested removal of REST member reads.

## Adopt MediBridge member DTO pattern — 2026-10-01
**Tool(s) used:** Codex; TypeScript check and HTTP/GraphQL tests.
**What I asked for:** Use MediBridge's DTO pattern and prefer its patterns when better than ours.
**What I kept as-is:** getMember(id: ID!) contract, service ID validation, profile fields, and GraphQL-only lookup.
**What I changed or rejected, and why:** Replaced the separate ID DTO with inline @Args and renamed the output class to Member, following the inspected MediBridge pattern with less code. Recorded the conditional preference in backend/AGENTS.md. Full TypeScript check and all 73 HTTP/GraphQL tests passed.
**Something the AI got wrong that I had to catch:** The original separate ID DTO followed our appointment pattern; I requested MediBridge's simpler member pattern and a future preference for better reference patterns.

## Log GraphQL member lookup — 2026-10-01
**Tool(s) used:** Codex; TypeScript check, HTTP/GraphQL tests, and lint.
**What I asked for:** Investigate getMember NOT_FOUND and missing backend logs after signup/login.
**What I kept as-is:** Provider-only lookup filters, privacy projection, HTTP logging, and my password-length edit.
**What I changed or rejected, and why:** Extended the logging interceptor to GraphQL resolver execution, added success/failure/privacy assertions and README troubleshooting. Full TypeScript check and 73 HTTP/GraphQL tests passed; lint retains its existing empty-file warning. Actual target role/ID remains unverified; signup defaults to USER.
**Something the AI got wrong that I had to catch:** I noticed missing GraphQL logs; the existing interceptor only logged HTTP requests and had not been extended when GraphQL was introduced.

## Signup passwords of 8–100 characters — 2026-10-01
**Tool(s) used:** Codex; member authentication E2E tests.
**What I asked for:** Lower password length to 8–100 characters.
**What I kept as-is:** Existing login validation, password hashing, and unrelated working changes.
**What I changed or rejected, and why:** Updated signup validation and README to 8–100; added boundary acceptance/rejection coverage. All 20 authentication tests and whitespace check passed.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.

## Include User profiles in getMember — 2026-10-01
**Tool(s) used:** Codex; TypeScript check and HTTP/GraphQL tests.
**What I asked for:** getMember should also get USER accounts.
**What I kept as-is:** GraphQL contract, active/non-deleted requirements, ADMIN exclusion, and profile field projection.
**What I changed or rejected, and why:** Added USER to the role filter and updated tests/docs so default signup accounts can be retrieved. Full TypeScript check and all 77 HTTP/GraphQL tests passed.
**Something the AI got wrong that I had to catch:** The previous provider-only lookup excluded USER accounts; I clarified that these should also be returned.

---

## First sprint example — 2026-10-08

**Tool(s) used:** Codex; local file inspection with rg, cat, and sed; Git status.
**What I asked for:** Show a first-sprint file example in chat.
**What I kept as-is:** Existing REST authentication, GraphQL appointment operations, shared services, 30-minute slots, and clinic approval prerequisites.
**What I changed or rejected, and why:** Drafted a proposed one-week plan around clinic approval and weekly availability APIs, with a 20-hour solo capacity assumption, acceptance checks, estimates, tasks, check-ins, and definition of done. Displayed the example in chat; did not implement backlog items or create GitHub Issues. Remote issues were not reviewed; no application tests were run.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Prioritize approval and schedule setup because existing booking requires both, and neither currently has a management API.

---

## October 1–8 sprint example — 2026-10-08

**Tool(s) used:** Codex; local file/code inspection with cat, tail, and rg; Git log/status; apply_patch; Git whitespace check.
**What I asked for:** Create a first-sprint example for October 1–8, including Swagger.
**What I kept as-is:** Existing application behavior and prior logs; the actual October 1 member/logging/password work and October 8 Swagger evidence.
**What I changed or rejected, and why:** Created SPRINT_01.md as a retrospective example with six selected items, top-two acceptance checks, illustrative 20-hour capacity, estimates, tasks, check-ins, definition of done, and recorded results. Distinguished assumed planning details from historical outcomes; did not rerun application tests or create GitHub Issues.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Use recorded work for the requested period, and label estimates/check-ins as examples because no historical hours or check-in records are available.


---

## Finalize Sprint 01 document — 2026-10-08

**Tool(s) used:** Codex; local instruction, sprint, README, test, and log inspection; Git history/status; Python text editing; Git whitespace check.
**What I asked for:** Turn the October 1–8 example into a finished sprint Markdown document and apply my additions to AGENTS.md.
**What I kept as-is:** Sprint dates, member/Swagger scope, historical validation evidence, estimates, and known documentation gaps.
**What I changed or rejected, and why:** Finalized SPRINT_01.md with colored workflow labels, a delivery review, and evidence-based completion checks. Kept capacity assumptions and unconfirmed check-ins explicit. Changed third-person references in earlier AI log entries to my voice. No application code changed or application tests rerun.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Separate workflow labels from delivery outcomes because Doing alone cannot show that implementation is complete, and leave review/manual checks open until their results are recorded.

---

## README quality review — 2026-10-08

**Tool(s) used:** Codex; local README, backend configuration, instructions, deployment files, and session-log inspection with cat, rg, sed, and nl; Git whitespace check.
**What I asked for:** Assess whether the README is professional and needs polishing.
**What I kept as-is:** README and application files; detailed API contracts, privacy rules, booking prerequisites, and test limitations.
**What I changed or rejected, and why:** Recorded review findings only. Prioritized the missing backend working directory, startup/environment prerequisites, stale booking/resolver statements, inconsistent port examples, and organization. Deployment scripts also need reconciliation with the repository layout before documenting reproducible deployment. No README rewrite or application tests performed.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Fix copyable setup instructions and stale claims before cosmetic formatting because a new developer must be able to start the project and trust its documented behavior.


---

## README maintenance and polish — 2026-10-08

**Tool(s) used:** Codex; local instruction/configuration/source inspection; apply_patch; Python editing and document checks; Git status and whitespace checks.
**What I asked for:** First add README maintenance instructions to AGENTS.md, then update the README when needed.
**What I kept as-is:** Application behavior, API contracts and examples, privacy/booking rules, testing limitations, and project logging requirements.
**What I changed or rejected, and why:** Added README maintenance rules before editing README.md. Reorganized the README with navigation, backend quick start, environment table, consistent port examples, production build steps, architecture, API details, deployment limitations, and project links. Removed stale booking/resolver claims. Documented the existing database variable mismatch without changing application code. Structure, fences, local links, anchors, npm script references, and whitespace checks passed; application tests and live deployment checks were not run.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Document the configuration the code actually uses, including known inconsistencies, so a fresh checkout has reliable startup instructions without silently changing runtime behavior.


---

## Remove reference-project wording from README — 2026-10-08

**Tool(s) used:** Codex; local file inspection; apply_patch; Python reference check; Git whitespace check.
**What I asked for:** Remove MediBridge structure-copy references from the README.
**What I kept as-is:** Architecture tree, folder conventions, API documentation, and application behavior.
**What I changed or rejected, and why:** Reworded the architecture introduction around MedConnect and removed the comparison to the reference project's multi-app/Redis setup. Verified no reference-project mentions remain in README.md; whitespace check passed. No application tests run for this wording change.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Describe the repository's actual structure directly so readers can understand MedConnect without knowing another project.


---

## Existing features list and maintenance rule — 2026-10-08

**Tool(s) used:** Codex; local Markdown/source inspection; apply_patch; Python document checks; Git whitespace check.
**What I asked for:** Add an Existing Features list to README and save the instruction to update it whenever a feature is added in AGENTS.md.
**What I kept as-is:** Application behavior, detailed API documentation, and existing project instructions.
**What I changed or rejected, and why:** Expanded the existing feature summary under the requested title, updated navigation, and saved the ongoing rule in backend/AGENTS.md. Included frontend starter screens with sample-data and unverified integration limitations. Heading, navigation, maintenance instruction, local links, and whitespace checks passed; application tests were not run for documentation-only changes.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Maintain one feature inventory based on implemented behavior so new features are discoverable without presenting planned work as complete.


---

## Move Sprint 01 into backend — 2026-10-08

**Tool(s) used:** Codex; rg and local file inspection; Python move/edit and document checks; Git whitespace check.
**What I asked for:** Move SPRINT_01.md into backend and update references to its location whenever needed.
**What I kept as-is:** Sprint content and historical log entries.
**What I changed or rejected, and why:** Moved the document to backend/SPRINT_01.md, updated its README link, and saved the location and reference-maintenance rule in backend/AGENTS.md. Updated current session context. Content preservation, file location, README link, and whitespace checks passed. No application tests run for this documentation-only change.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Update active links and instructions when a document moves so readers and future edits use the same location.


---

## Save product documentation workflow — 2026-10-08

**Tool(s) used:** Codex; local instructions/session inspection; apply_patch; Python instruction checks; Git whitespace check.
**What I asked for:** Polish my supplied product documentation workflow for AGENTS.md and add it there.
**What I kept as-is:** Existing project instructions, product documents, application behavior, and unrelated changes.
**What I changed or rejected, and why:** Added the workflow to backend/AGENTS.md in its existing heading/bullet style, retaining root-relative paths, persona grounding, stable IDs, story count, gap mapping, simulated critique, logging, and requested-only commit/push rules. Made the workflow conditional on a product documentation request; did not execute it. Required content and whitespace checks passed.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Save reusable instructions separately from performing the review so future documentation work follows the supplied evidence and completion rules.


---

## Move AI collaboration log into backend — 2026-10-08

**Tool(s) used:** Codex; rg/local document inspection; Python file move, edits, and link/path checks; Git whitespace check.
**What I asked for:** Move AI_LOG.md into backend and update its location.
**What I kept as-is:** Existing log entries, application behavior, and unrelated changes.
**What I changed or rejected, and why:** Moved the log to backend/AI_LOG.md and updated active references in README, backend/AGENTS.md, sprint, project guide, log introduction, and current session context. Recorded a rule to update references when the log moves again. Move preservation, link/path, and whitespace checks passed; application tests not run for documentation-only changes.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Keep existing log history intact while updating active instructions so future entries go to the new location.


---

## Ground Alex in the creator — 2026-10-08

**Tool(s) used:** Codex; local file inspection; apply_patch; Python content checks; Git whitespace check.
**What I asked for:** Apply my clarification that Alex represents me to the persona document.
**What I kept as-is:** Alex alias and the three story IDs from the example; unrelated files and application behavior.
**What I changed or rejected, and why:** Populated the empty docs/product/personas.md with my confirmed grounding, a persona card, provisional scenario, and three proposed stories. Left age, background, and healthcare needs unconfirmed rather than treating the illustrative student/part-time-job details as my biography. Secondary persona and full workflow remain pending. Grounding, IDs, and whitespace checks passed.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Confirming whom a persona represents does not confirm every detail in an illustrative example, so personal facts and proposed needs must remain separate.


---

## Document OAuth sign-in gap — 2026-10-08

**Tool(s) used:** Codex; local persona/session/authentication source inspection; apply_patch; Python document checks; Git whitespace check.
**What I asked for:** Add our desired OAuth sign-in to Alex’s scenario and record it as a gap to fill.
**What I kept as-is:** Existing story IDs, unconfirmed biography/healthcare needs, and application behavior.
**What I changed or rejected, and why:** Added P1-S04 for external-account sign-in and a Backlog mapping with rationale and next actions. Recorded my confirmation that OAuth is wanted but absent; provider, account roles, and avoiding another password remain unresolved. Labeled AI persona critique as simulation. Story/mapping/link/whitespace checks passed; no runtime verification or implementation. Four stories total; full inventory, other mappings, and secondary persona remain pending.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Put OAuth in the backlog map rather than the existing-feature inventory because it is a requested capability that has not been implemented.


---

## Split into three personas — 2026-10-08

**Tool(s) used:** Codex; local document inspection; clarification tool; Python edits/structure checks; Git whitespace check.
**What I asked for:** Divide the document into three personas, each with one scenario and one story; the other two represent my friends.
**What I kept as-is:** Alex’s creator grounding, OAuth story ID and Backlog status, and unrelated changes.
**What I changed or rejected, and why:** Split the document into Alex, Friend 1, and Friend 2; adapted existing booking/status examples as explicitly provisional friend scenarios. Updated gap mappings and AGENTS.md to the latest three-story preference, with old IDs reserved and migration recorded. Asked for friends’ aliases, roles, and background instead of inventing them. Three sections/scenarios/stories, IDs, mappings, and whitespace checks passed; no runtime verification. Full feature inventory/orphan review remains pending.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Knowing the personas represent real friends does not establish their roles or needs, so those details remain provisional until supplied.

**Follow-up clarification:** I supplied John and Eddy as the friends, with “my friend” as their alias. Updated persona names, grounding, mappings, and instructions; their roles and personal circumstances remain unconfirmed.


---

## Adapt architecture agent instructions — 2026-10-15

**Tool(s) used:** Codex; local source/document inspection; apply_patch; Python path/structure/whitespace checks; Git whitespace check.
**What I asked for:** Match my supplied architecture prompt to this project’s AGENTS.md.
**Pre-planning:** Inspected existing instructions and session context, React routes/auth/API clients, and Nest transport/service/guard/model/module wiring. Found existing duplicate client definitions and mock auth paths; did not treat the frontend as fully integrated.
**Planning:** Extend the existing backend/AGENTS.md with project-specific boundaries and conditional architecture documentation, preserving established conventions.
**Implementation process:** Added flow tracing, service interfaces, reuse, data ownership, server security, inventory/diagram/critique requirements, and evidence-based review criteria. Source paths, instruction structure, whitespace, and git diff --check passed. No application tests needed for instructions; no review or refactor executed.
**What I kept as-is:** Existing backend conventions, application behavior, local-only instruction/session files, and pre-existing architecture documents.
**What I changed or rejected, and why:** Adapted the generic prompt to React/Vite, Zustand, Nest REST/GraphQL, and Mongoose; kept shared transport rules and current direct model reads explicit rather than inventing new service layers.
**Something the AI got wrong that I had to catch:** An initial session-log patch failed because its context was incorrect; Codex corrected the patch before completing the update.
**One decision I can explain without AI:** Architecture documentation belongs with reviews and boundary changes; small routine edits should stay focused.


---

## Document backend architecture and integrations — 2026-10-15

**Tool(s) used:** Codex; local source/package/script inspection; apply_patch; Python document/link/version checks; Git whitespace check.
**What I asked for:** Add backend architecture text and include our stack, technologies, and shared services such as OAuth, emails, and APIs.
**Pre-planning:** Read project instructions/session context and traced modules, controllers/resolvers, auth/booking services, schemas, shared infrastructure, frontend API callers, and deployment assets. The backend architecture file was empty.
**Planning:** Document implemented behavior with source references and separate unimplemented integrations; add supporting inventory/diagrams/concerns required by the architecture workflow.
**Implementation process:** Populated architecture-backend.md; added inventory.md, architecture.md with logical/deployment Mermaid diagrams, and critique.md; linked them from README and updated session context. Local links, declared version ranges, document/fence structure, whitespace, and git diff --check passed. No application tests or live service checks; diagrams were not rendered.
**What I kept as-is:** Application behavior, backend boundaries, deployment scripts, credentials, and previous log entries.
**What I changed or rejected, and why:** Identified internal email/password authentication separately from email delivery and OAuth. Recorded Google sign-in as backlog and Telegram fields as schema support, without inventing provider integrations. Proposed proportionate fixes for verified source inconsistencies rather than expanding into implementation.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** A provider ID field or an email login does not prove OAuth or mail delivery exists; architecture documents must distinguish those capabilities from working integrations.


---

## Consolidate architecture documentation — 2026-10-15

**Tool(s) used:** Codex; local document inspection; Python edits and link/anchor/structure checks; Git whitespace check.
**What I asked for:** Use only architecture-backend.md and remove architecture.md, critique.md, and inventory.md.
**Pre-planning:** Inspected the four documents and their README/instruction references.
**Planning:** Preserve useful diagrams and concerns within the backend document, reusing its component and data tables instead of duplicating the inventory.
**Implementation process:** Consolidated diagrams and concerns, removed the three extra files, and updated README, AGENTS.md, and session context. Single-file layout, links/anchors, two Mermaid blocks, whitespace, and git diff --check passed. No application tests or diagram rendering.
**What I kept as-is:** Stack, integration status, data ownership, security details, verification limits, application behavior, and historical records.
**What I changed or rejected, and why:** Replaced the multi-document workflow with my requested single-document preference so future work follows the same layout.
**Something the AI got wrong that I had to catch:** I clarified that the three supporting architecture files were unnecessary; Codex had created them following the earlier workflow.
**One decision I can explain without AI:** Keeping related architecture information in one document avoids maintaining duplicate descriptions and cross-file links.


---

## Implement Google sign-in backend — 2026-10-15

**Tool(s) used:** Codex; local MedConnect/MediBridge inspection; official Google identity documentation; npm; apply_patch/Python; Nest build; TypeScript; Jest/Supertest; Oxlint; Git/document checks.
**What I asked for:** Implement Google sign-in using the revised proposal: no phone requirement for Google accounts, provider-supplied names as nicknames, and unique google_user000000-style fallbacks.
**Pre-planning:** Traced existing member schemas, DTOs, controllers/services/modules, password/session handling, test persistence substitutes, and MediBridge Google verification/account creation. Preserved REST authentication and the existing access/refresh contract. No .env values read or copied.
**Planning:** Isolate provider verification in GoogleAuthService; keep identity/account/session writes in MemberService. Use nonce-bound ID tokens, create new USER accounts immediately, omit phone/password, and handle nickname/identity races through unique indexes and bounded retries. Reject existing-email conflicts rather than auto-linking.
**Implementation process:** Installed google-auth-library; added nonce/login endpoints, DTO, middleware registration, verifier, shared identity type, conditional phone requirement, account creation and existing session reuse. Tests use real verification of locally signed RSA tokens with only key retrieval and persistence substituted. Build/full TypeScript check, 100 HTTP tests, 6 unit tests, links/fences/whitespace, lockfile consistency, and git diff --check passed. Lint has only the existing empty config.ts warning. Updated README, architecture/diagrams, scoped product status, and session context. No live provider or Atlas integration test; frontend Google button and explicit linking remain pending.
**What I kept as-is:** Email/password phone/nickname validation, protected-route current-account checks, appointment behavior, refresh rotation/lifetime, allowlisted responses, and server-only credentials. The client secret is not used by this ID-token flow.
**What I changed or rejected, and why:** Removed the proposed phone onboarding step for Google accounts as requested. Kept new Google registration USER-only and no automatic email linking. Added browser nonce binding to prevent accepting a Google login detached from the initiating browser. Omitted missing sparse-unique fields instead of storing nulls.
**Something the AI got wrong that I had to catch:** Automated checks caught Codex importing a test enum not exported by google-auth-library, expecting the wrong refresh HTTP status, and constructing an expired JWT fixture with conflicting options. Codex corrected these before the passing verification run; I did not manually identify these test errors.
**One decision I can explain without AI:** Google sub is the stable identity; names are display labels that can collide, so nickname retries must not create or merge another person's account.


---

## Create Sprint 02 and automatic delivery updates — 2026-10-15

**Tool(s) used:** Codex; local source/test/planning and Git history inspection; apply_patch; Python document/link checks; git diff --check.
**What I asked for:** Add automatic sprint updates after completed features/fixes and create the second-week sprint record.
**Pre-planning:** Checked Sprint 01's October 1–8 period, current Google implementation, prior verification records, local mistake register, product gap map, and existing instructions. OAuth commit c20b395 is dated October 15.
**Planning:** Use October 9–15 for Sprint 02; record completed backend scope separately from browser/live-integration follow-up, preserve Sprint 01, and label capacity/effort as retrospective assumptions.
**Implementation process:** Added AGENTS.md delivery-update rules and numbered sprint handling; created SPRINT_02.md with seven prioritized entries, two refined backend items, ordered tasks, proposed check-ins, delivery evidence and open acceptance; updated README navigation and session context. Document links/anchors, unique backlog IDs, labels, commit date, unchanged Sprint 01, whitespace, and git diff --check passed. No application tests rerun, remote issues published/reviewed, or backlog features implemented.
**What I kept as-is:** Closed Sprint 01, application behavior, no-conversation/no-preimplementation-code-log rules, and historical verification results.
**What I changed or rejected, and why:** Replaced the hard-coded instruction to always edit Sprint 01 with the matching numbered sprint. Did not claim full browser OAuth completion, measured hours, peer review, or historical check-ins.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Record delivery in the sprint covering its actual date and preserve incomplete integration work, so sprint history stays accurate.

## Next GraphQL preparation README alignment — 2026-10-16

**Tool(s) used:** Codex, apply_patch, shell/Python, and offline GraphQL schema validation.
**What I asked for:** Create the Next.js GraphQL structure based on MediBridge's Apollo folder.
**Pre-planning:** I checked current backend resolvers/DTOs and the Next.js reference; detailed implementation is recorded in `next/AI_LOG.md`.
**Planning:** I aligned the root README with the prepared documents and their pending integration.
**Implementation process:** I updated the root introduction. All six documents passed offline source-schema validation; README path and whitespace checks passed. No backend code or live integration changed.
**What I kept as-is:** I preserved backend API contracts and closed sprint records.
**What I changed or rejected, and why:** I described document preparation without claiming a running Next.js frontend.
**Something the AI got wrong that I had to catch:** Tool output caught initial verification-harness module resolution errors; the AI corrected them. See next/FIXES-and-BUGS.md N-01.
**One decision I can explain without AI:** I kept the README explicit about missing client/session wiring because document validation alone does not prove runtime integration.

## Next landing-page documentation alignment — 2026-10-16

**Tool(s) used:** Codex, shell/Python, source inspection, and Next build/type/HTML checks.
**What I asked for:** Implement the proposed MUI root landing page.
**Pre-planning:** I checked public member discovery contracts and the existing architecture/README descriptions; Next implementation detail is recorded in `next/AI_LOG.md`.
**Planning:** I aligned shared documentation with the implemented public discovery boundary and its verification limits.
**Implementation process:** I updated the root overview/features and architecture discovery flow. Next build/typecheck and seven mocked transport checks passed; desktop/mobile layout reviewed. No backend behavior changed, and successful real API integration remains unverified.
**What I kept as-is:** I preserved backend business rules, authentication, persistence, and closed sprint records.
**What I changed or rejected, and why:** I described the landing page without claiming sign-in, booking, or live database integration was delivered.
**Something the AI got wrong that I had to catch:** Runtime/browser checks identified Next theme/bundler integration mistakes; the AI corrected them. See next/FIXES-and-BUGS.md N-02/N-03.
**One decision I can explain without AI:** I documented the public read-only client separately from protected booking because they have different credentials and ownership boundaries.

## Next auth-page documentation alignment — 2026-10-16

**Tool(s) used:** Codex, source/shell/Python checks, Next type/build checks, mocked transport/session checks, and Chrome with a temporary fixture.
**What I asked for:** Implement the agreed combined sign-in/signup page, with no OAuth handler yet.
**Pre-planning:** I checked backend member DTOs/controller/token lifecycle and existing shared documentation.
**Planning:** I kept auth writes owned by Nest and documented the new browser REST adapter and session limits.
**Implementation process:** I updated the root feature list and shared architecture notes. Next typecheck/build and 15 mocked checks passed; fixture browser login/signup/sign-out passed. No backend source or real account changed.
**What I kept as-is:** I preserved all backend contracts, refresh/Google behavior, and closed sprint records.
**What I changed or rejected, and why:** I documented temporary in-memory client sessions and disabled Google without claiming persistent sessions or real integration.
**Something the AI got wrong that I had to catch:** Browser/tool checks caught a repeated field-update symptom and a harness working-directory error; the AI applied guards and corrected the command. See next/FIXES-and-BUGS.md N-04 and next/AI_LOG.md.
**One decision I can explain without AI:** I kept authentication verification on the server; the browser's member/expiry state only controls presentation.

## Next Google sign-in documentation alignment — 2026-10-16

**Tool(s) used:** Codex, source/shell/Python inspection, official Google documentation, Next type/build checks, mocked Google/auth/session checks, and local preview attempts.
**What I asked for:** Add Google auth to the Next.js auth page.
**Pre-planning:** I checked GoogleAuthService, member controller/service, nonce cookies, CORS, and shared response/session contracts.
**Planning:** I preserved backend ownership of identity verification and account/session writes and documented the new browser callback boundary.
**Implementation process:** I updated root README/features and architecture descriptions. Next build/typecheck and 31 mocked checks passed. No backend source or real account changed; live Google/Nest/database completion remains unverified.
**What I kept as-is:** I preserved signed browser-bound nonces, Google signature/audience/issuer verification, existing account conflict rules, and closed sprint records.
**What I changed or rejected, and why:** I documented implemented frontend wiring separately from unverified provider/database completion, without claiming a successful live login.
**Something the AI got wrong that I had to catch:** No AI error identified during this task. Native Chrome page capture limited verification; it was not classified as a backend defect.
**One decision I can explain without AI:** I kept Google ID tokens distinct from MedConnect access tokens so only the backend's session authorizes application requests.
## Apply saved doctor-directory API — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, Git patch/source checks, npm/Nest build, and Jest/Supertest.

**What I asked for:** Add the previously saved backend implementation on the backend branch.

**Pre-planning:** I checked the branch, Git state, backend continuity/lessons and current member service/resolver against the preserved patch. This branch lacks the shared projection and clinic-discovery methods used as patch context.

**Planning:** I adapted the saved doctor query to this branch, sharing getMember's unchanged public allowlist and applying the saved doctor tests without adding unrelated clinic endpoints.

**Implementation process:** I added getDoctors/listDoctors and shared publicFields, applied two focused tests and their fixture, and updated README/architecture documentation. Backend build and all 13 focused member GraphQL tests passed with mocked persistence; whitespace passed. Live database and browser integration were not run.

**What I kept as-is:** I preserved existing member lookup, authentication, private-field exclusions, frontend handoff files, and closed sprint history.

**What I changed or rejected, and why:** I adapted the patch instead of assuming identical branch contents. The query returns up to 100 active, approved, nondeleted doctors in deterministic name/ID order.

**Something the AI got wrong that I had to catch:** No AI error identified during this task. The patch compatibility check identified branch differences before application, which the AI handled explicitly.

**One decision I can explain without AI:** I share the existing public-field allowlist so member lookup and the doctor directory expose the same approved profile fields.

## Resolve main/backend discovery merge — 2026-10-18

**Tool(s) used:** Codex, Git, shell/Python, Nest build, Jest/Supertest.
**What I asked for:** Resolve the merge conflicts blocking the main/backend merge.
**Pre-planning:** The ongoing merge conflicted in the member resolver, service, and this log; main added clinic discovery while backend added the doctor directory.
**Planning:** Preserve both discovery APIs, the shared public projection, and both branches' historical log entries.
**Implementation process:** Combined getClinics/getClinicDoctors with getDoctors and their service methods, retained both log histories, and corrected the README's outdated pending-doctor-API statement. Added three merge regression cases for combined discovery, clinic-scoped doctor filtering, and invalid clinic IDs; adapted the fixture to compare ObjectIds by value. Backend build and all 16 focused member GraphQL tests passed with mocked persistence. Live database/browser integration was not run. No sprint covers October 18; closed sprint records were preserved.
**What I kept as-is:** Existing authentication, public projections, clinic ID validation, directory filters, sorting, limits, and unrelated merged changes.
**What I changed or rejected, and why:** Kept both branches' independent APIs rather than choosing one side and losing discovery behavior.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Clinic-specific and global doctor discovery serve different callers, so both queries must survive the merge.

## Adapt MediBridge image uploads — 2026-10-18

**Tool(s) used:** Codex; local reference/source inspection; graphql-upload-ts official GitHub documentation; npm, Nest build, Oxlint, Jest/Supertest, Prettier, Git diff checks.
**What I asked for:** Adapt MediBridge's file uploader into this backend.
**Pre-planning:** MediBridge exposes authenticated imageUploader/imagesUploader mutations with local static URLs, 10 MB/file and five files/request. This backend already has a current-member guard but no uploader. Local session/bug registers were absent.
**Planning:** Preserve the reference mutation names and supported image formats, place filesystem logic in its own feature service, reuse MemberAccessGuard, and limit targets to this app's member/clinic features. Keep uploads independent of profile database writes.
**Implementation process:** Added upload resolver/service/module and shared multipart/static HTTP configuration; installed graphql-upload-ts with lockfile; allowed Apollo's preflight header in CORS; ignored uploaded files. Added UUID naming, signature/size/target validation, hidden temporary writes and cleanup. Updated README and architecture diagrams/contracts. Build passed; lint passed with a pre-existing empty config.ts warning. Full E2E: 112 passed, 2 existing status-page/assets 404 failures; all 12 uploader tests passed. Local listening tests required sandbox escalation. No live MongoDB/deployment/browser upload checks performed. No sprint covers October 18; Sprint 02 ended October 15 and was preserved.
**What I kept as-is:** REST authentication, public member reads, appointment behavior, Apollo CSRF protection, and profile persistence contracts.
**What I changed or rejected, and why:** Restricted reference targets to member/clinic because product/article features do not exist here; reject and clean failed batches instead of returning a partial success list. Images remain publicly readable; private records, object storage, quotas/retention and profile editing are outside this implementation.
**Something the AI got wrong that I had to catch:** Codex review found a plain-object MIME lookup could select inherited properties; it added an own-property check before delivery. See local B-002. The status test failures are pre-existing/unmodified behavior, not an uploader regression fix.
**One decision I can explain without AI:** Return a generated public URL without writing memberImage, so file storage has one clear responsibility and profile changes can enforce their own account ownership rules.


## Integrate MediBridge clinic and doctor cities — 2026-10-18

**Tool(s) used:** Codex; local reference/source inspection, Python enum comparison, Nest build, Oxlint, Jest/Supertest, Prettier for the new enum, Git diff checks.
**What I asked for:** Integrate MediBridge cities for clinic and doctor accounts.
**Pre-planning:** MediBridge defines a ten-value Location enum in appointment.enum.ts and exposes optional location in member DTOs; our member schema/signup/public projections had no city field. Existing uploader work was already committed in the backend branch when this task began.
**Planning:** Reuse exact names/values in a dedicated location.enum.ts. Make location optional to preserve existing signup/accounts, restrict writes to CLINIC/DOCTOR, and expose it through existing auth/profile contracts. Each account stores its own city without affiliation-derived copying.
**Implementation process:** Added Location enum, signup enum validation, service role check/storage, schema constraints, GraphQL nullable field, response projections/types, and README/architecture documentation. Exact enum names/values/order match all ten reference entries. Build passed; lint passed with pre-existing empty config.ts warning; both focused E2E suites passed 70/70. Tests cover all ten cities, schema rejection, invalid/null/USER input, doctor signup/login/refresh, public profiles/directory, and legacy doctor with no city. Persistence is simulated; no live MongoDB or browser checks/full-suite rerun. No sprint covers October 18; closed history unchanged.
**What I kept as-is:** Existing auth/appointment/upload interfaces, optional legacy data, public-field privacy allowlists, and clinic affiliation rules.
**What I changed or rejected, and why:** Used the reference location field instead of adding separate clinicCity/doctorCity properties. City editing, filtering, automatic doctor-city inheritance, and migration were outside this request.
**Something the AI got wrong that I had to catch:** The first directory test query included location but its exact response assertion omitted the new field. Automated testing caught this; the expectation was corrected and both suites rerun successfully.
**One decision I can explain without AI:** Keep location optional so adding a city list does not break existing accounts or invent a city for records without one.


## Derive doctor city from their clinic — 2026-10-18

**Tool(s) used:** Codex; local source inspection, Nest build, Oxlint, Jest/Supertest, Prettier for MemberService, Git diff checks.
**What I asked for:** Require clinic city at signup and derive doctor city from the chosen clinic, reflecting workplace changes.
**Pre-planning:** The initial city implementation allowed independent doctor cities. The clarified requirement makes clinic location authoritative; no workplace-change API currently exists.
**Planning:** Require city on CLINIC signup and schema validation, reject doctor/user city input, and hydrate doctor output from clinicId on every read. Reuse one helper for auth/profile/directory and batch clinic lookups for directory results; do not migrate live data or build an unrequested affiliation-change API.
**Implementation process:** Revised DTO/service/schema rules and response hydration; updated persistence mocks and tests for required clinic city, rejected doctor city, absent doctor city storage, signup/login/refresh responses, changed clinicId/city, ignored stale doctor values, unavailable/legacy/null clinic city, and batched projections. Build passed; lint passed with existing empty config.ts warning; 79 member E2E tests passed. Tests use simulated persistence; no live database/workplace UI tested. Updated README and architecture. No sprint covers October 18; closed sprint history preserved.
**What I kept as-is:** Doctor signup requires an active clinic and pending affiliation; existing auth/booking/upload behavior and privacy allowlists remain. GraphQL location stays nullable for legacy/unavailable clinic data.
**What I changed or rejected, and why:** Replaced independent doctor city storage with current-clinic lookup so affiliation/city changes need no duplicate-data synchronization. Legacy stored doctor cities are ignored; removal/backfill was not executed. Workplace changes are simulated in tests, not exposed through a new endpoint.
**Something the AI got wrong that I had to catch:** The build caught that Mongoose clinic location can be null while the hydration map accepted only Location/undefined. Codex normalized null to undefined and added a null-city test; build and 79 tests then passed. This is distinct from the clarified product requirement.
**One decision I can explain without AI:** A doctor's city belongs to the workplace, so read it from the current clinic instead of copying it during signup.


## Add updateMember and save-time image replacement — 2026-10-18

**Tool(s) used:** Codex; local MediBridge/source inspection, Nest build, Oxlint, Jest/Supertest, Prettier, Git diff checks.
**What I asked for:** Implement one authenticated updateMember API for profile/phone/name/image and optional password change with confirmation; delete the old owned image after Save, leaving unused-upload cleanup for later.
**Pre-planning:** MediBridge updates an authenticated member with an allowlist, hashed password and validated MongoDB update. Our API had no editing mutation, session revocation version, or upload ownership tracking. Prior city changes were already committed when work began.
**Planning:** Keep one mutation with optional fields and an all-or-nothing password trio. Use a private self-profile result, atomic conditional member writes and authVersion checks. Reuse existing password helpers/city hydration. Add owner directories plus exclusive hidden image attachment markers; defer background cleanup and browser implementation.
**Implementation process:** Added input/self/result DTOs and guarded resolver; implemented allowed updates, unique conflict handling, current-password/confirmation rules, Google password restriction, __v concurrency checks and authVersion on JWT/session paths. Split exported storage wiring from guarded upload transport to avoid a module cycle. New owner-scoped paths and attachment claims protect adoption/deletion; save failure preserves the old image, post-save deletion failures report imageCleanupPending, and external/legacy files are skipped. Updated README/architecture and local records. Build passed; lint passed with existing empty config.ts warning. Full E2E: 175 passed, 2 existing status-page/assets 404 failures. Tests use real GraphQL, validation, hashing and disk with simulated persistence; no live MongoDB/browser/deployment checked. No sprint covers October 18; closed history preserved.
**What I kept as-is:** REST signup/login/refresh, public-profile privacy, clinic-owned city hydration, booking rules, upload format/size/count limits and Apollo CSRF protection. Existing credentials without authVersion map to zero.
**What I changed or rejected, and why:** Excluded account ID/role/status/provider/email/clinic affiliation from generic edits. Only clinics edit clinic name/city. One member write applies all changes; authentication version invalidates old access and refresh credentials without a multi-collection transaction. Old owned attached files are deleted only after success; hidden markers remain to prevent retired-path reuse. Unused uploads, uncertain image claims, cleanup retries and frontend Save UI remain deferred.
**Something the AI got wrong that I had to catch:** Build caught an initial service return type using the GraphQL DTO's string ID instead of the persistence ObjectId; introduced a service response type. Review also caught that the existing city validator needed the trusted query filter's memberType for update validation. Both were corrected before the passing final checks (B-005/B-006).
**One decision I can explain without AI:** Store the new image path successfully before deleting the old file, so a rejected Save cannot remove the currently displayed image.


## Add myProfile for Next.js settings — 2026-10-19

**Tool(s) used:** Codex; repository inspection, apply_patch, Nest build, Oxlint, Jest/Supertest, Prettier, Git diff checks.
**What I asked for:** Add authenticated myProfile with private contact information and canChangePassword for the Next.js settings page, preserving public member fields.
**Pre-planning:** MemberSelf already served private update responses; public Member intentionally excludes email/phone. The update API allows password changes only for EMAIL accounts. Prior updateMember implementation was committed before this task.
**Planning:** Reuse MemberSelf and a shared response mapper; derive the queried ID from the access guard, select only allowed profile/contact data plus internal capability/version inputs, and preserve existing doctor-city hydration.
**Implementation process:** Added guarded no-argument myProfile, current-account/version recheck and private projection. Added canChangePassword to MemberSelf and persistence-aware service types; reused mapping for query/update responses. Updated README with the complete frontend query and architecture boundaries. Build passed; lint passed with existing empty config.ts warning; 73 focused profile/update E2E tests passed. Tests use simulated persistence; no live database/frontend check or full-suite rerun. No sprint covers October 19; closed history unchanged.
**What I kept as-is:** Public Member/getMember/getDoctors fields, credential privacy, authentication/session checks, clinic-derived doctor city, and server-side password-change enforcement.
**What I changed or rejected, and why:** Added an authenticated self-query instead of expanding public query contact fields or relying on stale frontend session identity. Capability is computed from the account provider and is a UI hint, not authorization.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** Resolve the user from the authenticated token instead of accepting an ID, so the private profile endpoint cannot select someone else's account.


## Resolve main/backend profile and upload merge — 2026-10-19

**Tool(s) used:** Codex; Git conflict/status/diff inspection, source editing, npm ci from local cache, Nest build, Oxlint, Jest/Supertest.
**What I asked for:** Help with the failed main/backend merge and the unmerged-files error preventing another merge.
**Pre-planning:** The outer main checkout was already merging backend commit 6153660. Five files conflicted: .gitignore, AI_LOG, MemberService, member tests and architecture. Main had clinic discovery; backend added uploader, clinic cities, member editing and private myProfile.
**Planning:** Resolve the existing merge in place, retain both feature sets and log histories, combine test fixture ObjectId/batched-clinic handling, and verify auto-merged projections as well as marked conflicts. Leave the result staged for the final merge commit.
**Implementation process:** Preserved both ignore rules/history/architecture flows, clinic discovery and backend profile methods. Restored the shared projection in getMember and hydrated cities for getClinicDoctors; strengthened existing clinic discovery tests to request city fields. Installed the merged lockfile dependencies offline after the outer checkout lacked graphql-upload-ts. Final build passed; lint passed with the existing empty config.ts warning; all seven E2E suites and 192 tests passed in the outer checkout. No live DB/browser/deployment checks. No sprint covers October 19; closed records unchanged. No merge commit or push performed.
**What I kept as-is:** Both branches' APIs, public/private profile boundaries, session invalidation, image ownership, clinic filters, and unrelated automatically merged files.
**What I changed or rejected, and why:** Combined the conflicting additions instead of selecting a whole branch; the clinic-specific doctor query also needs the new clinic-derived city rule. No merge abort, branch reset, deployment, or worktree synchronization was used.
**Something the AI got wrong that I had to catch:** No AI error identified during this task. Initial build/upload-test failures identified a missing local dependency; installing the existing lockfile fixed setup without altering application behavior.
**One decision I can explain without AI:** Resolve the merge already in progress and preserve both independent features; starting another merge cannot work while Git still has unmerged entries.
