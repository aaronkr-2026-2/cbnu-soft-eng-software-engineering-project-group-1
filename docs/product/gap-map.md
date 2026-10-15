# Feature-to-story gap map

This scoped map covers the three active stories. The complete current-feature inventory and orphan-feature review remain pending. See [personas and stories](personas.md).

## OAuth sign-in gap

| Story ID | Persona | Existing supporting feature | Classification | Rationale | Recommended next action |
|---|---|---|---|---|---|
| P1-S04 | P1 — Alex, the MedConnect creator | Google ID-token sign-in API with automatic USER registration and existing application sessions | **Keep — partial; browser integration Backlog** | The backend now supports the requested Google identity path without phone/password onboarding. The checked-in frontend still lacks the Google button and credential/nonce integration, so the complete website story is not delivered. Avoiding another password remains a proposed benefit requiring confirmation. | Integrate the browser Google button and nonce flow, verify real sign-in/cancellation, and design explicit linking for existing accounts. |

**Current behavior:** MemberController exposes `/member/google/nonce` and `/member/google/login` alongside email/password signup/login/refresh. Google verification and nonce binding are implemented; new Google identities become USER accounts without phone/password, using a provider name or unique fallback nickname. Existing email conflicts return 409 without automatic linking. A full stable-ID feature inventory remains pending.

**Verification limits:** Automated backend tests exercise locally signed tokens through the real verification library with mocked public-key retrieval and simulated persistence. Live Google/browser sign-in and real MongoDB races remain unverified.

**Scope and unresolved questions:** Google is the selected provider; new accounts are USER initially. Phone is not required; Google names or generated fallback nicknames are used. Doctor/clinic OAuth onboarding and explicit account linking remain future work. Does avoiding another password describe Alex's actual motivation?

**Simulated persona critique:** Alex could reasonably ask, “Which external account can I use, and will it connect to my existing MedConnect account?” This is an AI role-play prompt, not interview evidence; Google is now selected, while explicit existing-account linking remains unimplemented.

## Friends' provisional story mappings

| Story ID | Persona | Supporting implementation | Classification | Rationale | Recommended next action |
|---|---|---|---|---|---|
| P2-S01 | P2 — John | Appointment booking through REST/GraphQL | **Keep — provisional** | Booking supports the proposed online-request need, but the friend's actual need is unconfirmed. Approved affiliation and configured working hours are required; the frontend booking flow is incomplete. | Confirm the friend's role and need, then verify the booking flow against the running MVP. |
| P3-S01 | P3 — Eddy | Appointment lookup through REST/GraphQL | **Keep — provisional** | Participants can read current appointment status. The friend's need is unconfirmed; clinic confirmation functionality is absent, so lookup alone cannot deliver the full confirmation outcome. | Confirm the friend's role and need; review the missing confirmation workflow and frontend status display. |

These supporting implementations are descriptions, not a completed stable-ID feature inventory. Live browser flows were not verified for this revision. P1-S04 has partial Google backend support with browser integration still Backlog; P2-S01 and P3-S01 have provisional support, not validated user evidence.
