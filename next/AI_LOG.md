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

## Root README logo — 2026-10-18

**Tool(s) used:** Codex, shell/Python checks, and apply_patch.

**What I asked for:** Add the project logo shown in the Next.js README to the root README.

**Pre-planning:** I checked the existing README logo markup, source asset, repository state, and Next.js documentation instructions.

**Planning:** I reused the centered 480px presentation with a path relative to the root README.

**Implementation process:** I added the image to `README.md` and updated the continuity records. Markup comparison, image-path existence, PNG signature, and whitespace checks passed. Application tests were not run for this documentation-only change.

**What I kept as-is:** I preserved the existing logo asset, Next.js README, and application code.

**What I changed or rejected, and why:** I changed the image path to `next/public/logo.png` so it resolves from the repository root.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** I reused the existing image instead of duplicating it so both READMEs share the same logo.

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

## Step 9 patient booking and waitlist journeys — 2026-10-31

**Tool(s) used:** Codex, shell/Python, TypeScript/Yarn, Prettier, Node tests, actual Nest API with disposable MongoDB replica set, GraphQL schema validation, and Chrome computer use.

**What I asked for:** Start Step 9 in the Next.js frontend after completing backend portions. Leave commits and pushes to me and provide the commit message at the end of the step.

**Pre-planning:** I inspected the Next worktree instructions, session records, installed Pages Router/MUI stack and guides, MediBridge booking reference, and the backend booking/session/ownership contracts. Backend and Vite folders remained protected from writes.

**Planning:** I reused the existing layout and palette, kept business rules in Nest, added private client-side care screens, and introduced a same-origin session bridge to keep refresh tokens out of JavaScript. Replacements use one server mutation; ambiguous responses require reads rather than automatic replay.

**Implementation process:** I added booking/appointment/waitlist routes, review and consent dialogs, private pagination/details, cancellation/withdrawal, four replacement directions, stale preflight, conflict Keep/Replace choices, and lost-response reconciliation. Persistent sessions integrate auth/Google transport with HttpOnly refresh cookies and memory access tokens. Public discovery now uses actual getDoctors/getMember contracts; links/copy and README/architecture were updated. All 26 focused Node tests, typecheck, production build and 18 real-schema operation validations passed. Chrome with real Nest/disposable MongoDB covered all four replacements, both conflict choices, competing-target original preservation, booking, cutoff, details/withdrawal, reload refresh/signout and mobile/keyboard booking. A fault proxy dropped committed booking/cancel responses; owned reads recovered both without replay. Final production build excludes fixture URLs; temporary processes/dependency symlink were removed. No frontend sprint covers this date.

**What I kept as-is:** I preserved backend/frontend source, server-derived identity, transaction/conflict rules, feature flags and closed promotion gate, profile editing, and existing router/theme. No dependency versions, application database, deployment, staging, commit or push changed.

**What I changed or rejected, and why:** I derived clinics from the public approved-doctor list because the current backend does not expose the older directory operations. I display that 100-doctor limitation. I kept unresolved network outcomes blocked locally and offered owned reads/My Care. Sign-out clears browser state/cookies; I do not claim server-session revocation. Real Google, production TLS/proxy/multi-instance, natural token expiry and live profile storage/password checks remain unverified.

**Something the AI got wrong that I had to catch:** TypeScript caught initial MUI href and Web Locks typing mistakes. The live API caught inherited getClinics/getClinicDoctors assumptions; browser testing caught a loading flag left active after replacement. The AI corrected them before final verification; I did not report that I personally caught those errors.

**One decision I can explain without AI:** I submit replacement as one backend operation so a failed destination keeps the original commitment; the UI never cancels first and then tries to join a waitlist.

## Visual booking date calendar — 2026-10-31

**Tool(s) used:** Codex, shell/Python, MediBridge source inspection, Prettier, Yarn/TypeScript/Next build, Node tests, and Chrome computer use with a synthetic local API fixture.

**What I asked for:** Adapt MediBridge Next's visual calendar to this booking screen.

**Pre-planning:** I inspected CalendarContent.tsx and its SCSS, the existing native date field and slot effects, Next instructions/continuity, and installed Pages Router documentation. Existing Step 9 changes were still uncommitted and were preserved.

**Planning:** I reused the month navigation and seven-column calendar pattern, with our colors, accessible buttons/keyboard navigation, clinic-local date boundaries, and existing available/occupied slot handling. I kept server scheduling rules and did not assume weekends are closed.

