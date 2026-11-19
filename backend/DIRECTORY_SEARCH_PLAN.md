# Doctor and clinic directory search plan

Date: November 4, 2026 (Asia/Seoul)

Status: **Completed locally November 5, 2026.** Steps1–3 are delivered on the
backend branch (`39549ea`, `8071ba5`, `7f712a0`); Steps4–5 are delivered on the
next branch (`f6dc891`, `1cb6378`). Step6 implementation and combined local
acceptance are complete; its changes await the owner's manual commit. No deployment
or production activation is claimed. Final frontend acceptance is recorded in
`docs/architecture/architecture-next.md` and `next/SPRINT_05.md` on branch `next`.

## Goal

Help patients find doctors and clinics by name, city and specialty, with shareable
search URLs, selectable alphabetical sorting and name autocomplete.

Use MediBridge's MongoDB aggregation approach as a reference. Its inspected
directory methods search memberNick and provide pagination, sorting and counts;
city/specialty filtering and name autocomplete are additions for this project.

## Scope

| Priority | Included behavior |
| --- | --- |
| Must have | Doctor full-name search and clinic-name search, independent of usernames |
| Must have | City and specialty filters, usable individually or together with name search |
| Must have | Server pagination, total matching count and stable ordering |
| Must have | Active/public eligibility restrictions, bounded validated inputs and public-field allowlists |
| Must have | Loading, error/retry, empty-result and clear-filter states |
| Nice to have — included | URL persistence, sharing, refresh restoration and Back/Forward navigation |
| Nice to have — included | Name A–Z / Name Z–A sorting, persisted in the URL |
| Nice to have — included | Debounced name input, removable filter chips and clear city/specialty labels |
| Nice to have — included | Responsive controls, keyboard operation and result announcements |
| Optional — included | Filter-aware name autocomplete with accessible suggestions |
| Deferred | Typo tolerance, relevance ranking, favorites, recent searches, map/distance search and availability-date filtering |

## Search and API behavior

- Doctors match memberFullName; clinics match clinicName. Do not match memberNick.
- Trim name input and match case-insensitive literal substrings. Escape regex
  metacharacters rather than interpreting user input as a regular expression.
  Names may contain Unicode; do not impose username character rules.
- Clinics filter by their own location. Doctors filter by the location of their
  active affiliated clinic, rather than a potentially stale doctor location.
- A doctor must offer the selected specialty. A clinic matches a specialty when
  at least one active, approved, nondeleted affiliated doctor offers it. Do not
  duplicate a clinic when multiple doctors match. Without a specialty filter,
  active clinics can appear even if they have no matching doctors.
- Preserve active-account, deletion and doctor-approval restrictions. Doctor
  discovery requires an active affiliated clinic. Return only approved public
  fields, never private contact, credential or session fields.
- Introduce public searchDoctors and searchClinics queries with validated inputs
  and a consistent paged result. Retain existing getDoctors, getClinics and
  getClinicDoctors contracts for existing callers.
- Proposed inputs: name, city, specialty, page, limit and sort. Use existing
  city/specialty enums; an allowlisted sort enum accepts NAME_ASC and NAME_DESC.
  Proposed limits: name at most 100 characters, default page 1, default limit 12,
  maximum limit 50 and maximum page 1000. Enforce these at the server boundary.
- Return entries, total, page and limit. Empty or out-of-range result pages return
  an empty entries array with the actual total, rather than a server error.
- Use aggregation: initial $match, necessary $lookup and joined-data filters,
  followed by $facet for the result page and total. Apply every search filter
  before pagination/counting. Use name plus _id for deterministic ordering;
  document the chosen case-insensitive collation consistently for both sorts.
- Bound query execution time. Inspect query plans with representative disposable
  data before proposing indexes. Substring regex search is not assumed to use
  a normal name index efficiently; no search engine or index migration is part
  of the initial scope unless measurements justify it.

## URL and interaction behavior

Example URLs:

```text
/doctors?name=Kim&city=SEOUL&specialty=CARDIOLOGIST&sort=NAME_DESC&page=2
/clinics?name=Care&city=BUSAN&specialty=DENTIST
```

- The URL is the source of truth for committed name, city, specialty, sort and page.
  Text being typed may remain a local draft until the debounce commits it.
- City, specialty and sort selections update the URL immediately. Name input
  commits after approximately 300 ms; Enter submits the current draft immediately.
- A changed search/filter/sort resets the result-page number to 1. Pagination
  changes only the page. Clearing all filters also resets the page.
- Omit empty filters and default page/sort values where practical. Encode values
  through URL query utilities; avoid manually concatenating query strings.
