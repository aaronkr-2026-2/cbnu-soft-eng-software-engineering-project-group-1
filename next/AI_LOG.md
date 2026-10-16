# AI usage log

## Next.js agent instructions — 2026-10-15

**Tool(s) used:** Codex, shell source/path checks, and apply_patch.
**What I asked for:** Create instructions in `next/AGENTS.md` using `backend/AGENTS.md`.
**Pre-planning:** I started with empty Next.js instruction/log files and no application manifest. The existing frontend uses React/Vite.
**Planning:** I retained the backend's maintenance principles and adapted implementation guidance for future Next.js work, with shared planning/product records kept in their existing locations.
**Implementation process:** I added the instructions and initialized the Next.js continuity records. Source/path, current-state, and whitespace checks passed. Application tests were not run for this documentation-only task.
**What I kept as-is:** I preserved the backend instructions, existing applications, and API ownership/contracts.
**What I changed or rejected, and why:** I added server/client boundaries, private-data caching, session handling, and UI verification guidance. I avoided presenting proposed Next.js conventions or commands as existing implementation.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** I kept Next.js guidance separate from existing application behavior so future work starts from verified files rather than assuming a migration already happened.

## Yarn package setup — 2026-10-15

**Tool(s) used:** Codex, apply_patch, shell/Node checks, and web browsing of official package/Yarn metadata.
**What I asked for:** Create package.json for the Next.js project and use Yarn.
**Pre-planning:** I checked the Next.js instructions and continuity records, the reference manifest and Yarn configuration, and local tooling. Yarn and Corepack are unavailable in the shell.
**Planning:** I chose a minimal Next.js/React/TypeScript manifest with pinned Yarn and the reference's node-modules linker, leaving pages and integrations for later work.
**Implementation process:** I added package/Yarn configuration and local ignores, updated Next.js instructions and both READMEs, and checked JSON, React version matching, Yarn/private fields, ignore behavior, and whitespace. No dependency installation or application build was performed; shell registry lookup did not return during the check, so version metadata was checked through browsing.
**What I kept as-is:** I preserved both existing applications, backend package management, environment files, and pre-existing root ignore changes.
**What I changed or rejected, and why:** I selected current published Next.js/React versions instead of copying the reference's older pins or unrelated dependencies. I deferred type-check/lint scripts until their configuration exists.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** I pinned Yarn in the manifest so contributors use the same package manager version and keep one Yarn lockfile for this application.

## README logo — 2026-10-15

**Tool(s) used:** Codex, image viewing, apply_patch, and Python path/whitespace checks.
**What I asked for:** Use the logo in the Next.js README.
**Pre-planning:** I located and visually inspected `next/public/logo.png`.
**Planning:** I chose a centered image at a readable width using a README-relative path.
**Implementation process:** I added the logo at the top of `next/README.md` with alt text and verified the image path and whitespace. Application tests were not needed for this documentation-only edit.
**What I kept as-is:** I preserved the source logo and existing README instructions.
**What I changed or rejected, and why:** I limited the displayed width to 480 pixels so the large source image fits the README comfortably.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** I used a relative image path so the logo can render in repository Markdown without running the Next.js server.

## Reference package scripts — 2026-10-15

**Tool(s) used:** Codex, apply_patch, Node assertions, and whitespace checks.
**What I asked for:** Use the dev/build/start/typecheck scripts from medi-bridge-next.
**Pre-planning:** I checked the current manifest and continuity notes; TypeScript configuration is still absent.
**Planning:** I chose to match the four reference scripts exactly and document their prerequisites.
**Implementation process:** I added `--turbo` to dev and `tsc --noEmit` as typecheck, updated the README, and verified JSON parsing and exact script equality with the reference. Application commands were not run because setup remains incomplete.
**What I kept as-is:** I preserved dependencies, Yarn configuration, and build/start commands.
**What I changed or rejected, and why:** I added the requested scripts without expanding this task into application scaffolding.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** I documented the missing tsconfig so a declared typecheck command is not mistaken for verified TypeScript checking.