**Implementation process:** I added BookingCalendar, date-only arithmetic helpers, responsive styles, and three focused leap-year/month/year/day-boundary tests. The selected date feeds the existing slot fetch and clears the previous time. Typecheck, all 29 Node tests, production build without fixture API URLs, and whitespace checks passed. Chrome with synthetic data verified disabled past dates, keyboard month-boundary selection, retained date during month navigation, weekend selection, time reset, correct waitlist review date, and 390px layout. I updated both READMEs, the architecture note and session log, stopped the preview, and removed temporary fixtures/dependency symlink. I did not repeat live Nest/database acceptance or claim new deployed verification.

**What I kept as-is:** I preserved booking/waitlist transports, consent, atomic replacement, session handling, backend/frontend files and existing uncommitted work. No dependencies, staging, commits or pushes were added.

**What I changed or rejected, and why:** I adapted the reference presentation rather than its browser-local date arithmetic, clickable divs, weekend closure assumption or different slot API.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** I keep calendar days as clinic-local YYYY-MM-DD values and let the backend return actual appointment instants, so browser timezone and daylight-saving changes cannot shift the chosen day.

## Step 10 clinic/doctor workspace and live calendar — 2026-10-31

**Tool(s) used:** Codex, local/reference source inspection, shell/Python, Yarn/TypeScript/Prettier/Next build, Node tests, real Nest services with disposable MongoDB replica set, GraphQL schema validation, and Chrome computer use.

**What I asked for:** Implement Step10 in Next.js after Step9. Leave commits/pushes to me and supply a branch-scoped commit message.

**Pre-planning:** I checked clean next HEAD 284a116, current instructions/continuity/lessons, MediBridge role-aware workspace organization, installed Pages Router guides, actual guarded calendar/schedule/member/staff-booking/outcome contracts, and snapshot/release constraints. Backend/Vite folders remained protected.

**Planning:** I used the implemented authorized revision-polling API instead of assuming SSE/WebSocket hosting. I buffered complete consistent snapshots and kept date math in the clinic timezone. I kept saved-hours forms explicit replacement drafts because no saved-schedule read API exists, with acknowledgement/review and no mutation replay.

**Implementation process:** I added /workspace with clinic day/seven-day calendars, doctor filtering/fresh details, self-scoped doctor views, pending affiliation review, weekly/date schedule replacement and effective-slot preview, existing-patient phone/walk-in booking, cancellation and final-outcome controls. The polling hook pauses/resyncs, marks stale state and backs off; paginated reads restart on revision conflicts and publish deduplicated complete snapshots. Reviews check source state and reconcile ambiguous appointment/affiliation responses through owned reads. Navigation/auth return and profile clinicId selection were integrated. All41 Node tests, typecheck, final production build without fixture URLs,26 real-schema operations and documentation/private-shell/whitespace checks passed. Real Nest/disposable MongoDB Chrome checks verified staff/doctor flows, patient denial, mobile/keyboard details, lost phone response recovery and automatic recovery after a proxy outage with online/promoted records once each. The real frontend loader also restarted after a committed later-page change and returned150 unique records. Foreign-clinic reads exposed none and a foreign-doctor query was forbidden. Promotion ran only through a fixture-local worker enable hook, with the real gate unchanged. Preview/fixture processes and dependency symlink were removed. No frontend sprint covers this date.

**What I kept as-is:** I preserved backend/Vite source, API ownership, current feature/release gates, session security, patient booking/replacement/waitlist flows and the visual calendar. No dependencies, application database/configuration, provider/account traffic, deployment, staging, commit or push changed.

**What I changed or rejected, and why:** I avoided partial calendar-page rendering and blind mutation retries. I used complete schedule drafts and recorded the saved-hours read limitation rather than claiming blank fields were current configuration. Doctor/clinic registration UI and Step11 notifications/Step12 rollout remain separate. Production load/proxy/concurrency and full OS-offline behavior were not tested; outage checks used a controlled local proxy.

**Something the AI got wrong that I had to catch:** The actual API rejected the AI's disposable historical outcome fixture because it omitted the active-commitment ledger. The AI corrected that fixture and reran completion successfully; this was not a frontend defect or a mistake I personally reported. No backend source was changed to accommodate the fixture.

**One decision I can explain without AI:** I bind all calendar pages to one server revision and discard the partial result if it changes, so reconnecting or concurrent bookings cannot combine different snapshots into a misleading calendar.

## Step 11 patient notification center and current-target delivery — 2026-11-01

**Tool(s) used:** Codex, local/reference source inspection, shell/Python, Yarn/TypeScript/Prettier/Next build, Node tests, actual Nest/MongoDB disposable fixture, GraphQL schema validation, and Chrome computer use.

**What I asked for:** Implement Step11 in Next.js, with commits/pushes left to me and a branch-scoped commit message at the end.

**Pre-planning:** I checked clean next HEAD833a19e, local instructions/continuity/lessons, installed client-fetch guidance, MediBridge source (no equivalent notification center found), and actual owned list/detail/context/read contracts and real notification/promotion/lifecycle workers. IN_APP is the configured channel; backend/Vite files remained protected.

