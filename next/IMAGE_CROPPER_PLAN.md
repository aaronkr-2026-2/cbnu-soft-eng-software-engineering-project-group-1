# Square photos and upload cropper — FI-07 / NEXT-B13

Date: November 5, 2026 (Asia/Seoul)
Status: Completed locally November5,2026; user handles commits/deployment.

## Agreed outcome and implementation choices

- Doctor and clinic card image regions use 1:1, including homepage and clinic previews.
- My Page's existing profile-photo selection opens a shared square crop dialog for
  every account type, using the inspected MediBridge react-easy-crop pattern.
- Drag/keyboard positioning, zoom, confirm and cancel; confirming changes only the
  draft. Save changes retains the existing authenticated upload/update sequence.
- Accept existing JPEG/PNG/WebP inputs up to10MB; decode failures stay in the dialog.
  Export JPEG at quality0.9, with a white background for transparency, maximum1024px
  square, without upscaling smaller crops. Check the output before accepting it.
- Cancel preserves the previous image draft and other profile fields. Upload/save
  failure preserves the confirmed crop for retry. Revoke temporary object URLs.
- Existing stored photos use centered cover within square cards; no migration or
  server enforcement of square dimensions. Existing ownership/validation stays in Nest.

## Delivery sequence

1. Add the crop helper/dialog and integrate selection into My Page; square card CSS.
2. Verify crop geometry/export failures, existing profile transport and build; inspect
   real browser cropping/cancel/failure/retry, keyboard/mobile and square cards.
3. Record actual results in architecture/sprint/logs and update roadmap status.

No role registration screens, backend image processing, deletion policy, image editor
features beyond crop/zoom, or application database changes are included.

Proposed manual commit: `feat(next): add square photo cropping and directory images`.

## Completion evidence

- Next typecheck,97 tests and final isolated no-fixture-URL production build pass.
- Backend fix separately authorized after normal main-process uploads exposed a
  ValidationPipe/Promise crash. Build/full TypeScript,12 upload HTTP tests using the
  production pipe and all222 API tests pass; lint has the existing config.ts warning.
- Browser desktop cropper/keyboard/cancel/focus/draft behavior,upload503 draft
  preservation,real clinic and doctor saves and375px mobile dialog inspected.
- Actual stored uploads are JPEG1024×1024 in clinic/member owner folders. Public
  clinic card displays the saved crop after the API-origin image URL fix.
- No production deployment,legacy-image rewrite or intended-storage acceptance.

Reference: [react-easy-crop documentation](https://github.com/ValentinH/react-easy-crop).
