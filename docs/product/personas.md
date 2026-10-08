# Personas, scenarios, and user stories

This version uses three personas with one scenario and one story each, as requested. Alex represents me; the other two represent my friends. My friends are John and Eddy, with “my friend” as their requested alias. Their ages, backgrounds, roles, and actual needs have not yet been supplied. Patient roles and the friends' scenarios below are provisional examples, not interview findings.

## P1 — Alex — Primary persona

**Personal:** Alex is my alias as the creator of MedConnect. My age and relevant circumstances remain to be documented.

**Job:** I am creating MedConnect; my daily responsibilities as a healthcare user remain unconfirmed.

**Education:** My background, technical confidence, and healthcare experience remain to be documented.

**Relevance:** I want MedConnect to support sign-in through an existing external account. Avoiding another password is a proposed benefit, not yet confirmed as my motivation.

**Grounding:** Based on me, the creator of MedConnect, using “Alex” as an alias.

### Scenario

Alex opens MedConnect before arranging a clinic visit and wants to sign in through an existing external account. Only email/password authentication is currently implemented, so this sign-in path is unavailable. Alex wants to reach an authenticated MedConnect session through a supported provider. The OAuth requirement is confirmed; the clinic-visit context and provider choice remain provisional.

### User story

- **P1-S04:** As a patient accessing MedConnect before booking, I want to sign in with an existing external account so that I do not need to remember another password.

## P2 — John — Secondary persona

**Personal:** John, using “my friend” as an alias. Age and relevant circumstances are pending.

**Job:** Daily activities and responsibilities are pending.

**Education:** Background, technical confidence, and healthcare experience are pending.

**Relevance:** Proposed need: book a clinic visit online when calling during opening hours is inconvenient. This need and the patient role require confirmation.

**Grounding:** Based on my friend John, as confirmed by me. His role, circumstances, and needs remain to be supplied.

### Scenario

*Provisional example.* John needs to arrange a clinic visit but cannot conveniently call during opening hours. After identifying a suitable appointment time, they want to submit a booking online. Their desired outcome is a recorded booking request; this does not mean the clinic has confirmed the appointment.

### User story

- **P2-S01:** As a patient arranging a clinic visit, I want to book an available appointment online so that I can request a visit without calling during clinic opening hours.

## P3 — Eddy — Secondary persona

**Personal:** Eddy, using “my friend” as an alias. Age and relevant circumstances are pending.

**Job:** Daily activities and responsibilities are pending.

**Education:** Background, technical confidence, and healthcare experience are pending.

**Relevance:** Proposed need: check a booking's status before traveling to the clinic. This need and the patient role require confirmation.

**Grounding:** Based on my friend Eddy, as confirmed by me. His role, circumstances, and needs remain to be supplied.

### Scenario

*Provisional example.* Eddy has submitted an appointment request and is preparing to travel to the clinic. They do not know whether the appointment is still pending or has been confirmed. They want to check its current status before making the trip.

### User story

- **P3-S01:** As a patient who has submitted a booking, I want to check my appointment's status so that I know whether the clinic has confirmed my visit before I travel.

## Scope and ID continuity

There are three active stories, one per persona, following the latest request. The previous 8–12-story target does not apply to this version. See the [gap map](gap-map.md).

P1-S04 retains its OAuth identity. The former provisional P1-S02 and P1-S03 are superseded by P2-S01 and P3-S01 to match the new persona assignments. P1-S01 (available-time discovery) is deferred from this version; its ID is reserved and must not be reused. The friends' roles, backgrounds, and needs still need confirmation.
