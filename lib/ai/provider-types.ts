export const OAUTH_AI_PROVIDERS = ["openai-codex", "anthropic-claude"] as const;
export const ENRICH_PROVIDERS = ["openai-codex", "anthropic-claude", "openai-api"] as const;

export type OAuthAIProvider = (typeof OAUTH_AI_PROVIDERS)[number];
export type EnrichProvider = (typeof ENRICH_PROVIDERS)[number];

export class ProviderAuthError extends Error {
  readonly code = "auth_expired" as const;
  readonly status = 401 as const;
  readonly retryable = false as const;

  constructor() {
    super("auth_expired");
    this.name = "ProviderAuthError";
  }
}
