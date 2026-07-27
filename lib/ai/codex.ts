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

/** SSE 스트림에서 출력 텍스트를 긁어모은다. */
async function readSse(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("응답 본문이 비어 있습니다.");
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finalText: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
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
          // 최종 이벤트에서 전체 출력을 복원 (delta 누락 대비)
          const parts: string[] = [];
          for (const item of event.response.output) {
            for (const c of item?.content ?? []) {
              if (typeof c?.text === "string") parts.push(c.text);
            }
          }
          if (parts.length) finalText = parts.join("");
        }
      } catch {
        // 파싱 불가 이벤트는 무시
      }
    }
  }
  return finalText ?? text;
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

  const contentType = res.headers.get("content-type") ?? "";
  return contentType.includes("text/event-stream")
    ? readSse(res)
    : extractTextFromJson(await res.json());
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
