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

## Google Identity Services sign-in — 2026-10-16

**Tool(s) used:** Codex, shell/Python, apply_patch, official Google documentation, Prettier, pinned Yarn type/build checks, mocked transport/SDK/lifecycle harnesses, local nonce fixture, curl, and Chrome computer-use attempts.

**What I asked for:** Add Google auth to the existing sign-in/signup page.

**Pre-planning:** I inspected nonce creation/verification, cookie settings, CORS, auth responses, the isolated Google component, current session behavior, and Google's current button API. The backend Web client ID existed; the public frontend setting did not.

**Planning:** I used Google's official popup button and the existing ID-token backend flow, reused the session completion path, and avoided dependencies or new routes. Both Google requests include the nonce cookie; email/password requests continue to omit cookies.

**Implementation process:** I added the SDK loader, nonce preparation, credential exchange, recovery/expiry and callback guards, shared form locks, responsive styles, and configuration/documentation. I added only the matching public client ID to ignored next/.env. Typecheck/build, 16 Google-specific mocked checks, 15 existing auth/session checks, and HTTP preview passed. Reliable Chrome page inspection and live Google/Nest completion remain unverified.

**What I kept as-is:** I preserved backend verification and account rules, REST/GraphQL contracts, password forms, dependencies, lockfile, and temporary in-memory sessions.

**What I changed or rejected, and why:** I send Google's credential only to the backend and start a session from the returned MedConnect token. I avoid One Tap, automatic account selection, silent callback retries, account linking, and token persistence beyond the current scope.

**Something the AI got wrong that I had to catch:** No AI error identified during this task. An edit patch needed updated context before applying; no partial edit was applied. Chrome's unavailable page-capture surface limited visual verification and was not treated as an application failure.

**One decision I can explain without AI:** I include credentials on both Google endpoints because the server compares Google's nonce claim with its HttpOnly browser-binding cookie before creating a MedConnect session.

## Frontend end-of-week sprint instructions — 2026-10-16

**Tool(s) used:** Codex, shell/Python, apply_patch, source/path and whitespace checks.

**What I asked for:** Save the reusable Next.js end-of-week sprint prompt in AGENTS.md, following the backend example.

**Pre-planning:** I reviewed the Next.js instructions and continuity logs and the backend sprint workflow. The frontend instructions still routed sprint records into backend/.

**Planning:** I kept frontend sprint records under next/, preserved backend history, and deferred the first sprint file until the requested end-of-week review.

**Implementation process:** I saved the prompt, corrected conflicting sprint routing, and updated session context. Instruction consistency, source paths, whitespace, and absence of frontend sprint files passed checks. Application tests were not run for this documentation-only change.

**What I kept as-is:** I preserved application code, backend instructions, existing sprint history, and README links until a frontend sprint file exists.

**What I changed or rejected, and why:** I replaced backend-only routing and required explicit dates and evidence-based reporting so frontend reviews can stand on their own without duplicating backend delivery claims.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** I keep frontend sprint records beside the frontend and reference backend records for shared dependencies.

## Next.js architecture and product review prompts — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, source/path and whitespace checks.

**What I asked for:** Add backend-style architecture and product prompts for Next.js, using separate -next.md files in the existing documentation folders.

**Pre-planning:** I inspected both instruction files and the existing architecture, personas, and gap-map records. The repository uses docs/, and the frontend instructions previously required shared product records only.

**Planning:** I adapted the backend review requirements to frontend boundaries and user flows, preserving shared grounding and IDs while defining separate Next.js output paths.

**Implementation process:** I added reusable architecture/product prompts, corrected conflicting routing, and updated session context. Backend-workflow comparison, folder references, prompt coverage, deferred-file behavior, and whitespace checks passed. No application tests were run for this instruction-only change.

**What I kept as-is:** I preserved application code, existing documentation, backend instructions, sprint alignment, and unrelated changes.

**What I changed or rejected, and why:** I defined -next.md outputs and separate frontend feature IDs while reusing persona/story IDs, so frontend evidence can be reviewed without overwriting backend records. I deferred actual review files until requested.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** I keep frontend documentation in the existing docs/ folders with clear suffixes so the two implementations remain easy to compare.

## Reusable clinic card — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, Yarn, local HTTP preview, and computer-use browser discovery.

**What I asked for:** Create the clinic card first so the clinics page can use it later.

**Pre-planning:** I reviewed the Next instructions, session context, lessons index, API fields, MUI setup, shared styles, installed Next guidance, and the reference project's ProductCard.

