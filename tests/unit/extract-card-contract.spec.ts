// @vitest-environment node

/**
 * 추출 결과는 DB 에 들어가기 전에 응답 계약을 통과해야 한다.
 *
 * 실제로 터진 사고: 품목이 잔뜩 적힌 명함에서 모델이 역량 태그를 13~14개
 * 돌려줬고, 그대로 저장된 행은 다시 읽히지 않아 대기열 조회 전체가 502 로
 * 죽었다. 목록이 안 뜨니 사용자는 그 행을 지울 수도 없었다.
 */
import { describe, expect, it, vi } from "vitest";

const { callAI } = vi.hoisted(() => ({ callAI: vi.fn() }));

// 실제 llm 모듈은 server-only 를 끌고 오므로 진입점만 대역으로 세운다.
vi.mock("@/lib/ai/llm", () => ({
  callAI,
  parseJsonObject: (raw: string) => JSON.parse(raw) as Record<string, unknown>,
}));

import { extractCardFromImage } from "@/lib/ai/extract";
import { CARD_LIMITS, parseExtractedCard } from "@/lib/http-contracts";

const supabase = {} as never;

function respondWith(card: Record<string, unknown>) {
  callAI.mockResolvedValue(JSON.stringify({ name: "박규민", company: "(주)미르텍", confidence: 0.95, ...card }));
}

describe("extracted card write contract", () => {
  it("Given the product-heavy card that broke the queue When extracted Then every tag survives", async () => {
    // 실제로 대기열을 막았던 명함. 14개 전부 남아야 한다.
    const capabilities = [
      "PCB", "PCB 장비", "PCB 자재", "LDI", "AOI", "AVI", "BBT", "X-Ray 장비",
      "홀 플러깅", "오토 필러", "라미네이터", "잉크젯 프린터", "PSR 스프레이", "자동화 장비",
    ];
    respondWith({ capabilities });

    const card = await extractCardFromImage(supabase, "owner", "data:image/jpeg;base64,AA==");

    expect(capabilities.length).toBeLessThanOrEqual(CARD_LIMITS.tags);
    expect(card.capabilities).toEqual(capabilities);
    expect(parseExtractedCard(card).ok).toBe(true);
  });

  it("Given more tags than the contract allows When extracted Then the card is clamped instead of poisoning the queue", async () => {
    const capabilities = Array.from({ length: CARD_LIMITS.tags + 5 }, (_, index) => `품목${index}`);
    respondWith({ capabilities });

    const card = await extractCardFromImage(supabase, "owner", "data:image/jpeg;base64,AA==");

    expect(card.capabilities).toEqual(capabilities.slice(0, CARD_LIMITS.tags));
    expect(parseExtractedCard(card).ok).toBe(true);
  });

  it("Given oversized text fields When the card is parsed Then every field is clamped to the contract", async () => {
    respondWith({
      capabilities: ["가".repeat(CARD_LIMITS.tag + 50), "가".repeat(CARD_LIMITS.tag + 50)],
      raw_text: "나".repeat(CARD_LIMITS.rawText + 500),
      address: "다".repeat(CARD_LIMITS.text + 100),
    });

    const card = await extractCardFromImage(supabase, "owner", "data:image/jpeg;base64,AA==");

    expect(card.capabilities).toHaveLength(1); // 잘린 뒤 중복이라 하나로 합쳐진다
    expect(card.capabilities[0]).toHaveLength(CARD_LIMITS.tag);
    expect(card.raw_text).toHaveLength(CARD_LIMITS.rawText);
    expect(card.address).toHaveLength(CARD_LIMITS.text);
    expect(parseExtractedCard(card).ok).toBe(true);
  });

  it("Given a model reply with junk tags and no confidence When parsed Then the card still satisfies the contract", async () => {
    respondWith({ capabilities: [null, 42, "  ", "정밀가공"], confidence: "높음" });

    const card = await extractCardFromImage(supabase, "owner", "data:image/jpeg;base64,AA==");

    expect(card.capabilities).toEqual(["정밀가공"]);
    expect(card.confidence).toBe(0.5);
    expect(parseExtractedCard(card).ok).toBe(true);
  });
});
