import { fireEvent, render, screen } from "@testing-library/react";
import { Save } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AuthView } from "@/app/auth-shell";
import { CopySupportDetails } from "@/app/not-allowed/copy-id";
import {
  Action,
  FormField,
  IconButton,
  Progress,
  StateBlock,
  StatusBadge,
} from "@/components/ui";
import {
  createSupportCode,
  maskEmail,
} from "@/app/not-allowed/support-details";

describe("paper-binder primitives", () => {
  it("renders labelled 44px actions with loading, disabled, and icon-button states", () => {
    render(
      <>
        <Action loading>저장 중</Action>
        <Action disabled>비활성</Action>
        <IconButton aria-label="저장" icon={<Save />} />
      </>,
    );

    expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장 중" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "비활성" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장" })).toHaveClass(
      "ui-icon-button",
    );
  });

  it("connects field descriptions and errors to the input", () => {
    render(
      <FormField
        id="email"
        label="이메일"
        description="업무 이메일을 입력하세요."
        error="이메일 형식을 확인하세요."
      />,
    );

    const input = screen.getByRole("textbox", { name: "이메일" });
    expect(input).toHaveAttribute(
      "aria-describedby",
      "email-description email-error",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "이메일 형식을 확인하세요.",
    );
  });

  it("uses semantic live regions for progress and state feedback", () => {
    render(
      <>
        <Progress label="분석 중" />
        <Progress label="업로드" value={40} />
        <StateBlock state="error" title="저장 실패" />
        <StatusBadge tone="success">완료</StatusBadge>
      </>,
    );

    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("분석 중");
    expect(screen.getByRole("progressbar", { name: "업로드" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("저장 실패");
    expect(screen.getByText("완료")).toHaveClass("bg-ok-soft");
  });

  it("keeps Korean status words together while allowing emergency wrapping", () => {
    render(<StatusBadge>very-long-status-token-without-spaces</StatusBadge>);

    expect(screen.getByText("very-long-status-token-without-spaces")).toHaveClass(
      "[word-break:keep-all]",
      "[overflow-wrap:anywhere]",
    );
  });
});

describe("pure auth and support views", () => {
  it("renders the product identity without Clerk", () => {
    render(
      <AuthView error="not_allowed">
        <button type="button">Synthetic sign in</button>
      </AuthView>,
    );

    expect(screen.getByRole("heading", { name: "명함첩" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("ALLOWED_EMAILS");
    expect(screen.getByTestId("auth-frame")).toContainElement(
      screen.getByRole("button", { name: "Synthetic sign in" }),
    );
  });

  it("creates a stable non-reversible support code and masks email", () => {
    const rawId = "user_sensitive_full_identifier_123456";
    const supportCode = createSupportCode(rawId);

    expect(supportCode).toMatch(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){2}$/);
    expect(supportCode).not.toContain(rawId);
    expect(maskEmail("person@example.com")).toBe("p*****@example.com");
    expect(maskEmail(null)).toBeNull();
  });

  it("copies only masked support details and never the source identifier", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <CopySupportDetails
        supportCode="ABCD-EF01-2345"
        maskedEmail="p*****@example.com"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "지원 정보 복사" }));

    expect(writeText).toHaveBeenCalledWith(
      "마스킹 이메일: p*****@example.com\n지원 코드: ABCD-EF01-2345",
    );
    expect(document.body).not.toHaveTextContent("user_");
  });
});
