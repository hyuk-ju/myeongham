/**
 * Claude 구독 OAuth 토큰으로 Anthropic Messages API 를 호출한다.
 *
 * 구독 OAuth(user:inference) 토큰은 Claude Code 클라이언트로 발급되므로
 * 요청도 Claude Code 형태를 따라야 한다:
 *   - anthropic-beta: oauth-2025-04-20 헤더
 *   - system 첫 블록이 Claude Code 식별 문구
 */
import type { ActiveToken } from "@/lib/ai/token-store";
import type { AIContent, WebSearchOutcome } from "@/lib/ai/codex";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";

type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function toClaudeBlock(c: AIContent): ClaudeBlock {
  if (c.type === "input_text") return { type: "text", text: c.text };

  const match = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(c.image_url);
  if (!match) throw new Error("이미지 데이터 URL 형식이 올바르지 않습니다.");
  return {
    type: "image",
    source: { type: "base64", media_type: match[1], data: match[2] },
  };
}

interface ClaudeMessage {
  content?: Array<{ type?: string; text?: string; [k: string]: unknown }>;
  stop_reason?: string;
}

/** 공통 호출부. tools 를 넘기면 서버 도구(웹 검색 등)를 쓸 수 있다. */
async function postMessages(
  token: ActiveToken,
  body: Record<string, unknown>,
): Promise<ClaudeMessage> {
  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("Claude 인증이 만료되었습니다. 설정에서 다시 연결하세요.");
    }
    if (res.status === 429) {
      throw new Error("Claude 구독 사용량 한도에 도달했습니다. 한도 리셋 후 다시 시도하세요.");
    }
    throw new Error(`AI 요청 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as ClaudeMessage;
}

function textOf(message: ClaudeMessage): string {
  const parts = (message.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  if (!parts.length) throw new Error("Claude 응답에서 출력 텍스트를 찾지 못했습니다.");
  return parts.join("");
}

export async function claudeRequest(
  token: ActiveToken,
  instructions: string,
  content: AIContent[],
  model: string = CLAUDE_MODEL,
): Promise<string> {
  const json = await postMessages(token, {
    model,
    max_tokens: 8192,
    system: [
      { type: "text", text: CLAUDE_CODE_IDENTITY },
      { type: "text", text: instructions },
    ],
    messages: [{ role: "user", content: content.map(toClaudeBlock) }],
  });
  return textOf(json);
}

// WebSearchOutcome 은 Codex 쪽과 같은 모양이라 codex.ts 에 두고 함께 쓴다
// (AIContent 도 같은 이유로 그쪽에 있다).
export type { WebSearchOutcome } from "@/lib/ai/codex";

/**
 * 웹 검색 서버 도구를 붙여 호출한다 (회사 정보 보강용).
 *
 * **기본(`_20250305`) 버전을 쓴다.** 신형 `web_search_20260209` 는 결과를
 * 걸러내기 위해 내부적으로 코드 실행을 돌리는데, 구독 OAuth 토큰에는 코드 실행
 * 쿼터가 없어 전부 `too_many_requests` 로 실패한다 (2026-07 실측). 기본 버전은
 * 코드 실행을 쓰지 않아 구독 토큰으로도 동작한다.
 *
 * 서버 도구는 Anthropic 인프라에서 실행되므로 우리가 실행할 게 없다. 다만
 * 서버측 루프가 10회를 넘기면 stop_reason=pause_turn 으로 끊기므로,
 * 그때는 지금까지의 대화를 그대로 되돌려보내 이어가게 한다.
 */
export async function claudeWebSearch(
  token: ActiveToken,
  instructions: string,
  prompt: string,
  model: string = CLAUDE_MODEL,
  maxUses = 5,
): Promise<WebSearchOutcome> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: [{ type: "text", text: prompt }] },
  ];
  const sources = new Set<string>();
  let last: ClaudeMessage | null = null;
  let searched = false;
  let searchError: string | null = null;

  // pause_turn 재개 한도 — 무한 루프 방지
  for (let attempt = 0; attempt < 4; attempt++) {
    const json = await postMessages(token, {
      model,
      max_tokens: 8192,
      system: [
        { type: "text", text: CLAUDE_CODE_IDENTITY },
        { type: "text", text: instructions },
      ],
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }],
    });
    last = json;
    const outcome = collectSources(json, sources);
    if (outcome.ok) searched = true;
    if (outcome.error) searchError = outcome.error;

    if (json.stop_reason !== "pause_turn") break;
    // 서버 도구 루프가 멈춘 지점부터 재개 (추가 user 메시지를 넣지 않는다)
    messages.push({ role: "assistant", content: json.content ?? [] });
  }

  if (!last) throw new Error("Claude 응답이 비어 있습니다.");
  return { text: textOf(last), sources: [...sources], searched, searchError };
}

/**
 * web_search_tool_result 블록에서 출처 URL 을 모으고 오류를 잡아낸다.
 * 성공이면 content 가 배열, 실패면 { error_code } 객체다.
 */
function collectSources(
  message: ClaudeMessage,
  into: Set<string>,
): { ok: boolean; error: string | null } {
  let ok = false;
  let error: string | null = null;

  for (const block of message.content ?? []) {
    if (!block.type?.endsWith("tool_result")) continue;
    const content = (block as { content?: unknown }).content;

    if (Array.isArray(content)) {
      for (const item of content) {
        const url = (item as { url?: unknown }).url;
        if (typeof url === "string" && url) {
          into.add(url);
          ok = true;
        }
      }
    } else if (content && typeof content === "object") {
      const code = (content as { error_code?: unknown }).error_code;
      if (typeof code === "string") error = code;
    }
  }
  return { ok, error };
}
