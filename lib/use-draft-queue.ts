"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resizeForUpload } from "@/lib/image";
import type { DraftRow } from "@/lib/drafts";

/** 업로드는 AI 를 안 쓰므로 몇 개 겹쳐도 된다. 폰 회선을 고려해 3 정도. */
const UPLOAD_CONCURRENCY = 3;

export interface DraftQueue {
  drafts: DraftRow[];
  /** 지금 AI 가 읽고 있는 draft id (동시성 1이라 최대 한 건) */
  analyzingId: string | null;
  /** 지금 웹에서 조사 중인 회사명 */
  enrichingCompany: string | null;
  /** 아직 서버에 올라가는 중인 사진 수 (행이 없어 drafts 에 안 나온다) */
  uploading: number;
  /** 처음 목록을 불러오는 중 */
  loading: boolean;
  /** 사용량 한도·인증 만료로 분석 루프가 멈춘 상태. 사유를 담는다. */
  stopped: string | null;
  error: string | null;
  add: (files: File[]) => Promise<void>;
  /** 버리기 — 행과 사진을 함께 지운다 */
  discard: (id: string) => Promise<void>;
  /** 실패한 건을 pending 으로 되돌리고 루프를 다시 돌린다 */
  retryFailed: () => void;
  /** 저장을 마친 draft 를 치운다 (이미지는 명함이 가져갔으므로 남긴다) */
  complete: (id: string) => Promise<void>;
}

/**
 * 명함 대기열 — 업로드와 AI 분석을 분리해서 돌린다.
 *
 * 사진을 담으면 곧바로 pending 행이 생기고, 워커가 뒤에서 한 장씩 분석한다.
 * 사용자는 분석을 기다리지 않고 계속 찍을 수 있다. 앱을 닫으면 워커도 멈추지만
 * 행은 서버에 남으므로 다시 열면 남은 것부터 이어서 한다.
 *
 * 분석 동시성은 **1** 이다. 구독 OAuth 에는 429 재시도 계층이 없어서
 * (claude.ts / codex.ts) 동시에 부르면 한도만 빨리 태운다.
 *
 * 목록의 진실은 `listRef` 다. 워커 루프가 await 사이사이에 다음 대상을 골라야
 * 하는데, 렌더를 기다리는 state 를 보면 방금 갱신한 건을 다시 집어 같은 사진을
 * 두 번 분석한다.
 */