**Planning:** I separated historical notices from current server context, made read state explicit, and reused the private no-store/session transport. I planned exact-target links that reread slots/commitments, no booking or mark-read on open, no automatic mutation retries, and delivery/replay/stale-alert acceptance using disposable real services.

**Implementation process:** I added /notifications, neutral titles, unread filters/count, bounded paginated history, visible/online polling, current appointment/waitlist/slot details and ambiguous read reconciliation. Patient navigation/auth return, owned detail query links and exact specialty/time booking prefill were integrated. All50 Node tests, typecheck, final production build without fixture URLs,30 real-schema operations, links/private-shell/whitespace checks passed. Chrome with real Nest/disposable MongoDB verified real promotion→failed delivery→retry→patient inbox, replay preserving one booking/notice/read marker, occupied late alerts without occupant identity, canceled booking context, explicit/lost read responses, unread filtering, exact manual booking and fulfilled/current-target links, 390px/keyboard, controlled read-outage suppression/recovery, foreign denial and sign-out clearing. Historical queues had paired ledgers. Fixtures/preview and temporary dependency symlink were removed; no frontend sprint covers this date.

**What I kept as-is:** I preserved backend/Vite source, server-derived identity and ownership, existing booking/replacement/session/workspace behavior, configured IN_APP channel, production flags and the hard promotion gate. No dependencies, application data/configuration, provider traffic, deployment, staging, commit or push changed.

**What I changed or rejected, and why:** I used fresh notificationContext instead of treating alert text as current booking/free-slot proof. Mark-read stays explicit, and filters do not change delivery. The current hard gate still requires a separate Step12 source/configuration/rollout decision; local browser verification did not silently activate it. Production/proxy/load, full OS-offline and real Google/profile storage/password checks remain unverified.

**Something the AI got wrong that I had to catch:** The AI initially started a production build while the dev preview was still running. The AI noticed that shared-artifact workflow issue, stopped the preview and reran the final build independently; no application failure was observed, and I did not personally report this mistake. No new product defect was identified.

**One decision I can explain without AI:** I check the notice's current target before displaying confirmation or opening booking, because an old alert can arrive after cancellation or after someone else takes the slot.

## Step12 local integration acceptance documentation — 2026-11-01

**Tool(s) used:** Codex, shell, Yarn/TypeScript/Node tests, Chrome computer use, real Nest/MongoDB local runtime.

**What I asked for:** Finish booking Step12 after confirming Google OAuth signup succeeds.

**Pre-planning:** I reviewed the actual booking checklist, delivered UI and verification limits; backend recovery and activation work belongs to its own worktree.

**Planning:** Recheck frontend build/tests, run a normal-worker patient-to-clinic browser pilot and record local acceptance separately from staging/production release.

**Implementation process:** Updated root/Next READMEs and architecture-next; no frontend feature code changed. Typecheck,50 tests and production build passed with preview stopped during build. Chrome verified patient enrollment, clinic UI cancellation, automatic Waitlist appointment appearing through calendar polling, patient notice/current confirmed appointment and explicit read. Backend corrections/checks are recorded in the backend branch.

**What I kept as-is:** Existing Next feature screens, OAuth/session flow, manual commits/pushes and production settings.

**What I changed or rejected, and why:** I replaced pending local-acceptance wording with verified results while retaining staging/production/load/external-provider limitations. The owner confirmed OAuth signup; the agent did not complete a personal Google login.

**Something the AI got wrong that I had to catch:** Browser verification found the backend still reported automatic booking paused despite the enabled worker. Codex corrected that backend response and added an integration regression; no frontend workaround was added.

**One decision I can explain without AI:** The clinic calendar and patient notice must agree on the real committed appointment, so the pilot checks both roles using the normal backend workers.

## OAuth-fix Step5: username presentation and validation — 2026-11-01

**Tool(s) used:** Codex, source/Git and installed Next/MUI documentation inspection, apply_patch, Yarn/TypeScript/Node tests, an isolated Next production build and native Chrome computer use.

**What I asked for:** Implement frontend Step5 in the next worktree; I handle staging, commits and pushes manually.

**Pre-planning:** Backend Steps1–4 were integrated at clean HEADb1904c6. Signup/profile still said Nickname and accepted2–40 characters; username fallbacks had no display prefix. The existing frontend/backend demo was running and needed to remain online.

**Planning:** Share client username rules and one fixed-prefix field between signup/My Page. Preserve raw memberNick payloads, capitalization and distinct full names. Keep availability checks and conflict forwarding in Step6. Build a separate snapshot to avoid writing into the active dev .next output.

