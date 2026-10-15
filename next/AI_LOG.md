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