export function useDraftQueue(): DraftQueue {
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [enrichingCompany, setEnrichingCompany] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stopped, setStopped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<DraftRow[]>([]);
  // 루프가 두 벌 도는 것을 막는다.
  const running = useRef(false);
  const stoppedRef = useRef(false);
  // 언마운트 후 setState 를 막는다.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** ref 를 먼저 갱신하고 화면을 따라오게 한다 (순서가 중요하다) */
  const publish = useCallback((next: DraftRow[]) => {
    listRef.current = next;
    if (alive.current) setDrafts(next);
  }, []);

  const upsert = useCallback(
    (row: DraftRow) => {
      const list = listRef.current;
      const exists = list.some((d) => d.id === row.id);
      publish(exists ? list.map((d) => (d.id === row.id ? row : d)) : [...list, row]);
    },
    [publish],
  );

  /** 실패한 회사는 confident=false 빈 제안으로 표시해 루프가 다시 집지 않게 한다. */
  const markEnrichFailed = useCallback(
    (company: string | null) => {
      publish(
        listRef.current.map((d) =>
          d.extracted?.company?.trim() === company?.trim()
            ? {
                ...d,
                enrich: {
                  industry: null,
                  capabilities: [],
                  summary: null,
                  confident: false,
                  sources: [],
                },
              }
            : d,
        ),
      );
    },
    [publish],
  );

  /**
   * 아직 회사 정보를 못 받은 draft 들을 **회사 단위로** 조사한다.
   *
   * 태그는 사람이 아니라 회사에 붙는 정보라 동료가 3명이어도 검색은 한 번이면
   * 된다. 서버가 같은 회사 draft 전체에 결과를 꽂아주므로, 여기서는 아직
   * enrich 가 비어 있는 draft 를 하나 집어 그 회사를 조사하기만 하면 된다.
   */
  const pumpEnrich = useCallback(async () => {
    for (;;) {
      if (!alive.current || stoppedRef.current) return;

      const next = listRef.current.find(
        (d) => d.status === "extracted" && !d.enrich && d.extracted?.company?.trim(),
      );
      if (!next) return;

      const card = next.extracted!;
      if (alive.current) setEnrichingCompany(card.company);

      try {
        const res = await fetch("/api/drafts/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: card.company,
            company_en: card.company_en,
            website: card.website,
            address: card.address,
            tax_code: card.tax_code,
          }),
        });
        const json = await res.json();

        if (res.ok) {
          // 서버가 같은 회사 draft 전체에 꽂았으므로 로컬도 같이 맞춘다.
          const suggestion = json.suggestion;
          publish(
            listRef.current.map((d) =>
              d.extracted?.company?.trim() === card.company?.trim()
                ? { ...d, enrich: suggestion }
                : d,
            ),
          );
          continue;
        }

        if (json.stopQueue) {
          stoppedRef.current = true;
          if (alive.current) setStopped(json.error ?? "회사 조사를 계속할 수 없습니다.");
          return;
        }
        // 이 회사만 실패 — 빈 제안을 넣어 무한 재시도를 막는다.
        markEnrichFailed(card.company);
      } catch {
        markEnrichFailed(card.company);
      } finally {
        if (alive.current) setEnrichingCompany(null);
      }
    }
  }, [publish, markEnrichFailed]);

  /** pending 이 없어질 때까지 한 건씩 분석한다. */
  const pump = useCallback(async () => {
    if (running.current || stoppedRef.current) return;
    running.current = true;

    try {
      while (alive.current && !stoppedRef.current) {
        const next = listRef.current.find((d) => d.status === "pending");
        if (!next) break;

        // listRef 는 동기로 갱신되므로 아래 upsert 뒤에는 이 건이 다시 안 잡힌다.
        // 화면에 "분석 중" 을 표시하기 위한 id 만 따로 둔다.
        if (alive.current) setAnalyzingId(next.id);

        try {
          const res = await fetch(`/api/drafts/${next.id}/extract`, { method: "POST" });
          const json = await res.json();

          if (res.ok) {
            upsert(json as DraftRow);
            continue;
          }

          upsert(
            (json.draft as DraftRow | null) ?? {
              ...next,
              status: "failed",
              error: json.error ?? "분석에 실패했습니다.",
            },
          );

          if (json.stopQueue) {
            stoppedRef.current = true;
            if (alive.current) setStopped(json.error ?? "분석을 계속할 수 없습니다.");
          }
        } catch {
          // 네트워크 오류 — 이 건만 실패로 두고 다음으로 넘어간다.
          upsert({ ...next, status: "failed", error: "네트워크 오류로 분석하지 못했습니다." });
        }
      }

      // 명함 읽기가 끝나야 회사 조사를 시작한다 — 검토를 여는 데 필요한 건
      // 명함 내용이고, 회사 조사는 있으면 좋은 정보라 우선순위가 낮다.
      await pumpEnrich();
    } finally {
      running.current = false;
      if (alive.current) setAnalyzingId(null);
    }
  }, [upsert, pumpEnrich]);

  // 진입 시 남은 대기열을 이어받는다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/drafts");
        if (!res.ok) return;
        const json = (await res.json()) as { drafts: DraftRow[] };
        if (cancelled) return;
        listRef.current = json.drafts;
        if (alive.current) setDrafts(json.drafts);
      } catch {
        // 목록을 못 불러와도 새로 담는 것은 되므로 조용히 넘어간다.
      } finally {
        if (!cancelled && alive.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 목록이 바뀔 때마다 워커를 깨운다. 이미 돌고 있으면 pump 가 알아서 빠진다.
  useEffect(() => {
    if (loading) return;
    void pump();
  }, [drafts, loading, pump]);

  const add = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError(null);
      setUploading((n) => n + files.length);

      const pending = [...files];
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, () =>
          (async () => {
            for (;;) {
              const file = pending.shift();
              if (!file) return;
              try {
                const resized = await resizeForUpload(file);
                const form = new FormData();
                form.append("image", resized);
                const res = await fetch("/api/drafts", { method: "POST", body: form });
                const json = await res.json();
                if (res.ok) upsert(json as DraftRow);
                else if (alive.current) setError(json.error ?? "사진을 담지 못했습니다.");
              } catch {
                if (alive.current) setError("사진을 담지 못했습니다.");
              } finally {
                if (alive.current) setUploading((n) => n - 1);
              }
            }
          })(),
        ),
      );
    },
    [upsert],
  );

  const remove = useCallback(
    async (id: string, keepImage: boolean) => {
      try {
        await fetch(`/api/drafts/${id}${keepImage ? "?keep_image=1" : ""}`, { method: "DELETE" });
      } catch {
        // 서버에서 못 지워도 화면에서는 치운다. 다음 진입 때 다시 보이면 그때 처리한다.
      }
      publish(listRef.current.filter((d) => d.id !== id));
    },
    [publish],
  );

  const discard = useCallback((id: string) => remove(id, false), [remove]);
  const complete = useCallback((id: string) => remove(id, true), [remove]);

  const retryFailed = useCallback(() => {
    stoppedRef.current = false;
    setStopped(null);
    publish(
      listRef.current.map((d) =>
        d.status === "failed" ? { ...d, status: "pending", error: null } : d,
      ),
    );
  }, [publish]);

  return {
    drafts,
    analyzingId,
    enrichingCompany,
    uploading,
    loading,
    stopped,
    error,
    add,
    discard,
    retryFailed,
    complete,
  };
}
