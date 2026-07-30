import type { DraftRow } from "@/lib/drafts";
import { parseDraftListResponse, parseDraftResponse } from "@/lib/http-contracts";

export type QueueErrorCode =
  | "busy"
  | "stale_token"
  | "unauthorized"
  | "not_found"
  | "invalid_input"
  | "invalid_response"
  | "unsupported_media"
  | "payload_too_large"
  | "network_error"
  | "provider_error";

export type QueueResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: QueueErrorCode;
      readonly draft?: DraftRow;
      readonly stopCode?: string;
    };

export type DraftQueueTransport = {
  readonly list: () => Promise<QueueResult<readonly DraftRow[]>>;
  readonly upload: (file: File, signal?: AbortSignal) => Promise<QueueResult<DraftRow>>;
  readonly extract: (id: string, signal?: AbortSignal) => Promise<QueueResult<DraftRow>>;
  readonly discard: (id: string, signal?: AbortSignal) => Promise<QueueResult<null>>;
};

type Fetcher = typeof fetch;

export function createDraftQueueTransport(fetcher: Fetcher = fetch): DraftQueueTransport {
  return {
    list: async () => {
      try {
        const response = await fetcher("/api/drafts", { method: "GET" });
        const parsed = parseDraftListResponse(await response.json());
        return response.ok && parsed.ok
          ? { ok: true, value: parsed.value }
          : { ok: false, code: responseError(response.status) };
      } catch {
        return { ok: false, code: "network_error" };
      }
    },
    upload: async (file, signal) => {
      try {
        const form = new FormData();
        form.set("image", file);
        const response = await fetcher("/api/drafts", { method: "POST", body: form, signal });
        const parsed = parseDraftResponse(await response.json());
        return response.ok && parsed.ok
          ? { ok: true, value: parsed.value }
          : { ok: false, code: responseError(response.status) };
      } catch {
        return { ok: false, code: "network_error" };
      }
    },
    extract: async (id, signal) => {
      try {
        const response = await fetcher(`/api/drafts/${id}/extract`, {
          method: "POST",
          signal,
        });
        const value: unknown = await response.json();
        const record = asRecord(value);
        const draft = record?.draft;
        const parsedDraft = draft === undefined ? null : parseDraftResponse(draft);
        if (response.ok) {
          const parsed = parseDraftResponse(value);
          return parsed.ok
            ? { ok: true, value: parsed.value }
            : { ok: false, code: "invalid_response" };
        }
        return {
          ok: false,
          code: responseError(response.status, record?.code),
          ...(parsedDraft?.ok ? { draft: parsedDraft.value } : {}),
          ...(record?.stopQueue === true
            ? { stopCode: typeof record.error === "string" ? record.error : "provider_error" }
            : {}),
        };
      } catch {
        return { ok: false, code: "network_error" };
      }
    },
    discard: async (id, signal) => {
      try {
        const response = await fetcher(`/api/drafts/${id}`, { method: "DELETE", signal });
        return response.ok
          ? { ok: true, value: null }
          : { ok: false, code: responseError(response.status) };
      } catch {
        return { ok: false, code: "network_error" };
      }
    },
  };
}

function responseError(status: number, bodyCode?: unknown): QueueErrorCode {
  if (bodyCode === "busy" || bodyCode === "stale_token") return bodyCode;
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 413) return "payload_too_large";
  if (status === 415) return "unsupported_media";
  if (status >= 500) return "provider_error";
  return "invalid_response";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