## Logo color variables — 2026-10-15

**Tool(s) used:** Codex, apply_patch, Python/Pillow color sampling, and declaration/whitespace checks.
**What I asked for:** Use logo blue as primary, green as secondary, and white.
**Pre-planning:** I used the inspected reference's variable naming and sampled the existing logo's opaque blue and green pixels.
**Planning:** I selected representative colors from the gradient logo and kept three reusable variables in one SCSS file.
**Implementation process:** I created `styles/variables.scss`, documented usage and pending Sass setup in the README, and recorded the palette preference in AGENTS.md. Declaration and whitespace checks passed; no compilation was run because Sass/application wiring is absent.
**What I kept as-is:** I preserved the logo, package dependencies, and existing applications.
**What I changed or rejected, and why:** I used the logo's representative colors instead of the reference project's palette.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** I centralized brand colors so future stylesheet changes can update the palette in one place.

## Shared SCSS foundation — 2026-10-16

**Tool(s) used:** Codex, apply_patch, shell/Python checks, and the reference project's Sass 1.97.3 compiler.
**What I asked for:** Set up the useful styling foundation identified in medi-bridge-next.
**Pre-planning:** I checked project instructions, continuity, current files, and the reference's installed compiler. This project still has no application pages.
**Planning:** I chose shared values and derived runtime tokens, base styles, layout styles, and a feature entry point, with responsive rules kept beside their styles.
**Implementation process:** I created the SCSS import structure, minimal reset, default typography/focus, button and layout styles; added the Sass dependency declaration; and updated documentation/instructions. Full SCSS compilation using the reference compiler, generated-CSS inspection, manifest parsing, and whitespace checks passed. Project installation, Next.js compilation, and browser checks remain pending.
**What I kept as-is:** I preserved logo colors, existing applications, and package scripts.
**What I changed or rejected, and why:** I derived CSS tokens from Sass values to avoid duplicate palettes and preserved keyboard focus. Feature styles will be added as screens are built.
**Something the AI got wrong that I had to catch:** No AI error identified during this task.
**One decision I can explain without AI:** I kept responsive rules with each feature so a screen's styles can be understood and changed in one place.

## GraphQL operation structure — 2026-10-16

**Tool(s) used:** Codex, apply_patch, shell/Python, official Apollo documentation search, TypeScript transpilation, Nest GraphQL schema factory, and GraphQL validation.
**What I asked for:** Inspect MediBridge Next's Apollo GraphQL files and create the structure for this Next.js project.
**Pre-planning:** I inspected the reference's client/store/user/admin operations and our resolvers, DTOs, package setup, instructions, and continuity records. Our backend exposes six GraphQL operations and keeps authentication REST.
**Planning:** I kept the user query/mutation layout, added reusable selection fragments, and limited documents to implemented backend contracts.
**Implementation process:** I added three Apollo document files, declared Apollo Client 4/GraphQL/RxJS, and documented their variables/access and integration limits. All six documents passed offline validation against a source-generated backend schema; TypeScript transpilation, JSON parsing, and whitespace checks passed. Dependency installation, full app typecheck/build, and live integration remain unverified.
**What I kept as-is:** I preserved backend behavior, REST authentication, existing frontends, scripts, and styles.
**What I changed or rejected, and why:** I used our `id` argument and `BookAppointmentInput`, shared fragments to keep repeated selections consistent, and omitted unsupported admin/subscription/auth mutations and unrelated client/store features.
**Something the AI got wrong that I had to catch:** The AI's initial verification harness failed module resolution from the root, then failed to resolve source `.js` imports with an unsupported environment option. Tool output identified these; the AI corrected the working directory and registered ts-node's experimental resolver explicitly. Final validation passed (N-01).
**One decision I can explain without AI:** I matched documents to our real API so copying another project's folder pattern does not introduce operations our server cannot execute.

## Root landing page with MUI — 2026-10-16