**Implementation process:** Added username helper/field, updated form labels/validation and display/search fallbacks, and added four meaningful rule/profile tests. Typecheck,54 Node tests and the isolated snapshot production build passed. Native Chrome checked signup short/typed-@ errors, deletion leaving @, allowed symbols, Unicode full name, case-only profile editing and390px layout with a synthetic API. Captured signup/profile payloads excluded @. The browser access host was unavailable, so native Chrome controls were used. Restored device settings, signed out/closed the test tab and stopped temporary servers; original frontend/API remained HTTP200. Updated architecture-next and local plan/session records; READMEs needed no change. No backend/Vite edits, application data, provider traffic, migration, staging, commit or push; no sprint covers November1.

**What I kept as-is:** Internal memberNick field, unprefixed drafts/session/API values, case-preserving requests, separate Unicode full names, email-based login, existing server authority and manual Git workflow.

**What I changed or rejected, and why:** I used a non-editable input adornment rather than adding @ to stored text. Fallback usernames display as handles, while real full/clinic names retain their original form. The UI does not claim a username is available before Step6.

**Something the AI got wrong that I had to catch:** No AI error identified during this task. Native typing dropped non-ASCII/numeric characters during verification; using clipboard paste and checking the resulting field value resolved the tooling behavior.

**One decision I can explain without AI:** The @ belongs to presentation, so users cannot delete it from the field and the backend still receives exactly the username text.

## Disable weekend booking dates — 2026-11-01

**Tool(s) used:** Codex, TypeScript, Node tests, isolated Next production build, native Chrome.

**What I asked for:** Treat weekends as non-working days in the Next worktree, separately from backend changes.

**Pre-planning:** Patient/staff forms share BookingCalendar; clinic schedule drafts also allowed weekend hours. Dates are already clinic-local strings.

**Planning:** Disable weekends, skip them during keyboard navigation, default new searches to a weekday, and block weekend hours drafts while preserving history access.

**Implementation process:** Updated shared date helpers/calendar, patient/staff loading guards and weekday defaults, weekly schedule options and custom-override validation. Exact weekend links retain their target date and show the closure instead of silently choosing another slot. Corrected the existing README statements. Typecheck and56 tests passed; an isolated source snapshot production build passed. Native Chrome verified disabled Saturday/Sunday and Friday→Monday / Monday→Friday keyboard selection using the real calendar component on a temporary harness page. Screenshot: /private/tmp/medconnect-weekend-calendar.png. Closed the test tab and stopped the owned preview.

**What I kept as-is:** Backend/Vite files, existing appointment history, credentials/configuration, API contracts and manual Git workflow. No application database writes or server restart.

**What I changed or rejected, and why:** Weekend custom hours cannot be submitted; closure/clearing remain valid. Backend enforcement remains authoritative. Browser verification covered the isolated calendar component, not a newly restarted combined application stack.

**Something the AI got wrong that I had to catch:** No AI error identified during this task.

**One decision I can explain without AI:** Keep calendar calculations date-only so the browser timezone cannot change which clinic dates count as weekends.

## Inline username availability checks — 2026-11-02

**Tool(s) used:** Codex, TypeScript, Node tests, isolated Next production builds, native Chrome and a synthetic HTTP API.

**What I asked for:** Implement OAuth-fix Step6 in the Next worktree; I handle commits/pushes manually.

**Pre-planning:** Existing username fields had fixed @ prefixes and validation; availability APIs and save-conflict markers were already implemented in the backend.

**Planning:** Share a per-form check controller and field UI, invalidate checks on every username edit, discard late results and preserve only allowlisted conflict metadata through existing transports.

**Implementation process:** Added public/owner availability reads, Check/Checking/Available/taken/error states, submission checks for new/changed usernames and inline conflict recovery. Unchanged profile usernames allow unrelated saves. Updated architecture and the ignored plan/session records; READMEs and backend/Vite source remain unchanged. Typecheck and65 tests passed, including stale-response and error sanitization checks. Final isolated production build passed. Native Chrome with a synthetic API verified signup states/conflict preservation/recovery, profile unrelated saves, authenticated checks, keyboard activation, conflict focus, green tick and a successful username save. Captured requests contain unprefixed values and no unnecessary profile fields. Complete updated-backend/Google/mobile acceptance remains Step7.

**What I kept as-is:** Server uniqueness enforcement, email sign-in, profile draft values, real accounts/database/configuration and separate worktree boundaries. No staging, commit, push or deployment.

**What I changed or rejected, and why:** Checks are advisory; a save-time conflict invalidates Available and preserves the rest of the form. Never expose arbitrary backend messages through the auth bridge.

**Something the AI got wrong that I had to catch:** Browser verification caught focus attempted while inputs were disabled and a profile paragraph style overriding green Available. Both were corrected and rechecked before delivery; the typecheck also caught an unavailable icon import, replaced with installed CheckRounded. I did not identify these as owner-reported errors.

