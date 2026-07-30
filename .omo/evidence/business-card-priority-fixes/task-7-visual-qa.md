# Todo 7 scoped visual QA

Verdict: PASS for the auth, not-allowed, and primitive component-test surfaces.

## Evidence and method

- Fresh CT screenshots were captured by `npm run test:ct -- tests/ct/auth-not-allowed.spec.tsx tests/ct/primitives.spec.tsx --project=chromium` at CSS viewports 375, 768, and 1280.
- Fresh artifacts reviewed: `task-7-auth-{375,768,1280}.png`, `task-7-not-allowed-{375,768,1280}.png`, and `task-7-primitives-{375,768,1280}.png`.
- No safe pre-edit screenshot was included in the baseline manifest, so the current matrix was judged against `DESIGN.md` rather than an invented before/after pair.

## Findings

- PASS: 375px auth alert now keeps Korean words intact (`word-break: keep-all`) while allowing the `ALLOWED_EMAILS` token to wrap without horizontal overflow.
- PASS: 768px and 1280px auth surfaces remain centered, readable, and consistent with the paper/slip/cobalt contract.
- PASS: primitive showcase displays action default/hover/focus/disabled/loading, field error, progress, empty/loading/error/success states, and responsive desktop two-column layout.
- PASS: CT axe audits report zero violations for the production-styled auth and not-allowed fixtures.
- PASS: CT overflow checks report no document width overflow at all three viewports.
- PASS: CT primitive checks measure every rendered button at least 44px in both dimensions; reduced-motion spinner duration is effectively zero.
- PASS: no full account identifier appears in not-allowed DOM, clipboard payload, or captured synthetic artifacts.

## Production route gate

- `app/dev/primitives/page.tsx` and `app/dev/primitives/showcase.tsx` are absent; the showcase is imported only by CT tests.
- The owned production lifecycle probe for `/dev/primitives` was honestly recorded as `credential_gate` because Clerk identity inputs are absent. No production E2E pass is claimed.

No Critical or Major visual, accessibility, overflow, focus, or CJK wrapping findings remain in Todo 7 scope.
