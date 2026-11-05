# Sprint 05 — Waitlists, operational readiness and usernames

**Period:** October 30–November 5, 2026 (Asia/Seoul)
**Review through:** November 5, 2026
**Status:** In progress; final review due November 5
**Owner:** Me
**Sprint goal:** Let patients safely join waitlists and manage unique usernames while giving operators a verifiable booking rollout path.

This is an in-progress review prepared November 2, not a claim that the whole sprint
or a production rollout is complete. Actual hours and remaining capacity were not
recorded. [Sprint 04](SPRINT_04.md) supplies the prior delivery context.

## Delivered through November 2

| ID | Delivery | Commit evidence / source |
| --- | --- | --- |
| S05-01 | Waitlist enrollment/withdrawal, consent, scoped reads and atomic replacements | `df565b7`, Oct 31; [waitlist service](src/components/waitlist/waitlist.service.ts) |
| S05-02 | Safe FIFO promotion with leases, stale-target rechecks and idempotence | `5e18b43`, Oct 31; [promotion worker](src/components/appointment/appointment-promotion.service.ts) |
| S05-03 | Cutoff lifecycle, required durable IN_APP notices, inbox/read APIs | `c2398f3`, Oct 31; [notification service](src/components/notification/notification.service.ts) |
| S05-04 | My Appointments, authorized calendar snapshots/revisions and fresh notification targets | `22da904`, `0a5f882`, `b0221c3`, Oct 31 |
| S05-05 | Validated activation prerequisites, recovery/replay/backup checks, status assets and multi-batch audits | `45d8988`, Nov 1; [rollout procedure](BOOKING_ROLLOUT.md) |
| S05-06 | Case-insensitive username storage/migration, eight-digit generated Google names, availability/conflict APIs | `e2da631`, `79cc0f1`, `94bcba8`, `b1904c6`, Nov 1; [username migration](src/components/member/member-username-migration.ts) |
| S05-07 | Clinic-local weekday-only availability/bookings, including legacy/custom hours | `74d02a7`, Nov 1; [slot policy](src/components/appointment/appointment-slot.ts) |

Relevant integration commits include `f24cac9` and `60a3dc6`. Later commits remain
backend branch delivery until separately merged; no remote merge/deployment is
asserted. Frontend screens belong to the matching Next sprint, not this table.

## Verification and limits

- Nov 1 weekend change: build/full TypeScript,69 unit,222 API and 193 real-MongoDB
  booking checks passed; lint retained only the existing empty config.ts warning.
- Nov 2 OAuth acceptance: backend build,72 auth API tests and 18 disposable MongoDB
  migration/uniqueness tests passed. Normal Nest/Next HTTP and Chrome checks proved
  competing signup/rename saves, owner casing, separate full names, real login and
  refresh persistence, and conflict markers/draft preservation. Next separately
  passed typecheck/65 tests/build and mobile/keyboard checks.
- Earlier Step12 local normal-worker browser acceptance and process-kill/recovery,
  pause/replay and dump/restore evidence are recorded in [AI_LOG.md](AI_LOG.md) and
  the [rollout procedure](BOOKING_ROLLOUT.md). Counts across dates overlap.
- The owner chose automated Google checks only for Nov 2 acceptance. Signed-token
  checks use the real library with substituted key lookup; fresh live Google sign-in
  remains unverified. An earlier owner-confirmed signup is separate historical evidence.
- No application/production DB migration, staging/production activation, load/SLA
  proof or external email/SMS provider delivery is claimed. Test stack was stopped.

## November 3 maintenance — S05-07

Completed the scoped appointment eligibility refactor supporting S05-07: booking,
reopening and schedule lookups now share the session-aware appointment-doctor helper.
All seven services, public API contracts, errors and transaction boundaries remain.
Eight regression tests cover session propagation, approved affiliation scope,
optional schedule specialty, errors and infrastructure failure propagation.
Build/full TypeScript,77 unit,222 API and193 disposable MongoDB checks passed;
lint retains only the existing empty config.ts warning. Socket-based suites required
local-socket execution after sandbox EPERM. No browser/deployment verification,
application database changes, staging, commit or push. Optional naming/read-provider
changes remain deferred; this is not a production-readiness sign-off.

