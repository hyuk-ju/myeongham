# Todo 11 integration proof — OAuth restoration refresh

Date: 2026-07-30
Scope: final local delivery after restoring ChatGPT OAuth/Codex company search as a non-official/experimental option.

## Delivered provider contract

Company enrichment preserves three choices: `openai-codex` (ChatGPT OAuth, explicitly non-official/experimental), `anthropic-claude` (OAuth), and `openai-api` (server-owned official Responses API). `provider: null` resolves to the active OAuth connection. The Codex path maps 401/403, 429, other non-OK and empty output to typed secret-free failures; enrichment additionally requires bounded strict JSON, a completed web search and at least one normalized HTTPS source. No path automatically falls back to another provider.

The migration permits all three provider values and preserves existing `openai-codex` rows. Settings UI and README/SETUP disclose the experimental risk, no-auto-fallback behavior, alternatives, and that separate API charges apply only to the official API choice.

## Deterministic local gates

| Scenario | Exact invocation | Observable |
| --- | --- | --- |
| OAuth focused unit | `npm test -- --run tests/unit/oauth-enrich-restoration.spec.ts tests/unit/oauth-company-search-fail-closed.spec.ts tests/unit/oauth-enrich-settings-ui.spec.tsx tests/unit/provider-routing.spec.ts tests/unit/enrich-routes.spec.ts` | 5 files / 17 tests PASS |
| Type safety | `npm run typecheck -- --pretty false` | PASS |
| Lint | `npm run lint` | PASS |
| Production build | `npm run build` | Next.js 16.2.12 PASS; 29 routes generated |
| Full component suite | `npm run test:ct -- --project=chromium` | 36/36 PASS |
| Final relevant CT | `npm run test:ct -- tests/ct/core-routes.spec.tsx tests/ct/adversarial-core-states.spec.tsx tests/ct/enrich-settings.spec.tsx --project=chromium` | 12/12 PASS; OAuth warning/no-auto-fallback assertions included |
| Independent reviews | separate OAuth security and provider-contract review sessions | both PASS; no findings |

The first full-unit attempt after CT correctly rejected the historical frozen evidence manifest because refreshed screenshots had different byte sizes. After refreshing task evidence, the complete unit suite is rerun; this is an evidence-freeze lifecycle condition, not a product assertion failure.

## Named external gates

| Gate | Result | Classification |
| --- | --- | --- |
| Authenticated production journey | `CLERK_TESTING_TOKEN` and `CLERK_FAPI` absent | `credential_gate` |
| OAuth live company search | authenticated OAuth session/local data-plane unavailable | `credential_gate` |
| Local DB/pgTAP/concurrency | Docker executable or daemon unavailable | `docker_gate` |
| Official OpenAI live smoke | `OPENAI_API_KEY` absent | `blocked_external` |
| Remote Supabase migration/smoke | no authorized linked-project mutation | `blocked_external` |

No remote migration, deployment, publish, staging, commit, or push was performed. The historical `baseline-final-seal.json` remains unchanged as the pre-OAuth baseline; a new `final-seal.json` binds the restored final state.