**Tool(s) used:** Codex, Sites skill (local-only design/preview guidance), shell/Python, apply_patch, official MUI documentation, installed Next documentation, pinned Yarn, TypeScript, Webpack build, Prettier, mocked-fetch checks, curl/HTML inspection, and Chrome through computer use.
**What I asked for:** Build the proposed root MedConnect landing page using MUI.
**Pre-planning:** I inspected the existing package, styles, GraphQL documents, current backend discovery resolvers/services, continuity, and the reference Pages Router app/document.
**Planning:** I kept the Pages Router convention, composed the root page from feature components, reused existing public queries through a small fetch helper, and left authentication/booking visibly upcoming. MUI and Sass share runtime color tokens.
**Implementation process:** I added the root/app/document, MUI theme/Emotion SSR integration, responsive landing page, clinic search/doctor dialog with loading/empty/error/retry states, cancellable timed public-query helper, TypeScript config, env example, dependencies/lockfile, and documentation. Yarn install/immutable-lock verification, final typecheck/Webpack builds, seven mocked query checks, HTTP/SSR HTML checks passed. Desktop and 400px layouts were inspected. Successful real backend data integration and menu interactions remain unverified.
**What I kept as-is:** I preserved the existing logo/palette, backend behavior, REST authentication, original Vite frontend, and existing GraphQL contracts.
**What I changed or rejected, and why:** I switched dev/build to Webpack after Turbopack failed local compiler-port access and produced an Emotion cache hydration mismatch. I used native CSS colors instead of unsupported ICSS exports, shipped no mock clinic records, and labeled the sample appointment and upcoming flows clearly.
**Something the AI got wrong that I had to catch:** Tool output caught the AI's unsupported ICSS export assumption, package-command working directory, and an immutable-install mode flag typo; browser/HTML review caught the Turbopack Emotion hydration mismatch. The AI corrected these; N-02/N-03 document the causes and final verification. An initial typecheck before Next generated its type declarations also failed; final checks passed.
**One decision I can explain without AI:** I kept public discovery separate from authentication so the landing page can help visitors explore clinics without storing tokens or pretending booking is ready.

## Combined sign-in and patient signup — 2026-10-16

**Tool(s) used:** Codex, shell/Python, apply_patch, installed Next documentation, Prettier, pinned Yarn type/build checks, temporary mocked auth/session harness and local API fixture, curl, and Chrome computer use.
**What I asked for:** Implement one auth page with in-place sign-in/signup forms, eye controls, disabled Google space for later OAuth, and low Git churn.
**Pre-planning:** I inspected current instructions/state, the reference login route, Nest DTOs/controllers/token issuance/refresh, and existing MUI/styles/public transport. No auth store existed; local `.env.example` was absent.
**Planning:** I reused the current router/theme, kept auth components and REST transport focused, and chose a temporary in-memory session without refresh-token storage. I isolated the disabled Google component and added no OAuth dependencies.
**Implementation process:** I added `/auth`, password and Google components, validation and safe REST submissions, local session expiry/sign-out, auth SCSS, landing links/copy, and documentation. Typecheck/build and 15 mocked checks passed. Chrome verified field switching/eyes/validation, desktop/mobile rendering, and login/signup/home/sign-out using a temporary local fixture. No real accounts or OAuth calls were made.
**What I kept as-is:** I preserved backend contracts, existing public GraphQL discovery, shared branding/theme, package dependencies/lockfile, and environment values.
**What I changed or rejected, and why:** I used USER-only signup and kept Google disabled. I did not add persistent storage, refresh loops, or a new auth server; those would expand the current scope. I removed the stale README env-example copy step instead of recreating a removed file.
**Something the AI got wrong that I had to catch:** Browser automation exposed a maximum-update-depth error while entering signup fields. The AI added equality guards to field/error updates; keyboard retest and fixture signup passed, but the original trigger was not isolated (N-04). Tool output also caught a mock-harness rerun from the wrong working directory; the AI reran it successfully in next/.
**One decision I can explain without AI:** I kept OAuth in a separate disabled component so adding Google's real flow later does not require rewriting the email/password form.
