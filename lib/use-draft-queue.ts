"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { resizeForUpload } from "@/lib/image";
import {
  createDraftQueueTransport,
  type DraftQueueTransport,
  type QueueResult,
} from "@/lib/draft-queue-transport";
import {
  createUploadResourceRegistry,
  initialDraftQueueState,
  releaseUploadResource,
  reduceDraftQueue,
  selectDraftQueueSnapshot,
} from "@/lib/draft-queue-state";
import type {
  DraftQueueActions,
  DraftQueueEvent,
  DraftQueueSnapshot,
  UploadResourceRegistry,
} from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";
import { parseDraftResponse } from "@/lib/http-contracts";

export type { DraftQueueActions, DraftQueueSnapshot, PendingUpload } from "@/lib/draft-queue-state";

export type DraftQueue = DraftQueueSnapshot & DraftQueueActions;

export function useDraftQueue(): DraftQueue {
  const [state, dispatch] = useReducer(reduceDraftQueue, initialDraftQueueState);
  const stateRef = useRef(state);
  const alive = useRef(true);
  const running = useRef(false);
  const enriching = useRef(false);
  const transportRef = useRef<DraftQueueTransport | null>(null);
  const registryRef = useRef<UploadResourceRegistry>(createUploadResourceRegistry());
  const activeExtractRef = useRef<{ readonly id: string; readonly controller: AbortController } | null>(null);
  if (transportRef.current === null) transportRef.current = createDraftQueueTransport();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const emit = useCallback((event: DraftQueueEvent) => {
    if (alive.current) dispatch(event);
  }, []);

  const refresh = useCallback(async () => {
    const result = await transportRef.current?.list();
    if (!alive.current || result === undefined) return;
    if (result.ok) emit({ type: "loaded", drafts: result.value });
    else emit({ type: "load_failed", code: result.code });
  }, [emit]);

  const revokeUpload = useCallback((localId: string) => {
    releaseUploadResource(registryRef.current, localId, URL.revokeObjectURL);
  }, []);

  const runUpload = useCallback(
    async (localId: string, file: File) => {
      const controller = new AbortController();
      registryRef.current.controllers.set(localId, controller);
      try {
        const resized = await resizeForUpload(file);
        const result = await transportRef.current?.upload(resized, controller.signal);
        if (!alive.current || result === undefined) return;
        if (result.ok) {
          emit({ type: "upload_succeeded", localId, draft: result.value });
          revokeUpload(localId);
        } else {
          emit({ type: "upload_failed", localId, code: result.code });
        }
      } catch {
        if (alive.current) emit({ type: "upload_failed", localId, code: "network_error" });
      }
    },
    [emit, revokeUpload],
  );

  const add = useCallback(
    async (files: readonly File[]) => {
      const jobs = files.map((file) => {
        const localId = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(file);
        registryRef.current.files.set(localId, file);
        registryRef.current.urls.set(localId, previewUrl);
        emit({
          type: "upload_started",
          upload: { localId, previewUrl, status: "uploading", errorCode: null },
        });
        return runUpload(localId, file);
      });
      await Promise.all(jobs);
    },
    [emit, runUpload],
  );

  const retryUpload = useCallback(
    async (localId: string) => {
      const registry = registryRef.current;
      const file = registry.files.get(localId);
      const previewUrl = registry.urls.get(localId);
      if (file === undefined || previewUrl === undefined) return;
      emit({ type: "upload_started", upload: { localId, previewUrl, status: "uploading", errorCode: null } });
      await runUpload(localId, file);
    },
    [emit, runUpload],
  );

  const discardUpload = useCallback(
    (localId: string) => {
      registryRef.current.controllers.get(localId)?.abort();
      revokeUpload(localId);
      emit({ type: "upload_discarded", localId });
    },
    [emit, revokeUpload],
  );

  const pump = useCallback(async () => {
    if (running.current || !alive.current || stateRef.current.loading || stateRef.current.stopCode) return;
    const next = stateRef.current.drafts.find((draft) => draft.status === "pending");
    if (next === undefined) return;
    running.current = true;
    const controller = new AbortController();
    activeExtractRef.current = { id: next.id, controller };
    emit({ type: "analysis_started", id: next.id });
    try {
      const result = await transportRef.current?.extract(next.id, controller.signal);
      if (alive.current && result !== undefined) {
        if (controller.signal.aborted) await refresh();
        else await reconcileExtraction(next, result, refresh, emit);
        emit({ type: "analysis_finished", id: null });
      }
    } finally {
      activeExtractRef.current = null;
      running.current = false;
    }
  }, [emit, refresh]);

  const retry = useCallback(
    async (id: string) => {
      const draft = stateRef.current.drafts.find((candidate) => candidate.id === id);
      if (draft?.status !== "failed") return;
      emit({ type: "draft_upserted", draft: { ...draft, status: "pending", error: null } });
      await Promise.resolve();
    },
    [emit],
  );

  const retryFailed = useCallback(async () => {
    for (const draft of stateRef.current.drafts) {
      if (draft.status === "failed") emit({ type: "draft_upserted", draft: { ...draft, status: "pending", error: null } });
    }
    await Promise.resolve();
  }, [emit]);

  const discard = useCallback(
    async (id: string) => {
      if (activeExtractRef.current?.id === id) activeExtractRef.current.controller.abort();
      const result = await transportRef.current?.discard(id);
      if (!alive.current || result === undefined) return;
      if (result.ok) emit({ type: "draft_removed", id });
      else emit({ type: "error", code: result.code });
    },
    [emit],
  );

  const acknowledgeFinalized = useCallback(
    async (id: string, cardId: string) => {
      if (!cardId.trim()) {
        emit({ type: "error", code: "invalid_response" });
        return;
      }
      emit({ type: "draft_removed", id });
      await refresh();
    },
    [emit, refresh],
  );

  const pumpEnrich = useCallback(async () => {
    if (enriching.current || running.current || !alive.current || stateRef.current.loading) return;
    const next = stateRef.current.drafts.find(
      (draft) => draft.status === "extracted" && draft.enrich === null && draft.extracted?.company?.trim(),
    );
    if (next === undefined || next.extracted?.company === null || next.extracted?.company === undefined) return;
    enriching.current = true;
    emit({ type: "enrich_started", company: next.extracted.company });
    try {
      const response = await fetch("/api/drafts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: next.extracted.company, company_en: next.extracted.company_en }),
      });
      const value: unknown = await response.json();
      const record = asRecord(value);
      const suggestion = record?.suggestion;
      if (response.ok && suggestion !== undefined) {
        const parsed = parseDraftResponse({ ...next, enrich: suggestion });
        if (parsed.ok) emit({ type: "draft_upserted", draft: parsed.value });
      }
    } catch {
      emit({ type: "error", code: "network_error" });
    } finally {
      enriching.current = false;
      emit({ type: "enrich_finished" });
    }
  }, [emit]);

  useEffect(() => {
    void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onOnline = () => void refresh();
    const registry = registryRef.current;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      alive.current = false;
      activeExtractRef.current?.controller.abort();
      for (const controller of registry.controllers.values()) controller.abort();
      for (const localId of [...registry.urls.keys()]) revokeUpload(localId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, revokeUpload]);

  useEffect(() => {
    void pump();
    void pumpEnrich();
  }, [pump, pumpEnrich, state.drafts, state.loading, state.stopCode]);

  return {
    ...selectDraftQueueSnapshot(state),
    add,
    retryUpload,
    discardUpload,
    refresh,
    retry,
    retryFailed,
    discard,
    acknowledgeFinalized,
  };
}

async function reconcileExtraction(
  previous: DraftRow,
  result: QueueResult<DraftRow>,
  refresh: () => Promise<void>,
  emit: (event: DraftQueueEvent) => void,
): Promise<void> {
  if (result.ok) {
    emit({ type: "draft_upserted", draft: result.value });
    return;
  }
  if (result.code === "busy" || result.code === "stale_token") {
    await refresh();
    return;
  }
  if (result.draft !== undefined) {
    emit({ type: "draft_upserted", draft: result.draft });
  } else {
    emit({ type: "draft_upserted", draft: { ...previous, status: "failed", error: result.code } });
  }
  if (result.stopCode !== undefined) emit({ type: "stop", code: result.stopCode });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