**Planning:** I kept the card independent of API calls and routing, used existing member fields, and deferred ratings to the backend.

**Implementation process:** I created the MUI card and shared SCSS, added memberImage to the public TypeScript type, and documented usage. Yarn typecheck and production build passed. A temporary three-card preview returned HTTP 200 with expected card/fallback/action markup; I removed it afterward. Browser inventory was empty, so visual and interaction checks remain unverified.

**What I kept as-is:** I preserved the landing directory, backend, routes, dependencies, and existing log edits.

**What I changed or rejected, and why:** I used a missing/broken-image placeholder, explicit address fallback, and empty stars labeled “Ratings coming soon” rather than inventing ratings. The optional doctor callback lets the future page control behavior.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** I pass clinic data into the card so multiple screens can reuse it without triggering duplicate API requests.

## Default clinic fallback image — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, Yarn TypeScript and Sass checks.

**What I asked for:** Use the existing defaultClinic.png in public/images/clinics for the clinic-card fallback.

**Pre-planning:** I checked the card, styles, session context, and exact asset path.

**Planning:** I used the public URL for both missing and failed clinic images and removed the replaced icon placeholder.

**Implementation process:** I updated CardMedia source selection and alt text, removed unused styles, and updated README guidance. Asset existence, Yarn typecheck, Sass compilation, and whitespace checks passed. Browser checks were not run; browser access was unavailable during the preceding task.

**What I kept as-is:** I preserved the supplied image, other card fields, API calls, and routes.

**What I changed or rejected, and why:** I replaced the icon with the supplied default image and disabled error handling once the fallback is displayed to avoid repeated fallback attempts.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** Files under public are referenced from the site root, so the image URL is /images/clinics/defaultClinic.png.

## Clinics page — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, Yarn, temporary Node/React rendering harness, production HTTP checks, and browser discovery.

**What I asked for:** Develop the clinics page using the clinic card.

**Pre-planning:** I reviewed the Next instructions/session context, existing directory, API hook/query behavior, shared styles, router documentation, and the reference project's clinics route.

**Planning:** I reused the existing public API flow and doctor dialog, shared the current navigation/footer, and kept backend ratings/pagination pending while making the 100-record cap visible.

**Implementation process:** I added /clinics, its feature component and responsive styles, extracted shared header/footer and doctor dialog, and connected navigation. Typecheck/build, eight mocked rendering scenarios, and production HTTP checks for the page, homepage links, and default image passed. Browser discovery returned no browsers, so visual/interaction and live backend integration checks remain unverified. I stopped the preview server and updated both READMEs.

**What I kept as-is:** I preserved backend queries, authentication/session behavior, the landing directory, existing card fallbacks, and dependencies.

**What I changed or rejected, and why:** I made name/address search apply to returned clinics and showed a notice at 100 results instead of claiming the API provides unlimited records. Shared components keep navigation and doctor previews consistent.

**Something the AI got wrong that I had to catch:** The AI's source review caught duplicate component props and an invalid anchor prop introduced by its extraction script; it corrected them before successful typecheck/build. An initial HTTP-check assertion also assumed a title tag without Next-generated attributes; parsing the tag fixed the harness. No owner correction was recorded.

**One decision I can explain without AI:** I keep public API fetching in the existing hook and helper while the page handles search and layout, so the card stays reusable.

## Reusable doctor card — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, Yarn, and a temporary in-memory React server-render smoke check.

**What I asked for:** Create the doctor card first and leave the doctors page for later.

**Pre-planning:** I reviewed Next instructions and continuity, current clinic-card/API fields and styles, available default images, installed Next public-file guidance, and the reference DoctorCard.

**Planning:** I followed the clinic-card presentation pattern, used existing doctor fields and defaultUser.svg, and left fetching/navigation with future callers.

**Implementation process:** I added DoctorCard, globally loaded scoped SCSS, and README usage. Typecheck and production build passed. Server rendering passed for populated/minimal doctor data, name precedence, specialization formatting, fallback image, and optional-action markup. Browser visuals, image-error transitions, and callback interactions remain unverified; preceding browser discovery was empty.

**What I kept as-is:** I preserved existing routes, the doctor dialog, backend/API contracts, dependencies, and image assets.

**What I changed or rejected, and why:** I used the doctor's full name or nickname instead of the clinic-oriented name helper, accepted clinic name as caller context, and kept ratings as a labeled placeholder. I included an optional profile callback without inventing a destination route.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** I keep API requests out of the card so the future doctors page and other screens can supply data without duplicate fetches.

