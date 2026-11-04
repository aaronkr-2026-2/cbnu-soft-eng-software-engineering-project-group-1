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

| ID | Improvement | Outcome | Estimated size | Status | Detailed plan | Completed on |
| --- | --- | --- | --- | --- | --- | --- |
| FI-01 | Better doctor/clinic search | Find doctors and clinics by name, city and specialty, with pagination, sorting, shareable URLs and autocomplete | Medium | **Planned** | [Directory search plan](DIRECTORY_SEARCH_PLAN.md) | — |
| FI-02 | Appointment reminders | Notify patients before upcoming visits, starting with in-app reminders and considering email later | Medium | **Backlog** | Not created | — |
| FI-03 | Forgot-password recovery | Recover email/password account access through an expiring, single-use reset link | Medium | **Backlog** | Not created | — |
| FI-04 | Add to personal calendar | Add a one-time appointment event through a checkbox before booking or a button after booking | Small | **Backlog** | Not created | — |
| FI-05 | Clinic dashboard statistics | View upcoming visits, cancellations, completed appointments and no-shows for a selected period | Medium | **Backlog** | Not created | — |
| FI-06 | Doctor change requests | Let doctors request appointment cancellation or schedule changes for clinic approval | Larger | **Backlog** | Not created | — |

## Scope notes for future plans

### FI-01 — Better doctor/clinic search

The linked plan defines the agreed scope: doctor full names and clinic names rather
than usernames; city/specialty filters; MongoDB aggregation and server pagination;
Name A–Z / Z–A sorting; URL synchronization; filter chips; responsive/keyboard polish;
and filter-aware name autocomplete. Typo tolerance remains deferred.

Completion evidence: the plan's implemented steps and automated/API/database/browser
acceptance results. No search feature implementation is claimed by this roadmap.

### FI-02 — Appointment reminders

Start with in-app reminders for upcoming appointments. Existing waitlist notices
are not appointment reminders. Define reminder timing, cancellation/rescheduling
handling, retry behavior and duplicate prevention in the future plan. Email delivery
is a possible later extension, not part of an agreed initial implementation.

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

None yet for the improvements in this roadmap.
