import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

export const authAppearance = {
  variables: {
    colorPrimary: "var(--brand)",
    colorForeground: "var(--ink)",
    colorMutedForeground: "var(--ink-soft)",
    colorBackground: "var(--surface)",
    colorInputBackground: "var(--surface)",
    colorInputForeground: "var(--ink)",
    borderRadius: "0.75rem",
    fontFamily: "inherit",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full bg-transparent p-0 shadow-none",
    header: "hidden",
    socialButtonsBlockButton:
      "min-h-11 border-line-strong bg-surface text-ink hover:bg-surface-hover",
    dividerLine: "bg-line",
    dividerText: "text-soft",
    formFieldLabel: "text-ink",
    formFieldInput:
      "min-h-11 border-line-strong bg-surface text-base text-ink focus:border-brand",
    formButtonPrimary:
      "min-h-11 bg-brand text-brand-ink hover:bg-brand-hover focus-visible:ring-focus",
    footer: "bg-transparent",
    footerActionText: "text-soft",
    footerActionLink: "min-h-11 text-brand",
    identityPreviewText: "text-ink",
    identityPreviewEditButton: "text-brand",
    formFieldErrorText: "text-danger",
    alert: "border-danger/25 bg-danger-soft text-danger",
  },
} as const;

type AuthViewProps = Readonly<{
  children: ReactNode;
  error?: string;
  title?: string;
  description?: string;
}>;

export function AuthView({
  children,
  error,
  title = "명함첩",
  description = "찍어두면 필요할 때 찾아줍니다.",
}: AuthViewProps) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-[max(2rem,env(safe-area-inset-top))] sm:px-6"
    >
      <div className="mb-7 text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-brand-ink shadow-lg shadow-brand/20"
        >
          명
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.035em]">{title}</h1>
        <p className="mt-1 text-sm text-soft">{description}</p>
      </div>

      {error === "not_allowed" ? (
        <div
          role="alert"
          className="mb-4 flex gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="ui-copy-keep">
            허용되지 않은 계정입니다. 관리자 설정(
            <code className="font-mono text-xs">ALLOWED_EMAILS</code>)에 등록된
            이메일로 다시 로그인하거나 권한을 요청하세요.
          </p>
        </div>
      ) : null}

      <div
        data-testid="auth-frame"
        className="ui-surface ui-surface-raised w-full overflow-hidden px-4 py-5 sm:px-6 sm:py-6"
      >
        {children}
      </div>
    </main>
  );
}

export const AuthShell = AuthView;