## November 4 delivery — S05-08

Doctor directory search API (Step 1) completed locally November 4. Public
`searchDoctors` adds validated full-name/city/specialty filters, both alphabetical
sorts, stable name/ID pagination and actual totals. Active approved doctors require
an active clinic; city comes from the clinic and responses use a public allowlist.
Existing discovery queries remain compatible. Added directory DTOs/sort enum and
`npm run test:directory:integration` using the owned disposable runner.

Build/full TypeScript,77 unit,222 API and30 disposable MongoDB search tests passed;
lint has only the existing empty config.ts warning. Tests cover literal/Unicode
names, username exclusion, combined filters, clinic city changes, eligibility,
125 tied-name rows, invalid inputs and privacy. A150-row explain check confirms
collection scan/name substring and `_id_` clinic lookup; no index changes proposed.
Initial fixture validation/unique-key mistakes were corrected before final passing
checks. Sandbox socket EPERM required local-port execution. No application DB,
frontend, deployment, staging, commit or push changes. Clinic search, suggestions,
URL-driven screens and combined browser acceptance remain later steps.

## November 5 delivery continuation — S05-08

Clinic search API (directory Step 2) completed locally November 5 from committed
Step 1 (`39549ea`). Public `searchClinics` matches clinic name/city and requires an
active approved nondeleted affiliated doctor for specialty filtering. The existence
lookup avoids duplicate clinics/counts; clinics without doctors appear without a
specialty filter. Shared literal matching, facet pagination/public projection and
execution options preserve doctor search and legacy discovery contracts.

Build/full TypeScript,77 unit,222 API and69 disposable directory integration checks
passed (39 new clinic checks). Verified both sort directions,105 tied clinics with
two doctors each, combined filters, eligibility, invalid inputs, empty pages and
privacy. The52-clinic/50-doctor explain fixture confirms collection scanning; no
indexes proposed or production-scale performance claimed. Lint retains only the
existing config.ts warning. API documentation/README/local plan updated. Suggestions,
frontend integration and browser acceptance remain pending; no application database,
deployment, staging, commit or push changes. This is an interim November5 delivery
update, not the final sprint review or authorization for remaining backlog work.

## November 5 name suggestions — S05-08

Directory Step3 completed locally after Step2 commit `8071ba5`. Public
`suggestDoctorNames` and `suggestClinicNames` reuse directory eligibility/city/
specialty rules and return at most eight distinct names, alphabetically ordered.
Required name input is trimmed and bounded to2–100 characters. Case-equivalent
names share a stable display string; responses expose only names. Extracted shared
directory pipeline builders and filter DTO fields without changing search contracts.

Build/full TypeScript,77 unit,222 API and118 disposable MongoDB directory checks
passed, including49 new suggestion checks for bounds, literal/Unicode matching,
deduplication/cap, order, filtering, eligibility and privacy. Lint retains only the
existing config.ts warning. Architecture/README/plan updated. No application DB,
indexes, frontend/deployment, staging, commit or push changes. Frontend autocomplete,
URL behavior and browser acceptance remain Steps4–6; this is backend completion
only and does not close the whole sprint.

## November 5 directory completion — S05-08

The agreed six-step directory search plan is complete locally. Backend contracts
remain unchanged from `7f712a0`; Next Steps4–6 deliver both directory screens,
URL/autocomplete/filter polish and combined acceptance. Next typecheck,92 tests,
isolated production build,real adapters against Nest/disposable MongoDB and Chrome
desktop/390px checks pass,including125 matches per directory and centered wrapped
pagination. Detailed frontend evidence is on branch `next` in architecture-next and
NEXT-B11. Updated DIRECTORY_SEARCH_PLAN/FUTURE_IMPROVEMENTS FI-01 to completed at the
owner's request. Step6 awaits manual commit; no deployment or whole-sprint closure.
Square photos/cropping remain deferred. No backend code or database changes.

