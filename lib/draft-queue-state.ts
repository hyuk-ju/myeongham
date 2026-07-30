import type { DraftRow } from "@/lib/drafts";

export type PendingUpload = {
  readonly localId: string;
  readonly previewUrl: string;
  readonly status: "uploading" | "failed";
  readonly errorCode: string | null;
};

export type DraftQueueSnapshot = {
  readonly drafts: readonly DraftRow[];
  readonly uploads: readonly PendingUpload[];
  readonly uploading: number;
  readonly loading: boolean;
  readonly analyzingId: string | null;
  readonly enrichingCompany: string | null;
  readonly errorCode: string | null;
  readonly stopCode: string | null;
  readonly ready: readonly DraftRow[];
  readonly failed: readonly DraftRow[];
  readonly waiting: readonly DraftRow[];
  readonly processing: readonly DraftRow[];
};

export type DraftQueueActions = {
  readonly add: (files: readonly File[]) => Promise<void>;
  readonly retryUpload: (localId: string) => Promise<void>;
  readonly discardUpload: (localId: string) => void;
  readonly refresh: () => Promise<void>;
  readonly retry: (id: string) => Promise<void>;
  readonly retryFailed: () => Promise<void>;
  readonly discard: (id: string) => Promise<void>;
  readonly acknowledgeFinalized: (id: string, cardId: string) => Promise<void>;
};

export type UploadResourceRegistry = {
  readonly files: Map<string, File>;
  readonly urls: Map<string, string>;
  readonly controllers: Map<string, AbortController>;
};

export function createUploadResourceRegistry(): UploadResourceRegistry {
  return { files: new Map(), urls: new Map(), controllers: new Map() };
}

export function releaseUploadResource(
  registry: UploadResourceRegistry,
  localId: string,
  revoke: (url: string) => void,
): void {
  const url = registry.urls.get(localId);
  if (url !== undefined) revoke(url);
  registry.urls.delete(localId);
  registry.files.delete(localId);
  registry.controllers.delete(localId);
}

export type DraftQueueState = {
  readonly drafts: readonly DraftRow[];
  readonly uploads: readonly PendingUpload[];
  readonly loading: boolean;
  readonly analyzingId: string | null;
  readonly enrichingCompany: string | null;
  readonly errorCode: string | null;
  readonly stopCode: string | null;
};

export type DraftQueueEvent =
  | { readonly type: "loaded"; readonly drafts: readonly DraftRow[] }
  | { readonly type: "load_failed"; readonly code: string }
  | { readonly type: "upload_started"; readonly upload: PendingUpload }
  | { readonly type: "upload_failed"; readonly localId: string; readonly code: string }
  | { readonly type: "upload_succeeded"; readonly localId: string; readonly draft: DraftRow }
  | { readonly type: "upload_discarded"; readonly localId: string }
  | { readonly type: "draft_upserted"; readonly draft: DraftRow }
  | { readonly type: "draft_removed"; readonly id: string }
  | { readonly type: "analysis_started"; readonly id: string }
  | { readonly type: "analysis_finished"; readonly id: string | null }
  | { readonly type: "enrich_started"; readonly company: string }
  | { readonly type: "enrich_finished" }
  | { readonly type: "error"; readonly code: string }
  | { readonly type: "stop"; readonly code: string }
  | { readonly type: "resume" };

export const initialDraftQueueState: DraftQueueState = {
  drafts: [],
  uploads: [],
  loading: true,
  analyzingId: null,
  enrichingCompany: null,
  errorCode: null,
  stopCode: null,
};

export function reduceDraftQueue(
  state: DraftQueueState,
  event: DraftQueueEvent,
): DraftQueueState {
  switch (event.type) {
    case "loaded":
      return { ...state, drafts: [...event.drafts], loading: false, errorCode: null };
    case "load_failed":
      return { ...state, loading: false, errorCode: event.code };
    case "upload_started":
      return {
        ...state,
        uploads: [...state.uploads.filter((upload) => upload.localId !== event.upload.localId), event.upload],
        errorCode: null,
      };
    case "upload_failed":
      return {
        ...state,
        uploads: state.uploads.map((upload) =>
          upload.localId === event.localId
            ? { ...upload, status: "failed", errorCode: event.code }
            : upload,
        ),
        errorCode: event.code,
      };
    case "upload_succeeded":
      return {
        ...state,
        uploads: state.uploads.filter((upload) => upload.localId !== event.localId),
        drafts: upsert(state.drafts, event.draft),
        errorCode: null,
      };
    case "upload_discarded":
      return { ...state, uploads: state.uploads.filter((upload) => upload.localId !== event.localId) };
    case "draft_upserted":
      return { ...state, drafts: upsert(state.drafts, event.draft), errorCode: null };
    case "draft_removed":
      return { ...state, drafts: state.drafts.filter((draft) => draft.id !== event.id) };
    case "analysis_started":
      return { ...state, analyzingId: event.id, errorCode: null };
    case "analysis_finished":
      return { ...state, analyzingId: event.id };
    case "enrich_started":
      return { ...state, enrichingCompany: event.company };
    case "enrich_finished":
      return { ...state, enrichingCompany: null };
    case "error":
      return { ...state, errorCode: event.code };
    case "stop":
      return { ...state, stopCode: event.code };
    case "resume":
      return { ...state, stopCode: null, errorCode: null };
    default:
      return assertNever(event);
  }
}

export function selectDraftQueueSnapshot(state: DraftQueueState): DraftQueueSnapshot {
  const ready = state.drafts.filter((draft) => draft.status === "extracted");
  const failed = state.drafts.filter((draft) => draft.status === "failed");
  const waiting = state.drafts.filter((draft) => draft.status === "pending");
  const processing = state.drafts.filter((draft) => draft.status === "processing");
  return {
    drafts: state.drafts,
    uploads: state.uploads,
    uploading: state.uploads.filter((upload) => upload.status === "uploading").length,
    loading: state.loading,
    analyzingId: state.analyzingId,
    enrichingCompany: state.enrichingCompany,
    errorCode: state.errorCode,
    stopCode: state.stopCode,
    ready,
    failed,
    waiting,
    processing,
  };
}

function upsert(drafts: readonly DraftRow[], draft: DraftRow): readonly DraftRow[] {
  const existing = drafts.some((candidate) => candidate.id === draft.id);
  return existing
    ? drafts.map((candidate) => (candidate.id === draft.id ? draft : candidate))
    : [...drafts, draft];
}

function assertNever(value: never): never {
  throw new Error(`unexpected queue event: ${JSON.stringify(value)}`);
}
