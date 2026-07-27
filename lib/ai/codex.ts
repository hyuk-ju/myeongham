/**
 * Codex 백엔드 공통 호출부.
 *
 * ChatGPT 구독 OAuth 토큰으로 Codex 백엔드(Responses API 형식)를 호출한다.
 *   POST https://chatgpt.com/backend-api/codex/responses
 * 구 /backend-api/responses 경로는 2026-04 폐지됨 — /codex/ 경로를 쓸 것.
 *
 * 이 백엔드는 비공식 표면이라 응답 형식이 바뀔 수 있다. 필드 파싱은
 * 방어적으로 하고, 이 파일 밖으로 비공식 API 지식이 새지 않게 한다.
 */
import type { ActiveToken } from "@/lib/ai/token-store";

const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";
export const CODEX_MODEL = process.env.CODEX_MODEL || "gpt-5.5";

export type AIContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

/** SSE 텍스트 또는 JSON 백엔드 응답에서 최종 출력 텍스트를 방어적으로 추출한다. */
async function parseCodexResponseBody(res: Response): Promise<string> {
  const rawText = await res.text();
  const trimmed = rawText.trim();

  // 1. SSE 스트림 형식 처리 (Content-Type 헤더와 무관하게 data: 또는 event: 가 포함된 경우)
  if (trimmed.includes("data:") || trimmed.includes("event:")) {
    const lines = trimmed.split("\n");
    let text = "";
    let finalText: string | null = null;

    for (const line of lines) {
      const lineTrimmed = line.trim();
      if (!lineTrimmed.startsWith("data:")) continue;
      const payload = lineTrimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const event = JSON.parse(payload);
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (
          event.type === "response.output_text.done" &&
          typeof event.text === "string"
        ) {
          finalText = event.text;
        } else if (event.type === "response.completed" && event.response?.output) {
          const parts: string[] = [];
          for (const item of event.response.output) {
            for (const c of item?.content ?? []) {
              if (typeof c?.text === "string") parts.push(c.text);
            }
          }
          if (parts.length) finalText = parts.join("");
        }
      } catch {
        // 무시
      }
    }
    const result = finalText ?? text;
    if (result && result.trim()) return result;
  }

  // 2. 단일 JSON 응답 처리 시도
  try {
    const json = JSON.parse(trimmed);
    return extractTextFromJson(json);
  } catch {
    // 3. 순수 텍스트 응답일 경우 그대로 반환
    return trimmed;
  }
}

/** 비스트림 JSON 응답 대비 (백엔드 동작이 바뀔 수 있음) */
function extractTextFromJson(json: unknown): string {
  const j = json as { output?: Array<{ content?: Array<{ text?: string }> }>; output_text?: string };
  if (typeof j.output_text === "string") return j.output_text;
  const parts: string[] = [];
  for (const item of j.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  if (!parts.length) throw new Error("응답에서 출력 텍스트를 찾지 못했습니다.");
  return parts.join("");
}

/**
 * instructions + 사용자 콘텐츠(텍스트/이미지)를 보내고 모델 출력 텍스트를 반환한다.
 * 토큰 조회/갱신은 호출자(lib/ai/llm.ts)가 담당한다.
 */
export async function codexRequest(
  token: ActiveToken,
  instructions: string,
  content: AIContent[],
  model: string = CODEX_MODEL,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    originator: "codex_cli_rs",
  };
  if (token.accountId) headers["ChatGPT-Account-Id"] = token.accountId;

  const body = {
    model,
    store: false,
    stream: true,
    instructions,
    input: [{ role: "user", content }],
  };

  const res = await fetch(CODEX_RESPONSES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("ChatGPT 인증이 만료되었습니다. 설정에서 다시 연결하세요.");
    }
    if (res.status === 429) {
      throw new Error("구독 사용량 한도에 도달했습니다. 한도 리셋 후 다시 시도하세요.");
    }
    throw new Error(`AI 요청 실패 (${res.status}): ${text.slice(0, 300)}`);
  }

  return parseCodexResponseBody(res);
}

/** 모델 출력에서 JSON 객체 하나를 방어적으로 파싱한다 (코드펜스 등 제거). */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`모델 출력에서 JSON을 찾지 못했습니다: ${stripped.slice(0, 200)}`);
  }
  return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
}
