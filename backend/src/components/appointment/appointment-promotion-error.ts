// Internal control flow only; these errors are never returned by an API route.
export class PromotionIneligible extends Error {
  constructor(
    readonly reason:
      | 'PATIENT_INACTIVE'
      | 'INVALID_CONSENT'
      | 'DOCTOR_OR_SCHEDULE'
      | 'COMMITMENT_CONFLICT'
      | 'PATIENT_OVERLAP',
  ) {
    super(reason);
  }
}
export class PromotionCutoff extends Error {}
