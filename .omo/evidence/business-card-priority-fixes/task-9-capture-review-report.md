# Todo9 capture/review evidence

## Pure view and unit scenarios

- `npm run test -- --run tests/unit/capture-batch.spec.tsx tests/unit/review-layout.spec.tsx` passed 4 tests: empty capture entry, mixed upload/draft lifecycle with retry, loading review announcement, and extracted review with grouped verification fields.
- `npm run test -- --run tests/unit/card-finalize-route.spec.ts tests/unit/failed-draft-review.spec.tsx` passed 7 existing finalization/recovery assertions, including preserved image and unsaved edits after an ambiguous save response.
- `npm run typecheck` passed; owned ESLint invocation passed without warnings.

## Browser component matrix

- `npm run test:ct -- tests/ct/capture-review.spec.tsx --project=chromium` passed at 375, 768, and 1280 CSS pixels. The test mounts real Todo1 `valid-jpeg.jpg` and `valid-png.png` as data URLs, checks thumbnail/original image visibility and crop surfaces, loading/empty/error/failed-manual/success/long-CJK states, footer geometry, focus reachability, zero horizontal overflow, and zero axe violations. A separate 200% zoom focus scenario also passes and writes:
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-375.png`
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-768.png`
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-1280.png`
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-review-375.png`
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-review-768.png`
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-review-1280.png`
  - `.omo/evidence/business-card-priority-fixes/task-9-capture-review-200pct.png`
  - The review matrix also asserts the 44px centered duplicate “열기” target and `white-space: nowrap` geometry for “전부 지우기” at mobile and zoomed widths.

- Authenticated journeys are executable through the existing production lifecycle and remain credential-gated without bypass: `tests/e2e/capture-review-journey.spec.ts` covers real JPEG upload, review/original image, manual edit, and save; `tests/e2e/capture-review-recovery.spec.ts` covers spoofed-image rejection, interrupted busy claim, provider failure, retry, finalize failure, retained edits/image, and retry save.
- E2E invocation `npm run test:e2e -- tests/e2e/capture-review-journey.spec.ts tests/e2e/capture-review-recovery.spec.ts --project=chromium` returned the owned lifecycle receipt `{"status":"blocked","gate":"credential_gate"}` because the six Clerk identity inputs were absent; no auth bypass or fabricated pass was used.

The CT run is auth-independent and does not bypass credential-gated production E2E. The original image is synthetic and contains no account/card data.