## Doctors page and public directory query — 2026-10-17

**Tool(s) used:** Codex, shell/Python, apply_patch, Yarn, npm/Nest/Jest, temporary React/transport/schema harnesses, and local production HTTP checks.

**What I asked for:** Create the doctors page using the existing doctor card.

**Pre-planning:** I traced the shared layout, card, hook and fetch helper through GraphQL member resolver/service and checked both projects' instructions, continuity/lessons, manifests and reference doctor-list implementations. Only clinic-specific doctor discovery existed.

**Planning:** I added a dedicated public getDoctors query following current member discovery conventions and reused the existing frontend transport with an explicit doctors mode. I kept backend pagination, ratings and profile routes pending.

**Implementation process:** I added /doctors and its responsive styles, name/nickname/specialization search and request states, shared navigation links, getDoctors resolver/service/query, and two backend eligibility/projection/cap tests. Backend build and 13 focused mocked-persistence GraphQL tests passed after sandbox loopback escalation. Next typecheck/build, eight mocked rendering scenarios, five mocked transport scenarios, all seven operations against the source-generated schema, and production HTTP page/navigation/asset checks passed. Browser visual/interaction and live database checks remain unverified. Documentation and continuity were updated; preview stopped.

**What I kept as-is:** I preserved existing clinic queries and caller behavior, authentication, public-field allowlists, data ownership, the doctor dialog, and card image/rating fallbacks.

**What I changed or rejected, and why:** I used one global doctor query rather than requesting each clinic's doctors. I displayed the 100-result limitation, omitted unpopulated clinic names, and supplied no profile action without an implemented destination.

**Something the AI got wrong that I had to catch:** No AI error identified during this task. The sandbox listener restriction was resolved with an authorized escalated test run and was not treated as an application defect.

**One decision I can explain without AI:** I enforce approved, active doctor visibility in Nest so public clients receive the same filtered directory regardless of how they render it.

## Inline My Page profile editing — 2026-10-19

**Tool(s) used:** Codex, local source inspection, TypeScript, Next.js Webpack build, Node test runner, Nest GraphQL schema factory, and Chrome computer use.

**What I asked for:** Recheck the newly added backend profile support and implement the proposed My Page flow if compatible.

**Pre-planning:** I verified the backend branch's guarded myProfile, MemberSelf contact fields/canChangePassword, updateMember password/session rules, and authenticated multipart imageUploader. The Next branch's backend copy remains older. MediBridge PersonalInfo supplied the inline draft/edit interaction pattern.

**Planning:** I kept the existing Pages Router, MUI styles, memory-only sessions, and fetch transport. Private profile documents stay separate from public member discovery. Password verification remains in Nest; images upload only on Save.

**Implementation process:** I added /mypage, profile UI/form validation, private GraphQL documents and transport, desktop/mobile navigation, optional password controls, session-display updates, and a password-change sign-in notice. Save sends changed fields; Cancel resets drafts/passwords/images. Added ten focused tests and updated both READMEs. Typecheck and production builds passed, including a final build without fixture API settings. All three operations validated against the backend source-generated schema. Chrome with a disposable local fixture confirmed read-only/edit states, save with empty passwords, cancellation, bottom image controls, and reload sign-out. Fixture/preview servers were stopped and the temporary dependency symlink removed. Live Nest/database/storage, password-change browser submission, and mobile interaction remain unverified. No frontend sprint covers this date; no sprint was invented.

**What I kept as-is:** Backend/frontend source, API ownership, public profile projections, Google sign-in, and session persistence/refresh scope. No dependencies, commits, or deployment were added.

**What I changed or rejected, and why:** I used the backend's three password fields rather than MediBridge's separate login verification and password mutation shape. I added !/next/ to the Next worktree's root .gitignore because a shared local Git exclude hid all new Next source files; specific local-context/dependency ignores remain effective.

**Something the AI got wrong that I had to catch:** TypeScript caught a missing JSX brace in the initial Avatar slotProps; it was fixed before verification. An older reference formatter could not parse the pre-existing satisfies expression in AuthPage; that file was left with its existing formatting. Initial checks from the repository root and sandbox-local server binding failed; checks were rerun from the package and previews ran with approved escalation.

**One decision I can explain without AI:** I load private contact details through authenticated myProfile instead of adding them to public getMember, so the profile screen can edit account details without exposing them through discovery queries.
