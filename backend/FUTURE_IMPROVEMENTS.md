# Future improvements roadmap

Created: November 4, 2026 (Asia/Seoul)

This is the shared roadmap for modular backend and Next.js improvements. Keep the
overview here; create a separate implementation plan for each improvement when it
is selected, following [DIRECTORY_SEARCH_PLAN.md](DIRECTORY_SEARCH_PLAN.md).
Roadmap entries do not authorize implementation or establish delivery deadlines.

## Status labels

- **Backlog:** proposed improvement; detailed scope and plan are not yet prepared.
- **Planned:** a detailed implementation plan exists; implementation has not started.
- **In progress:** implementation has started; remaining steps are recorded in its plan.
- **Completed:** the agreed scope is implemented and verified, with completion date
  and evidence recorded below.

Keep completed entries in this roadmap. Update their labels as work progresses;
do not remove them or reuse their IDs. Mark an item **Completed** only after its
agreed backend/frontend scope and acceptance checks are satisfied. Partial backend
delivery must remain **In progress** if the agreed user-facing flow is unfinished.
Record verification limits separately; implementation completion does not imply
production deployment.

## Roadmap

Sizes are preliminary relative estimates, not commitments. Ordering reflects the
initial recommendation; choose the next item explicitly before creating its plan.

| ID    | Improvement                                | Outcome                                                                                                         | Estimated size | Status        | Detailed plan                                     | Completed on     |
| ----- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------- | ------------- | ------------------------------------------------- | ---------------- |
| FI-01 | Better doctor/clinic search                | Find doctors and clinics by name, city and specialty, with pagination, sorting, shareable URLs and autocomplete | Medium         | **Completed** | [Directory search plan](DIRECTORY_SEARCH_PLAN.md) | November 5, 2026 |
| FI-02 | Appointment reminders                      | Notify patients before upcoming visits, starting with in-app reminders and considering email later              | Medium         | **Planned**   | [Appointment reminders plan](APPOINTMENT_REMINDERS_PLAN.md) | —                |
| FI-03 | Forgot-password recovery                   | Recover email/password account access through an expiring, single-use reset link                                | Medium         | **Backlog**   | Not created                                       | —                |
| FI-04 | Add to personal calendar                   | Add a one-time appointment event through a checkbox before booking or a button after booking                    | Small          | **Backlog**   | Not created                                       | —                |
| FI-05 | Clinic dashboard statistics                | View upcoming visits, cancellations, completed appointments and no-shows for a selected period                  | Medium         | **Backlog**   | Not created                                       | —                |
| FI-06 | Doctor change requests                     | Let doctors request appointment cancellation or schedule changes for clinic approval                            | Larger         | **Backlog**   | Not created                                       | —                |
| FI-07 | Square directory photos and upload cropper | Display doctor and clinic card photos at 1:1 and let members crop replacement photos before uploading           | Medium         | **Completed** | `next/IMAGE_CROPPER_PLAN.md` on branch `next`     | November 5, 2026 |

## Scope notes for future plans

### FI-01 — Better doctor/clinic search - COMPLETED

The linked plan defines the agreed scope: doctor full names and clinic names rather
than usernames; city/specialty filters; MongoDB aggregation and server pagination;
Name A–Z / Z–A sorting; URL synchronization; filter chips; responsive/keyboard polish;
and filter-aware name autocomplete. Typo tolerance remains deferred.

Completed locally November5: all six agreed steps are implemented and accepted.
Backend search/suggestions and Next doctor/clinic directories include filters,
sorting,pagination,shareable URLs,autocomplete and removable chips. Typecheck,92
frontend tests,production build,real Nest/disposable-MongoDB adapter checks and
Chrome desktop/390px mobile interaction checks passed. Both directories were checked
with125 matching records; wrapped pagination centers on both pages. Detailed evidence
is in the linked plan and the Next branch's architecture/SPRINT_05 records. Step6
awaits the owner's manual commit; completion does not imply deployment. Square card
photos and upload cropping are separate deferred work.

### FI-02 — Appointment reminders — Planned

The [dedicated plan](APPOINTMENT_REMINDERS_PLAN.md) defines six implementation
steps across the backend and Next worktrees, with acceptance checks and manual
commit boundaries. Proposed timing is 24 hours and 1 hour before confirmed visits;
policy agreement and implementation remain pending. Reuse the durable in-app
outbox/inbox with independent enablement, stale-reminder suppression, retries and
deduplication. Existing waitlist notices are not appointment reminders. Email and
the FI-06 rescheduling workflow remain deferred. No implementation is complete.