**One decision I can explain without AI:** A previous Available result must be discarded after any edit because it describes an earlier input and never reserves a username.

## Matching Next Sprint03–05 reviews — 2026-11-02

**Tool(s) used:** Codex, Git history/diffs, current source and session/log inspection, Python document/link checks.

**What I asked for:** Prepare Next sprint files; I then requested matching backend Sprint03–05 records as well, keeping each stack in its own worktree.

**Pre-planning:** Backend Sprint02 ended October15 and no later calendar existed. I checked actual Next commits and verification records; no dated Next delivery was identified for October23–29.

**Planning:** Match October16–22, October23–29 and October30–November5 across the two stacks. Treat03/04 as retrospective records and05 as in progress throughNovember2, with provisional continuation estimates and stable backlog IDs.

**Implementation process:** Created SPRINT_03.md through SPRINT_05.md with source/commit evidence, checks/limits, prioritized continuation, top-item acceptance/dependencies and proposed tasks/check-ins. Sprint04 explicitly records its evidence gap. Added concise README record links and updated ignored current-sprint/session instructions. Verified six matching files, status/backlog structure,65 links/source paths, whitespace and preserved backend01/02. No application tests were run for this documentation-only task.

**What I kept as-is:** Application code/dependencies, backend/Vite files in this worktree, closed records, runtime/configuration/data and manual Git workflow. Backend documents were written only in the backend worktree.

**What I changed or rejected, and why:** I separated fixture checks from successful local integration, current automated-Google acceptance from fresh live-provider verification, and implementation from deployment. Missing historical delivery, actual hours and original sprint agreements are not invented.

**Something the AI got wrong that I had to catch:** No substantive AI error identified during this task. Initial read-only path lookups were corrected before writing the records.

**One decision I can explain without AI:** Record an evidence gap for a quiet week rather than backdate the later booking screens into it.

## URL-driven doctor search and autocomplete — 2026-11-05

**Tool(s) used:** Codex, Git/source inspection, installed Next documentation, MediBridge reference inspection, apply_patch, Prettier, Yarn/TypeScript/Node tests/Next build, temporary Node fixtures, normal compiled Nest, disposable MongoDB and native Chrome/Safari control.

**What I asked for:** Implement directory search Step4 in the Next worktree; commits remain manual.

**Pre-planning:** Verified clean next8527abb and delivered backend search/suggestion contracts. Doctor screen locally filtered capped public results; other discovery flows still rely on that transport. Read worktree rules/current logs/lessons, installed Pages Router guides and MediBridge DoctorsList before implementation. Backend/Vite folders are protected from writes.

**Planning:** Add public GraphQL documents/adapters, shared URL parsing/navigation and result/suggestion hooks, then replace only the doctor screen's discovery path. Use URL state for committed filters/page and local draft typing; keep independent request/error states and preserve existing card booking links.

**Implementation process:** Added city/specialty/sort controls,12-result pagination/totals,loading/error/retry/empty/clear states and MUI9 free-text autocomplete. Drafts debounce300ms with replace history; deliberate actions push; filter/name/sort changes reset page. Router transitions cancel pending typing, preserve new own-route drafts and restore URL state. Shared abort guards ignore late success/failure and displayed data is request-keyed. Typecheck,81 tests (16 new) and final isolated production build with fixture URLs empty passed. Real frontend adapters→normal Nest→owned disposable MongoDB verified125 matching records,12/page,both sorts/page2,combined filters,clinic city,Unicode literals,username exclusion,empty pages/totals,eight names and independent503 recovery. Native Chrome confirmed combined deep-link controls/count/cards and pagination URL/request. Remaining keyboard/Escape/Back/Forward/error UI/mobile browser acceptance is unverified after Chrome active-user-change rejections and Safari timeout (NEXT-007). Updated architecture,both READMEs,NEXT-B11 and session records. Verified owned runner18695 stopped and its Mongo files removed; production/app data untouched.

**What I kept as-is:** Existing DoctorCard booking links,homepage/clinic/booking discovery,authentication,backend/Vite source,dependencies/source configuration,application databases and manual staging/commit/push workflow. Step5 clinic migration and Step6 combined acceptance remain separate.

**What I changed or rejected, and why:** Replaced local full-name/username/specialty matching with the server's full-name contract. Shared URL/history behavior has a current doctor-screen caller; city/specialty enums match backend source. Used established fetch/MUI/SCSS and Pages Router rather than adding another router,request library or cache.

**Something the AI got wrong that I had to catch:** The first whole-file replacement attempted same-path delete/add in one apply_patch call; the tool rejected it. Codex split the operations before typecheck/tests (NEXT-006). No human correction is claimed. Browser-control failures are recorded as tooling limitations, not application defects or passed acceptance.