## November 5 — S05-09 upload scalar validation fix / FI-07

Real cropper acceptance exposed a pre-existing normal-main API crash: the global
transforming ValidationPipe tried to instantiate a GraphQL Upload Promise. At the
owner's explicit authorization,UploadResolver now reflects a FileUpload/Promise
union and normalizes it before calling UploadService. The upload HTTP suite now
uses the same validation options as main.ts; schema/guard/ownership rules are unchanged.
Build/full TypeScript,all12 upload tests and all222 API tests pass; lint has only the
existing config.ts warning. Actual browser clinic/doctor saves produce owned
JPEG1024×1024 files in the disposable stack. FI-07/NEXT-B13 is completed locally on
Next; details in its IMAGE_CROPPER_PLAN. No app DB/config/deployment/Git actions.

## Prioritized remaining backlog

Labels indicate current planning: 🔴 Thinking = candidate; 🔵 Planning = refined.
No future work is authorized merely by listing it.

| ID | Priority / type | Item and rationale | Label |
| --- | --- | --- | --- |
| S05-F01 | P1 / Engineering/test | Review a concrete staging rollout checklist and recovery evidence before activation | 🔵 Planning |
| S05-F02 | P1 / Data-readiness review | Prepare operator decisions for the actual target's username migration; never silently rename accounts | 🔵 Planning |
| S05-F03 | P2 / Test | Multi-instance rate limits, proxy/TLS and load acceptance beyond a local process | 🔴 Thinking |
| S03-F01 | P2 / Test | Live profile upload/password acceptance against intended storage | 🔴 Thinking |
| S05-F04 | P2 / Feature/operations | Decide whether external delivery providers are needed and configure only after selection | 🔴 Thinking |
| S02-07 | P3 / Optional verification | Fresh live Google-provider acceptance, only if the owner reopens that scope | 🔴 Thinking; real-MongoDB portion is now verified |

**Remaining-work planning assumption:**8 h of review capacity, not confirmed owner
availability. Select F01/F02 for3 h each, leaving2 h buffer; no claim of20 h remaining
or a whole-sprint implementation estimate is made.

**Top item S05-F01 —3 h:** Review the intended staging topology and existing runbook.
Accept when all prerequisites have named evidence/owners, rollback/pause decisions
are explicit, and production activation is excluded without its own authorization.
Dependencies: target environment and operator availability; deliverable is a review,
not a deployment.

**Top item S05-F02 —3 h:** Prepare a reviewed target-data migration decision process.
Accept when invalid/colliding/legacy Google names have explicit decisions, backup
and stopped-writer requirements are checked, and unresolved records block apply.
Dependencies: an explicitly selected target and owner decisions. No target-data read
or migration is performed by this sprint documentation task.

| Order | Proposed task | Owner | Blocker |
| --- | --- | --- | --- |
|1 | Inventory staging gates/evidence and review recovery procedure | Me | Target topology and operator access |
|2 | Review migration decision/backup checklist | Me | Real-account decisions and writer shutdown window |
|3 | Record readiness gaps and retain default-off production flags | Me | Missing evidence or review |

**Proposed check-ins:** Nov 3 — completed / next / blockers; Nov 5 final review —
completed / next / blockers. These are future proposals, not recorded meetings.

## Definition of done and continuation

- [x] Delivered source, commits and local acceptance evidence recorded.
- [x] Required automated Google scope completed with its live-provider limit explicit.
- [ ] Peer review or documented self-review of the current release candidate.
- [ ] F01/F02 readiness reviews completed, or explicitly carried forward.
- [ ] November 5 review records final outcomes and selects a following-week backlog.

Manual provider/operator checks cover credentials, browser consent and deployment
state that test substitutes cannot establish. No Sprint 06 dates, issue creation,
activation or Git actions are implied by this record. Existing Sprint 01–02 remain unchanged.