### FI-03 — Forgot-password recovery

Support email/password accounts with expiring, single-use recovery links. Define
the delivery channel, neutral account-existence responses, request limits, reset
token storage and session invalidation before implementation. Existing authenticated
password changes do not satisfy account recovery.

### FI-04 — Add to personal calendar

Provide an optional **Add to my calendar** checkbox above the booking button.
Only after the booking succeeds, offer the confirmed appointment to the user's
calendar for a one-time save. Also provide an **Add to my calendar** button on the
booking confirmation and in the booked appointment's details, so users can add it
later or retry if opening the calendar was blocked.

Use a prefilled Google Calendar event link and an `.ics` option for compatible
calendar apps on Android, iPhone, Mac and Windows. The user confirms saving/importing
the event; no connected calendar account or synchronization is required. Include
the appointment time, duration, clinic information and a suggested reminder where
supported. Calendar settings and permissions determine notification delivery.

Define authorization, timezone handling, private-field limits and stable event IDs
in the dedicated plan. Generate events from confirmed server booking data, not an
unsaved form. Adding a calendar event must not determine whether booking succeeds.
Avoid duplicate additions where practical, but do not promise deduplication across
all calendar clients. Later appointment changes or cancellations do not automatically
update the saved event; communicate that when adding it. Calendar synchronization
and subscriptions are outside this item's scope.

### FI-05 — Clinic dashboard statistics

Provide own-clinic aggregate counts over a selected period. Define date/timezone
boundaries, included statuses and access rules in the plan. Verify counts against
actual appointments and avoid exposing patient information in aggregate responses.

### FI-06 — Doctor change requests

Build a doctor-to-clinic approval workflow for cancellation or schedule-change
requests. Existing schema fields are a starting point, not a completed workflow.
Define request states, approval/rejection, participant notifications and handling
of stale requests or unavailable destination slots. Preserve booking, waitlist and
transaction rules when an approved request is applied.

### FI-07 — Square directory photos and upload cropper - COMPLETED

Completed locally November5,2026. Next doctor/clinic cards use1:1 images,including
existing/default photos without rewriting storage. My Page uses the reviewed
MediBridge-style square crop/zoom dialog before the existing Save changes upload.
Crop confirmation remains local; cancel and upload failure preserve the draft.
Output is JPEG,maximum1024×1024,without upscaling; transparent pixels become white.
Uploaded image paths resolve against the API origin. Next backlog NEXT-B13 and the
implementation/acceptance plan `next/IMAGE_CROPPER_PLAN.md` are on branch `next`.

Next typecheck,97 tests and production build pass. Chrome verifies desktop keyboard,
cancel/draft behavior,upload-error preservation,actual clinic/doctor saves and375px
mobile dialog. Stored fixture files are JPEG1024×1024 in the correct owned targets;
the public clinic card displays the saved crop after the origin fix. A separately
authorized backend UploadResolver fix prevents ValidationPipe from instantiating
GraphQL upload promises; build/full TypeScript,12 upload and all222 API checks pass.
Lint has the pre-existing config.ts warning. Disposable data only; production
storage/deployment,legacy rewriting and additional image-editing features remain out
of scope. Commits remain manual and separate for backend/Next.

## Modular delivery workflow

1. Select a roadmap item and refine its scope before implementation.
2. Create a dedicated `*_PLAN.md` alongside this roadmap and link it in the table.
   Include must-have/nice-to-have/optional scope, small cohesive steps, backend or
   Next.js worktree locations, acceptance checks and proposed commit messages.
3. Implement and verify one agreed step at a time. The owner stages, commits and
   pushes manually unless explicitly requested otherwise.
4. Keep the roadmap and detailed plan aligned with actual progress. Follow each
   worktree's documentation, sprint and implementation-record rules.
5. After agreed acceptance passes, add the **Completed** label, actual Asia/Seoul
   completion date and a short evidence note below. Preserve outstanding deployment
   or external-provider verification limits.

## Completion records

- FI-01 — Completed locally November 5, 2026; evidence and deployment limits are
  recorded in its scope note and the linked directory search plan.

- FI-07 — Completed locally November 5, 2026; cropper,API upload and card evidence
  are recorded above and in the Next branch plan.