**One decision I can explain without AI:** Cancel pending typing when navigation begins and key results to the committed request, so an old timer or response cannot overwrite a newer city, page or Back/Forward destination.

**November5 follow-up:** At my request, centered the doctor pagination with flex
layout in `_doctors.scss`. Sass compilation and whitespace checks passed. No new
browser verification; existing Step4 acceptance limits remain. No staging/commit/push.

## URL-driven clinic search and shared directory — 2026-11-05

**Tool(s) used:** Codex,source/Git inspection,apply_patch,Prettier,Yarn/TypeScript/Node/Next build,normal compiled Nest,owned disposable MongoDB,temporary Node fixtures and native Chrome control.

**What I asked for:** Implement the next agreed directory step (Step5),preserving manual Git workflow and centered pagination.

**Pre-planning:** Verified clean nextf6dc891 after Step4 commit. Read current records/lessons and inspected the clinic page,cards/dialog,shared doctor URL/API hooks and backend contracts. Clinic discovery and previews still depended on the global first100 doctors; new clinic search can discover clinics outside that set.

**Planning:** Extract the actual doctor filter/results view and styles into a shared DirectoryPage for both callers. Add clinic documents/adapters and kind-keyed reads. Preserve clinic selected-dialog ownership and use the existing public clinic-specific doctor endpoint where a global capped list would break previews.

**Implementation process:** Added searchClinics/suggestClinicNames transport,shared result/suggestion hooks,DirectoryPage and `_directory.scss`. Existing wrappers supply doctor/clinic cards; clinic dialog closes on route-start and leaves URLs unchanged on ordinary close. fetchMembers(clinicId) now reads public getClinicDoctors,with a visible per-clinic100 bound. Removed stale global-cap clinic messaging. TypeScript,89 tests (eight new) and final isolated production build with fixture URLs empty passed. Real frontend adapters→normal compiled Nest→owned disposable MongoDB verified125 matching clinics,two doctors each without duplicate totals,both sorts/page2,filters,literal Unicode,username exclusion,empty pages,no-doctor clinics,eight suggestions and independent503 recovery. Care112 preview returns its own team despite absence from legacy homepage discovery; doctor/homepage adapter regressions pass. Chrome displayed combined deep-link state/count/cards. Further native input failed or produced no observable change,so dialog/booking-return,keyboard/history,error UI/mobile acceptance remains unverified. Updated docs/READMEs/NEXT-B11/session. Owned runner48069 stopped and Mongo files removed; no production data/config/deployment changes.

**What I kept as-is:** Existing cards/booking links,homepage clinic discovery,booking's linked-target fallback,authentication,backend/Vite files,dependencies/source configuration and manual staging/commit/push workflow. Step6 combined acceptance remains pending.

**What I changed or rejected, and why:** Shared the current directory UI rather than duplicating it. Replaced only explicit clinic-doctor reads with the existing public endpoint so newly discovered clinics have working previews; no private affiliation API or new backend contract was needed.

**Something the AI got wrong that I had to catch:** Source review caught the inherited doctor-only loading text in the shared view; parameterized it before final checks and added doctor/clinic shell tests. The first regression run also exposed the obsolete getDoctors expectation for an intentionally changed clinic-specific read; updated that fixture to assert getClinicDoctors and its public request settings. No human correction is claimed.

**One decision I can explain without AI:** Clinic discovery can exceed the global doctor cap only if View doctors also queries the selected clinic directly; otherwise a valid newly found clinic could falsely show no doctors.

## Directory filter polish and combined acceptance checkpoint — 2026-11-05

**Tool(s) used:** Codex,Git/source inspection,installed Next documentation,apply_patch,Prettier,Python,Yarn/TypeScript/Node/Next build,normal compiled Nest,owned disposable MongoDB,temporary Node fixtures and native Chrome control.

**What I asked for:** Finish directory Step6 before square photos/cropping,and mark the search roadmap complete only after acceptance. I confirmed Chrome was idle for the browser checks.

**Pre-planning:** Verified clean next1cb6378 after Step5,read worktree rules/current records/lessons and the original search plan. Inspected shared DirectoryPage,navigation,hooks and styles. Protected backend/Vite folders remain read-only.

**Planning:** Add removable chips and clearer labels to the shared view,improve focus/loading/responsive behavior,then verify both directories against actual Nest/disposable data and Chrome. Defer square cards and a MediBridge-style cropper to a separate plan.

