# Todo 10 enrichment and settings evidence

Date: 2026-07-30

## Implemented surface

- `EnrichView` is a pure typed render surface with n/total progress, status filters, stop/resume, retry-failed-only, confidence and source-count provenance, keyboard source links, and untouched waiting rows after stop.
- `EnrichView` keeps Korean title words and short status badges intact (`word-break: keep-all`, no-break badges that move within wrapping layouts); source titles use word-aware wrapping so `URL을` is not split arbitrarily.
- `EnrichPanel` accepts source objects, never auto-applies confident tags, reports stable machine error codes, and now uses shared 44px actions/chips, live busy/error semantics, keyboard-reachable `출처 n건 보기`, and visible but restrained focus treatment.
- `SettingsView` separates OAuth account connections from server-owned OpenAI API availability and billing; provider account identifiers are masked, token expiry has severity, OAuth paste fields disable autocomplete, and disconnect uses inline confirmation.
- `ModelPicker` offers ChatGPT OAuth/Codex, Claude OAuth, and server-owned official OpenAI API for company enrichment. ChatGPT OAuth is labeled `비공식·실험`, warns that it may stop without notice, and states that failures never auto-switch providers. `provider: null` keeps active-OAuth semantics; official API models remain server-owned.
- CT mounts the real `ConnectAI`, `ModelPicker`, and synthetic masked account controls at 375/768/1280px. It exercises paste and inline disconnect-confirm states, checks every action is at least 44px, audits axe, and records screenshots for both states. The 768px EnrichView fixture includes loading/running, empty, provider-stop error, and applied success states at 200% zoom, checks no horizontal overflow, and asserts keep-all/no-break CSS.

## Verification

| Scenario | Invocation | Observable | Artifact |
| --- | --- | --- | --- |
| Unit enrichment/settings workflow | `npm run test -- --run tests/unit/enrich-workflow.spec.tsx tests/unit/settings-provider-status.spec.tsx` | 2 files, 4 tests passed; retry/status semantics, source disclosure, no silent apply, inline confirmation, and no-break badge assertion | this report + source specs |
| EnrichView/Panel CT 375px | `npm run test:ct -- tests/ct/enrich-settings.spec.tsx --project=chromium` | keyboard source disclosure, shared action/chip targets, live states, and axe pass | [task-10-enrich-settings-375.png](task-10-enrich-settings-375.png), [task-10-enrich-panel-375.png](task-10-enrich-panel-375.png) |
| Real settings CT 375/768/1280px | same CT invocation | 3 tests passed; real ConnectAI + ModelPicker + masked account controls, all action heights ≥44px, paste state, inline disconnect confirmation, no key material, axe pass | [task-10-settings-375.png](task-10-settings-375.png), [task-10-settings-375-disconnect.png](task-10-settings-375-disconnect.png), [task-10-settings-768.png](task-10-settings-768.png), [task-10-settings-768-disconnect.png](task-10-settings-768-disconnect.png), [task-10-settings-1280.png](task-10-settings-1280.png), [task-10-settings-1280-disconnect.png](task-10-settings-1280-disconnect.png) |
| EnrichView 768px / 200% state matrix | same CT invocation | loading, empty, error, success, long text, no horizontal overflow, `keep-all` title and no-break status CSS, axe pass | [task-10-enrich-settings-768.png](task-10-enrich-settings-768.png) |

Fresh CT result: 6 tests passed; axe assertions passed for EnrichView, EnrichPanel, and all three real settings widths.
| Lint | `npm run lint` | ESLint exit 0 | command receipt |
| Typecheck | `npm run typecheck -- --pretty false` | exit 0, including nullable enrich provider propagation | command receipt |
| Production build | `npm run build` | Next.js 16 production build and TypeScript pass | command receipt |
| OAuth disclosure CT | `npm run test:ct -- tests/ct/enrich-settings.spec.tsx --project=chromium` | 6/6 pass; `비공식·실험` and no-auto-fallback copy visible | screenshots + command output |

Screens are sanitized synthetic fixtures only; they contain no credentials, tokens, full IDs, or card PII.

## Responsive desktop composition refresh

The final responsive pass keeps the existing 375/768 single-column flow and applies desktop composition only at `lg`/`xl`: OAuth occupies the primary 8/12 area, server API and account become a 4/12 summary rail, and the three task model cards form a full-width comparison row. Cards, capture, enrich, and ask similarly use main/aside layouts only on desktop. Full CT passed 36/36 across 375/768/1280 including axe, 200% zoom, focus and overflow checks. A real local browser measured Settings `main` as 1280px with 12 grid columns at viewport 1280 and 375px with one column at viewport 375.
