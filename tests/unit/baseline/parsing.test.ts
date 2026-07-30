import { describe, expect, it } from "vitest";
import { parseJsonObject } from "@/lib/ai/codex";
import { parseCallbackInput } from "@/lib/ai/openai-oauth";
import { normalizePhoneOrNull, splitMultiValue } from "@/lib/phone";

describe("current parsing contracts", () => {
  it("Given fenced model output When parsed Then only the JSON object is returned", () => {
    expect(parseJsonObject('```json\n{"company":"Synthetic Co","confidence":0.75}\n```')).toEqual({
      company: "Synthetic Co",
      confidence: 0.75,
    });
  });

  it("Given a malformed model response When parsed Then the current error envelope remains stable", () => {
    expect(() => parseJsonObject("no structured payload")).toThrow(
      "모델 출력에서 JSON을 찾지 못했습니다",
    );
  });

  it("Given a callback URL When parsed Then code and state are separated", () => {
    expect(
      parseCallbackInput("http://localhost:1455/auth/callback?code=synthetic&state=fixture"),
    ).toEqual({ code: "synthetic", state: "fixture" });
  });

  it("Given draft-style contact values When normalized Then empty and multi-value contracts are deterministic", () => {
    expect(normalizePhoneOrNull(" 02-1234-5678 ")).toBe("02-1234-5678");
    expect(normalizePhoneOrNull("   ")).toBeNull();
    expect(splitMultiValue("alpha@example.invalid, beta@example.invalid")).toEqual([
      "alpha@example.invalid",
      "beta@example.invalid",
    ]);
  });
});