**Implementation process:** Added name/city/specialty/reverse-sort chips,clinical specialty names,explicit All cities/All specialties text and explanatory labels. Chip/clear actions return focus to name; pagination focuses/scrolls to the live summary. Chips wrap and skeletons respect reduced motion. Explicit name-removal patches override pending draft text and reset page. Typecheck,92 tests and final isolated production build with fixture URLs empty pass. Actual frontend adapters against normal Nest/owned disposable MongoDB pass for both directories:125 matches,12/page,both sorts/page2,filters,Unicode literals,username exclusion,empty/out-of-range totals,eight suggestions,independent503 recovery,distinct clinic totals and selected-clinic team/homepage regressions. Delayed real HTTP reads confirm obsolete search/suggestions abort and only latest results publish. Chrome desktop passes doctor keyboard suggestion selection,refresh/history,chip removal/page reset/pagination focus,and clinic dialog/focus,booking IDs/Back restoration,suggestion-only failure,main-error/retry and clear/focus. Clinic390px top/control layout inspected. Remaining mobile and Escape checks are unverified: later Chrome controls repeatedly rejected active-app changes despite the earlier idle confirmation; browser host unavailable. A new async idle question remains unanswered. Updated Next architecture,README,SPRINT_05,NEXT-B11/NEXT-B13 and local lessons/session records. Owned runner61450 stopped and Mongo files removed; evidence /private/tmp/medconnect-directory6-sVJXaM and release snapshot /private/tmp/medconnect-directory6-release-Msp39T.

**What I kept as-is:** Card image ratios/uploads,existing booking links and authentication,backend/Vite source,dependencies/configuration,application databases,production flags and manual staging/commit/push workflow. Full search-plan/roadmap completion is pending the outstanding browser checks; it has not been falsely marked complete.

**What I changed or rejected, and why:** Kept filter labels readable while preserving enum values in API/URLs. Recorded square doctor/clinic photos and upload cropping as future NEXT-B13 rather than expanding Step6. Preserved passed checks separately from unavailable browser checks.

**Something the AI got wrong that I had to catch:** No AI error identified during this task. Source review identified that explicit name removal needed precedence over the pending draft; regression tests and Chrome chip deletion confirm the implemented behavior. Browser-control interruptions are tooling limitations,not application defects.

**One decision I can explain without AI:** A successful build and API tests cannot prove mobile layout or keyboard popup behavior,so the shared roadmap must remain unfinished until the remaining browser checks pass.

**November5 resumed browser follow-up:** After a new idle confirmation, inspected390px clinic cards and wrapped pagination. Browser inspection caught the second pagination row aligning left; added justify-content:center to the shared MuiPagination-ul so both directories center wrapped rows. Updated isolated production build passes (/private/tmp/medconnect-directory6-release-fxYtE8). Clinic Escape closes the open suggestions without changing filters. Doctor mobile layout and visual recheck of the updated pagination remain unverified: the browser surface became blank and native scrolling reported noWindowsAvailable; resetting the CUA connection did not restore it. Asked to bring the preview to the front and leave the Mac unlocked; no reply at checkpoint. This is a browser-surface limitation,not an established application blank-screen defect. Temporary updated fixture remains online for that handoff: runner77767,/private/tmp/directory6-stack.cjs,ports3001/4333/4334,evidence /private/tmp/medconnect-directory6-ZJbP6L. Earlier resumed runner was stopped and its disposable Mongo files removed before rebuilding. No protected files,Git actions or production settings changed. Full search-plan closure remains pending.

**November5 final acceptance:** After I brought the preview forward and left the Mac unlocked,Chrome390px doctor controls/cards and centered wrapped pagination on both pages passed visual checks. Combined local Step6 acceptance is complete; prior pending notes above are historical. Updated architecture,both READMEs,NEXT-B11 and required logs. At my explicit request to mark the future roadmap finished,updated only shared backend plan/roadmap status and required delivery records; no backend application code changed. Corrected NEXT-009 was caught by Codex's mobile screenshot inspection,not a human correction. Final isolated production build passes; existing92 tests/typecheck and actual API checks remain valid. Device mode disabled,DevTools/dedicated preview tab closed,verified runner77767 stopped and disposable Mongo files removed. No deployment or Git actions. Square photos/cropping remain deferred to a separate plan.

## Square photos and upload cropper — 2026-11-05

**Tool(s) used:** Codex,Git/source inspection,installed Next docs,official react-easy-crop docs,MediBridge reference,apply_patch,Python,Prettier,Yarn/TypeScript/Node/Next build,normal Nest,disposable MongoDB,Sharp read-only image checks and native Chrome.

**What I asked for:** Implement the selected cropper job; I separately authorized the minimal backend upload crash fix after real acceptance exposed it.

**Pre-planning:** Verified next/backend clean atb39bd3f and read instructions/records/lessons. Inspected MyPage,upload transport,Nest upload/storage,card styles and MediBridge ImageCropper. Existing cards were16:9/4:3 and photo selection directly became the upload draft.

