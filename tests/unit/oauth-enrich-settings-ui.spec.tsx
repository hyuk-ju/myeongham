import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelPicker, type CatalogEntry } from "@/app/(tabs)/settings/model-picker";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const catalog: CatalogEntry[] = [{
  provider: "openai-codex",
  kind: "enrich",
  label: "ChatGPT OAuth (비공식·실험)",
  models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
  connected: true,
  available: true,
}];

describe("OAuth company search disclosure", () => {
  it("shows the unofficial experimental warning and alternatives", () => {
    render(
      <ModelPicker
        catalog={catalog}
        initial={{
          extract: { provider: null, model: null },
          ask: { provider: null, model: null },
          enrich: { provider: "openai-codex", model: "gpt-5.5" },
        }}
        defaultLabel="ChatGPT"
      />,
    );

    expect(screen.getAllByText("비공식·실험").length).toBeGreaterThan(0);
    expect(screen.getByText(/예고 없이 중단될 수 있습니다/)).toBeVisible();
    expect(screen.getByText(/Claude를 직접 선택/)).toBeVisible();
  });
});
