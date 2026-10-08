# Feature-to-story gap map

This scoped map covers the three active stories. The complete current-feature inventory and orphan-feature review remain pending. See [personas and stories](personas.md).

## OAuth sign-in gap

| Story ID | Persona | Existing supporting feature | Classification | Rationale | Recommended next action |
|---|---|---|---|---|---|
| P1-S04 | P1 — Alex, the MedConnect creator | None: OAuth sign-in is not implemented | **Backlog** | The creator requested external-account sign-in. Existing email/password signup, login, and refresh do not provide this path. Avoiding another password is a proposed benefit requiring confirmation. | Confirm the desired provider, intended account roles, and benefit; then define acceptance criteria for sign-in, new-account onboarding, linking existing accounts, and failed/canceled sign-in before implementation. |

**Current behavior:** Member authentication exposes REST signup, login, and refresh in `backend/src/components/member/member.controller.ts`. OAuth is a requested capability, not an existing feature, and has no current feature ID.

**Verification limits:** This documentation change used the creator's confirmation and inspected authentication source. The app was not run and no provider sign-in was tested.

**Unresolved questions:** Which external provider should be supported first? Should OAuth serve patients only or also doctors and clinics? Does avoiding another password describe Alex's actual motivation?

**Simulated persona critique:** Alex could reasonably ask, “Which external account can I use, and will it connect to my existing MedConnect account?” This is an AI role-play prompt, not interview evidence; these decisions remain unresolved.

## Friends' provisional story mappings

| Story ID | Persona | Supporting implementation | Classification | Rationale | Recommended next action |
|---|---|---|---|---|---|
| P2-S01 | P2 — John | Appointment booking through REST/GraphQL | **Keep — provisional** | Booking supports the proposed online-request need, but the friend's actual need is unconfirmed. Approved affiliation and configured working hours are required; the frontend booking flow is incomplete. | Confirm the friend's role and need, then verify the booking flow against the running MVP. |
| P3-S01 | P3 — Eddy | Appointment lookup through REST/GraphQL | **Keep — provisional** | Participants can read current appointment status. The friend's need is unconfirmed; clinic confirmation functionality is absent, so lookup alone cannot deliver the full confirmation outcome. | Confirm the friend's role and need; review the missing confirmation workflow and frontend status display. |

These supporting implementations are descriptions, not a completed stable-ID feature inventory. The app was not run for this revision. P1-S04 remains the confirmed OAuth Backlog capability; P2-S01 and P3-S01 have provisional support, not validated user evidence.
