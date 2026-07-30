# Todo8 core flow evidence

- Unit invocation: `npm run test -- --run tests/unit/home-next-action.spec.tsx tests/unit/cards-workspace.spec.tsx`
  - Result: 4 tests passed.
  - Observable: failed drafts are the first home action; clean home shows a capture action; cards expose safe phone/email links and an empty-state reset.
- Component invocation: `npm run test:ct -- tests/ct/todo8-core.spec.tsx --project=chromium`
  - Result: 3 tests passed at 375, 768, and 1280 CSS px.
  - Observable: HomeView, CardsWorkspaceView, and AskView rendered with synthetic data; axe returned no violations and document scroll width stayed within viewport.
- Screenshot artifacts: `task-8-home-{375,768,1280}.png`, `task-8-cards-{375,768,1280}.png`, `task-8-ask-{375,768,1280}.png`.
- State/focus artifacts: `task-8-home-recovery-{375,768,1280}.png`, `task-8-cards-empty-{375,768,1280}.png`, `task-8-ask-error-{375,768,1280}.png`, and `task-8-ask-focus-{375,768,1280}.png`.
- Independent visual QA: Pass A and Pass B both PASS on fresh valid PNGs; CJK wrapping, full Ask shell, focus ring, touch targets, and overflow were inspected at all three widths.
- Full unit invocation: `npm run test -- --run tests/unit` — 29 files and 121 tests passed.
- Static gates: `npm run lint`, `npm run typecheck`, and `npm run build` all exited 0.

The fixtures contain synthetic contact values only. No auth, network, database, or server action was invoked by the component harness.

## Remediation evidence

- Detail component invocation: `npm run test:ct -- tests/ct/todo8-detail.spec.tsx --project=chromium`
  - Result: 3 tests passed at 375, 768, and 1280 CSS px.
  - Observable: `CardDetailView` normal, loading, error/not-found fallback, long/unbroken text, contact links, image-error alert, axe, viewport overflow, keyboard focus, and 200% zoom screenshots all completed.
  - Artifacts: `task-8-detail-{375,768,1280}.png` and `task-8-detail-200pct-{375,768,1280}.png`.
- Authenticated E2E invocation and test-list invocation were run through `scripts/run-local-production-e2e.mjs`. Both stopped at the explicit `credential_gate` because the required Clerk/dev-login environment variables were absent; see `task-8-e2e-credential-gate.json`. The suites contain real browser scenarios and do not bypass authentication.
- Independent visual receipts: `task-8-visual-pass-a.md` and `task-8-visual-pass-b.md` record PASS/HIGH reviews for all refreshed Home, Cards, Ask, focus, and detail PNGs with SHA-256 hashes.

## Todo8 owned-file manifest

Implementation ownership is limited to the following files; unrelated dirty worktree files were left untouched:

- `app/(tabs)/layout.tsx`
- `app/(tabs)/page.tsx`
- `app/(tabs)/cards/page.tsx`
- `app/(tabs)/cards/[id]/card-detail.tsx`
- `app/(tabs)/ask/page.tsx`
- `app/(tabs)/ask/ask-client.tsx`
- `components/bottom-nav.tsx`
- `tests/ct/todo8-core.spec.tsx`
- `tests/ct/todo8-detail.spec.tsx`
- `tests/e2e/home-cards-ask.spec.ts`
- `tests/e2e/home-cards-stress.spec.ts`
- `tests/unit/home-next-action.spec.tsx`
- `tests/unit/cards-workspace.spec.tsx`
- `.omo/evidence/business-card-priority-fixes/task-8-core-flow-report.md`
- `.omo/evidence/business-card-priority-fixes/task-8-e2e-credential-gate.json`
- `.omo/evidence/business-card-priority-fixes/task-8-visual-pass-a.md`
- `.omo/evidence/business-card-priority-fixes/task-8-visual-pass-b.md`

## Final remediation rerun

- `npm run test:ct -- tests/ct/todo8-core.spec.tsx tests/ct/todo8-detail.spec.tsx --project=chromium` — 6 tests passed.
- `npm run test -- --run tests/unit` — 29 files and 121 tests passed.
- `npm run lint` — exited 0.
- `npm run typecheck` — exited 0.
- `npm run build` — exited 0; Next.js production build generated all routes.
- Both authenticated E2E wrapper invocations exited 1 with the recorded `credential_gate`; no browser run was falsely reported as passing.

## Final visual freeze and stability

- Final CT screenshot run: `npm run test:ct -- tests/ct/todo8-core.spec.tsx tests/ct/todo8-detail.spec.tsx --project=chromium` — 6 passed; generated the frozen screenshot set at 2026-07-30T02:17:14+0900.
- Final independent visual receipts: `task-8-visual-pass-a-final.md` (PASS/HIGH, reviewed 02:17:27 KST) and `task-8-visual-pass-b-final.md` (PASS/HIGH, reviewed 02:17:31 KST).
- Hash equality verification: a fresh `shasum -a 256` over all 27 frozen PNGs compared byte-for-byte with Pass A’s recorded hashes and exited 0; no screenshot was regenerated after the receipts.
- Detail 200% dimensions: 375×7860, 768×7006, and 1280×4706 PNG pixels; the CT now checks `scrollWidth` after applying zoom and verifies complete phone/email values.
- Full unit stability after the final source change: `npm run test -- --run tests/unit` passed twice sequentially at 02:17:00 and 02:17:06 (29 files, 121 tests each, zero unhandled errors); see `task-8-unit-stability.json`.
- Canonical source attribution (path, mode, content SHA-256): `task-8-owned-source-manifest.json`.