**Planning:** Add a shared fixed-square crop/zoom dialog before draft confirmation,retain Save changes for uploads,export bounded JPEGs and square both cards. Preserve old images/cancel/retry behavior and test actual uploads with disposable accounts. Wrote IMAGE_CROPPER_PLAN before feature coding.

**Implementation process:** Added react-easy-crop6.2.4,ImageCropper,image-crop helpers and MyPage integration. JPEG/PNG/WebP inputs remain bounded to10MB; export JPEG quality0.9,white transparency,max1024px square,no upscaling. Cropper/preview URLs revoke independently. Confirm updates local draft; cancel preserves it and other fields. Both card image styles are1:1 centered cover. Browser acceptance exposed root-relative image URLs going to Next; shared memberImageUrl now resolves API uploads for both cards and profile. Next typecheck,97 tests and final isolated no-fixture-URL build pass. Desktop Chrome verified crop/keyboard zoom/position,cancel/focus/address preservation and upload503 draft preservation. Actual clinic/doctor saves produced owned JPEG1024×1024 files,confirmed read-only;375px crop dialog inspected and public clinic card displayed the saved API image after the origin fix. A normal-main multipart crash required separately authorized UploadResolver metadata normalization; backend build/full TypeScript,12 upload tests with production validation and all222 API tests pass; lint only existing config.ts warning. Updated plan,README,architecture,NEXT-B13 and shared FI-07 records. Final fixture26070 stopped/Mongo removed; dedicated test tabs and DevTools closed. Final release /private/tmp/medconnect-cropper-release-qOsUoH; successful upload evidence /private/tmp/medconnect-cropper-y3g656/stored-image-checks.json; final card fixture /private/tmp/medconnect-cropper-TOKpp5.

**What I kept as-is:** Existing authenticated upload/profile ownership and size/signature rules,Save changes workflow,stored legacy images,unrelated discovery/booking/auth flows and manual staging/commit/push. No application DB,production storage/configuration or deployment changes.

**What I changed or rejected, and why:** Standardized new photos through a local square crop rather than silently cropping stored files. Resolved API image paths at the shared display boundary. Fixed the observed backend scalar defect with explicit authorization instead of bypassing validation or authentication.

**Something the AI got wrong that I had to catch:** Codex's temporary fixture initially omitted the doctor's required license,then embedded excess profile fields in a typed session literal; API validation and temporary-build typecheck caught these fixture errors. Corrected both before successful runtime checks. Browser acceptance caught pre-existing upload/URL defects; no human discovery is claimed. Native control interruptions were tooling limits,not passed checks.

**One decision I can explain without AI:** Crop confirmation should only change a draft. Uploading when Save changes is pressed lets cancellation preserve the saved photo and keeps image writes in the existing authenticated profile flow.

## Sprint 05 final review and closure — 2026-11-05

**Tool(s) used:** Codex,Git history/ancestry/source inspection,Python document edits and path/whitespace checks.

**What I asked for:** Finish the backend and Next sprint files.

**Pre-planning:** Read both Sprint05 records,instructions,session/AI logs,READMEs and current delivery source. Both worktrees were clean; interim open-sprint wording and uncompleted review checkboxes remained after the feature commits.

**Planning:** Close the matching recorded period,retain dated history and distinguish local delivery from outstanding integration/storage/staging work. Preserve IDs and do not invent Sprint06 dates,hours or peer review.

**Implementation process:** Closed next/SPRINT_05 for October30–November5 with final NEXT-B11/NEXT-B13 commit/source evidence,dated test/browser limits,backlog disposition and closure checklist. Updated NextREADME sprint status and ignored AGENTS/session context. Next8005084 does not contain backend16f1db6; combined-candidate review remains NEXT-B10. B06 intended-storage/password checks and other unfinished work remain carried forward. Preserved Sprint03–04 and prior delivery checkpoints. Verified matching dates/closed statuses,36 valid sprint links,commit references and unchanged earlier sprint files; git diff --check passes. Existing97 Next tests/build and222 backend API/build evidence was inspected and recorded,not rerun for this documentation task.

**What I kept as-is:** Application source/tests,existing sprint dates/stable IDs,historical delivery evidence,application data/configuration and manual Git workflow.

**What I changed or rejected, and why:** Replaced stale progress/capacity/check-in wording with final outcomes and explicit carry-forward. Distinguished documentary self-review from unrecorded independent peer/release review; overlapping planning estimates are not summed as confirmed capacity.

**Something the AI got wrong that I had to catch:** No AI error identified during this documentation task.

**One decision I can explain without AI:** A verified disposable cropper upload does not prove intended-storage or combined-release readiness,so those checks remain in the backlog after sprint closure.