- Refresh, shared links and Back/Forward restore the controls and matching request.
  Normalize malformed URL values to safe UI defaults; backend validation remains
  authoritative. Do not preserve stale results as if they matched new filters.
- Use history replacement for debounced typing and history entries for deliberate
  filter/sort/page selections, avoiding an entry for every keystroke. Prevent
  pending typing from overwriting a later navigation or filter selection.
- Abort or ignore obsolete requests, including suggestions. Filter changes must
  not let an old response overwrite newer results.

## Autocomplete behavior

- Provide separate doctor-name and clinic-name suggestions using the same public
  eligibility and city/specialty rules as directory search.
- Start after at least two trimmed characters, debounce requests and return at
  most eight distinct matching names in stable alphabetical order. No initial
  blank-query suggestion request is needed.
- Suggestions use literal name matching, not typo correction. Selecting a name
  commits it to the URL and searches page 1; users can still submit arbitrary
  name text without selecting a suggestion.
- A suggestion selects a name rather than a member ID. Identical names can match
  multiple directory entries, which remain distinguishable in the result cards.
- Support keyboard selection, Enter and Escape with accessible combobox behavior.
  Suggestion failure must not prevent ordinary search. Do not persist the open
  suggestion list or keyboard-highlighted option in the URL.

## Implementation steps and commit boundaries

Implement one step at a time, verify it, report the result and stop for the owner
to stage/commit manually. Commit messages are provisional and must match the
final diff. No automatic staging, committing, pushing or merging.

### Step 1 — Doctor search API

**Completed locally November 4, 2026:** shared directory input/sort/page DTOs and
public searchDoctors aggregation delivered. Build/full TypeScript,77 unit,222 API
and30 disposable MongoDB search checks passed; lint only existing config.ts warning.
Explain on150 disposable records: substring collection scan and `_id_` clinic join;
no indexes proposed. Documentation and S05-08 updated. No staging/commit/push,
application DB or deployment changes; owner handles the commit before Step 2.

**Place:** backend branch, `.worktrees/backend/backend/`.

- Add shared validated directory inputs, sort enum and paged output DTOs in the
  existing libs folders. Keep resolver delegation and business queries in their
  established feature locations.
- Implement searchDoctors with full-name search, city/specialty filters,
  alphabetical sorting, pagination and totals using aggregation.
- Verify literal/Unicode names, exclusion of username-only matches, combined
  filters, clinic-derived city, active/approved restrictions, stable tied-name
  pages, invalid inputs, empty results and private-field exclusion. Execute
  aggregation against disposable MongoDB, not only mocked pipelines.

**Commit:** `feat(backend): add filtered doctor directory search`

### Step 2 — Clinic search API

**Completed locally November 5, 2026:** public searchClinics reuses the shared
directory input and page conventions, literal matching and bounded facet execution.
Specialty requires an eligible affiliated doctor using an existence lookup; clinics
without doctors remain discoverable without specialty. Both sort directions,
105 tied clinics with two doctors each, combined filters, eligibility and privacy
verified against disposable MongoDB. Build/full TypeScript,77 unit,222 API and69
directory integration checks passed; lint only existing config.ts warning. Updated
architecture/README/S05-08. No staging/commit/push, application DB or deployment
changes. Step 3 awaits the owner's next instruction after manual commit.

**Place:** backend branch, `.worktrees/backend/backend/`.

- Reuse Step 1 inputs/output conventions and implement searchClinics.
- Match clinicName and city; use affiliated eligible doctors for specialty
  filtering. Share only concrete reusable query logic.
- Verify combined filters, multiple matching doctors without duplicate clinics,
  exclusion of inactive/unapproved doctors from specialty matches, clinics without
  doctors when no specialty is selected, counts and both sort directions.

**Commit:** `feat(backend): add filtered clinic directory search`

### Step 3 — Name suggestion APIs

**Completed locally November 5, 2026:** public suggestDoctorNames/suggestClinicNames
accept required 2–100-character trimmed names and optional city/specialty. Shared
directory eligibility pipelines feed case-insensitive distinct name grouping,
stable display casing/alphabetical order and an eight-name maximum with a5s bound.
Responses are strings only. Build/full TypeScript,77 unit,222 API and118 disposable
directory checks passed (49 new suggestion checks); lint only existing config.ts
warning. Architecture/README/S05-08 updated. No staging/commit/push, application DB,
frontend or deployment changes. Stop for manual commit before Step4.

**Place:** backend branch, `.worktrees/backend/backend/`.

