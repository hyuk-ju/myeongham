import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectAI, type ProviderState } from "@/app/(tabs)/settings/connect-ai";
import { SettingsView } from "@/app/(tabs)/settings/settings-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const provider: ProviderState = {
  provider: "openai-codex",
  connected: true,
  active: true,
  accountId: "ac•••42",
  expiresAt: "2030-01-01T00:00:00.000Z",
  expirySeverity: "ok",
};

describe("settings provider transparency", () => {
  it("keeps provider settings focused on user OAuth without key material", () => {
    const { container } = render(
      <SettingsView
        providers={[provider]}
        catalog={[]}
        initial={{ extract: { provider: null, model: null }, ask: { provider: null, model: null }, enrich: { provider: null, model: null } }}
        defaultLabel="ChatGPT"
        oauthContent={<ConnectAI providers={[provider]} />}
        modelContent={<div>models</div>}
        accountContent={<div>account</div>}
      />,
    );

    expect(screen.getByRole("heading", { name: "사용자 OAuth 연결" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "서버 소유 OpenAI API" })).toBeNull();
    expect(screen.queryByText("설정 필요")).toBeNull();
    expect(screen.getByText("ac•••42")).toBeVisible();
    expect(screen.queryByText(/OPENAI_API_KEY/)).toBeNull();
    expect(container.querySelectorAll("p.ui-copy-keep")).toHaveLength(4);
  });

  it("uses inline confirmation instead of browser confirm for disconnect", () => {
    render(<ConnectAI providers={[provider]} />);
    expect(screen.queryByRole("button", { name: "해제 확인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "해제" }));
    expect(screen.getByRole("button", { name: "해제 확인" })).toBeVisible();
  });
});
