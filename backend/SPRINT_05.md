# Sprint 05 — Waitlists, operational readiness and usernames

**Period:** October 30–November 5, 2026 (Asia/Seoul)
**Review through:** November 5, 2026
**Status:** Closed — November 5, 2026; release-readiness work carried forward
**Owner:** Me
**Sprint goal:** Let patients safely join waitlists and manage unique usernames while giving operators a verifiable booking rollout path.

This final review closes the October 30–November 5 sprint. The goal was met for
locally verified waitlist, booking and username flows; target-environment operational
readiness remains incomplete and is carried forward. Directory search and upload
compatibility were additional selected deliveries. Actual hours, velocity and
confirmed future capacity were not recorded. [Sprint 04](SPRINT_04.md) remains unchanged.

## Final outcome and source review — November 5

| ID | Final disposition | Source / commit evidence |
| --- | --- | --- |
| S05-01–S05-07 | Delivered locally; earlier acceptance and limitations retained below | Existing delivery table; eligibility maintenance `c1ae9c3`, [shared lookup](src/components/appointment/appointment-doctor.ts) |
| S05-08 / FI-01 | Completed locally: doctor/clinic name, city, specialty, sort, paging and suggestions; Next combined acceptance completed | `39549ea`, `8071ba5`, `0cfb541`; [search plan](DIRECTORY_SEARCH_PLAN.md), [member resolver](src/components/member/member.resolver.ts) |
| S05-09 / FI-07 dependency | Completed locally: multipart Upload scalar survives production validation | `16f1db6`; [upload resolver](src/components/upload/upload.resolver.ts), [HTTP regression suite](test/upload.e2e-spec.ts) |

The closure self-review compared current source, test setup, branch history and
recorded acceptance. Latest backend build/full TypeScript and 222 API tests passed,
including the 12 upload cases; directory acceptance separately passed 118 disposable
MongoDB checks. Earlier 77-unit/193-booking and username counts below are separate,
overlapping checkpoints, not one summed test total. Lint retains the existing empty
config.ts warning. This documentation task does not rerun application tests.

**Integration boundary:** backend is at `16f1db6`; Next cropper delivery is `8005084`
on branch `next`. Neither latest commit is an ancestor of the other branch at this
review. Cross-worktree Next/Nest/disposable-MongoDB acceptance passed, but a combined
release candidate and its review remain S05-F01 work. No merge, deployment or
production activation is claimed. Independent peer review is not recorded.

**Historical checkpoints:** the dated delivery notes below preserve what was known
at each step. Their pending UI/cropper statements are superseded by the later
completion entries and this final review.

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
owner's request. Next Step6 is committed as `38fd308`; no deployment was performed.
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

## Carry-forward backlog and following-period recommendation

The following stable IDs remain open after sprint closure. Labels describe refinement,
not work underway: 🔴 Thinking = candidate; 🔵 Planning = refined. No implementation,
target-data access or activation is authorized by this review.

| ID | Priority / type | Remaining outcome and reason | Disposition |
| --- | --- | --- | --- |
| S05-F01 | P1 / Engineering/test | Combine delivered branches through the requested Git workflow, then review the actual staging topology and rollout/recovery evidence | Carried forward — 🔵 Planning |
| S05-F02 | P1 / Data-readiness review | Prepare target-specific username migration decisions, backup and stopped-writer requirements | Carried forward — 🔵 Planning |
| S05-F03 | P2 / Test | Multi-instance rate limits, proxy/TLS and load acceptance beyond a local process | Carried forward — 🔴 Thinking |
| S03-F01 | P2 / Test | Intended-storage profile replacement/removal and password acceptance; disposable crop uploads alone do not close this | Carried forward — 🔴 Thinking |
| S05-F04 | P2 / Feature/operations | Decide whether external delivery providers are needed before configuring them | Carried forward — 🔴 Thinking |
| S02-07 | P3 / Optional verification | Fresh live Google-provider acceptance only if the owner reopens it | Optional carry-forward — 🔴 Thinking; automated scope accepted |

**Planning scenario:** the earlier 8-hour assumption was unconfirmed, not measured
or remaining sprint capacity. For a future period, F01 and F02 are recommended at
3 hours each with 2 hours buffer, subject to owner selection and availability.
Next NEXT-B10 overlaps F01; these estimates must not be added as independent work.
Intended-storage work is an alternative/dependent selection, not an additional
commitment. No Sprint 06 dates or record are created here.

**S05-F01 — 3 hours, Me:** Review a concrete combined candidate and target topology.
Accept when (1) candidate revisions include both latest deliveries and integration
checks/review are recorded, (2) staging prerequisites have named evidence and owners,
and (3) pause/rollback decisions and unverified production gates are explicit.
Dependencies: branch integration authorization, target topology and operator access.
The deliverable is review evidence, not production activation.

**S05-F02 — 3 hours, Me:** Prepare the target-data migration decision process.
Accept when (1) invalid/colliding/legacy names have explicit decisions, (2) backup
and stopped-writer requirements are documented, and (3) unresolved records block
apply. Dependencies: selected target and owner decisions. No target-data read or
migration was performed for this sprint closure.

| Order | Proposed task | Owner | Dependency / blocker |
| --- | --- | --- | --- |
| 1 | Record combined candidate revisions and review rollout/recovery gates | Me | Requested integration, target topology and operator access |
| 2 | Review migration decisions and backup/writer-shutdown checklist | Me | Real-account decisions and an approved target |
| 3 | Record remaining readiness gaps and choose subsequent work | Me | Missing evidence or owner selection |

**Check-in record:** the earlier Nov 3 and Nov 5 check-ins were proposals; no meetings
or check-in attendance are claimed. This document is the Nov 5 final review. If
carry-forward work is selected, propose a start check-in and a pre-acceptance check-in
using completed / next / blockers; dates depend on the next confirmed period.

## Sprint closure checklist

- [x] Final outcomes, stable IDs, commits and source evidence reviewed and recorded.
- [x] Automated, disposable-data and browser evidence separated from deployment claims.
- [x] Documentation/source-evidence self-review completed; independent peer-review gap recorded.
- [x] F01/F02 and all other unfinished readiness work explicitly carried forward.
- [x] Branch integration state recorded without claiming a combined release candidate.
- [x] Nov 5 final review completed and following-period recommendations recorded.

The sprint record is closed. Combined-candidate peer/release review, staging and
production gates remain open under the carry-forward IDs. Provider/operator checks
require the actual environment, credentials and decisions. Sprint 01–04 history,
application data and production flags remain unchanged; no issues, merge, staging,
commit, push or deployment actions were performed by this review.