- Add bounded doctor/clinic name suggestions, reusing the search eligibility and
  literal matching rules with city/specialty constraints.
- Verify minimum/maximum input lengths, distinct names, eight-result limit,
  filtering, deterministic order and public-only response fields.
- Document the search and suggestion contracts in the existing backend architecture
  document and update the concise README feature summary as needed.

**Commit:** `feat(backend): add filtered directory name suggestions`

### Step 4 — Doctor search screen and shared URL behavior

**Completed locally:** Doctor search, URL state and autocomplete are delivered on next `f6dc891`;
remaining interaction checks passed during combined Step6 acceptance.

**Place:** next branch, `.worktrees/next/next/`.

- Add GraphQL documents/API adapters for the new contracts.
- Connect the doctor screen to server search with city/specialty selectors,
  sorting, pagination, count and loading/error/empty states.
- Add URL parsing/synchronization and autocomplete as part of this working screen.
  Reuse established UI, transport and styling conventions; avoid introducing
  components or hooks with no current caller.
- Verify deep-link restoration, debounce, Enter submission, filter/page resets,
  Back/Forward, obsolete-response suppression and autocomplete keyboard behavior.

**Commit:** `feat(next): add URL-driven doctor search and autocomplete`

### Step 5 — Clinic search screen

**Completed locally:** Clinic search and the shared directory are delivered on next `1cb6378`;
public clinic-specific previews and booking-return behavior passed Step6 acceptance.

**Place:** next branch, `.worktrees/next/next/`.

- Reuse the doctor screen's shared filter/URL/API patterns for clinic search and
  autocomplete, while preserving clinic cards and doctor-detail actions.
- Replace doctor-list-based clinic discovery on this directory screen with the
  clinic search query. Remove stale first-100-doctors messaging there.
- Verify clinic-name matching, city/specialty filtering, sort/page URL state,
  errors, empty results and navigation back from clinic actions.
- Keep homepage and unrelated discovery callers working; migrate them only when
  required for a consistent affected flow.

**Commit:** `feat(next): add URL-driven clinic search and autocomplete`

### Step 6 — Filter polish and combined acceptance

**Completed locally:** Filter polish and combined local acceptance completed November5. Typecheck,92
frontend tests and final isolated production build pass. Actual Next adapters→normal
Nest→owned disposable MongoDB verify125 matching doctors and125 matching clinics,
combined filters,both sorts,page2,accurate totals,literal Unicode,username exclusion,
eight suggestions,separate503 recovery and obsolete-read cancellation. Chrome checks
pass for deep links,doctor keyboard suggestion selection,refresh/Back/Forward,chip
removal/clear/page reset/focus,clinic doctor dialog/booking return,error/retry and
Escape.390px controls/cards and centered wrapped pagination pass on both pages.
Owned fixture stopped and Mongo files removed; application databases/flags unchanged.
Square card images and upload cropping remain deferred to a separate future plan.

**Place:** next branch for UI changes; backend branch only for a verified API
defect or necessary API documentation correction, committed separately.

- Add removable filter chips and clear city/specialty labels; polish responsive
  layout, focus behavior, result announcements and loading transitions.
- Verify both screens through the actual Next-to-Nest flow with disposable data:
  combined filters, more than 100 matching records, both sorting directions,
  pagination, suggestions, shared links, refresh and Back/Forward.
- Check desktop/mobile layouts, keyboard-only use and the distinction between
  suggestion failure and main-search failure. Use real API/database checks for
  filter correctness and browser checks for actual interaction behavior.
- Update affected frontend documentation and each application's required delivery
  records, preserving existing sprint IDs/history. Distinguish local acceptance
  from deployment; do not change application databases or activate production flags.

**Commit:** `feat(next): polish directory search and filter navigation`

If acceptance requires a backend fix, report its concrete scope and use a separate
`fix(backend): ...` message. Do not create an empty commit solely for verification.

## Verification and completion

- Each backend step runs the relevant build/typecheck and API/database tests;
  extend existing coverage where possible. Each frontend step runs typecheck,
  relevant tests and an isolated production build where required.
- Update feature/API documentation as behavior is delivered, rather than claiming
  future steps are implemented. Log actual implementation/checks only after they
  occur, following each worktree's AGENTS.md.
- Tests requiring real MongoDB use the owned disposable runner and never load
  application database settings. No dependency or deployment changes are assumed.
- Completion means both directories support the agreed name/filter/sort/URL and
  autocomplete behavior and the checks above pass. Record unverified deployment
  or provider behavior explicitly.

Suggested commit for this plan alone:
`docs(backend): plan filtered directory search and autocomplete`.
