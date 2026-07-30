import type { ButtonHTMLAttributes, ReactNode } from "react";

const TONE_CLASS = {
  neutral: "border-line bg-surface text-soft",
  brand: "border-brand/25 bg-brand-soft text-brand",
  success: "border-ok/25 bg-ok-soft text-ok",
  warning: "border-warn/25 bg-warn-soft text-warn",
  danger: "border-danger/25 bg-danger-soft text-danger",
} as const;

export type SemanticTone = keyof typeof TONE_CLASS;

type StatusBadgeProps = Readonly<{
  children: ReactNode;
  tone?: SemanticTone;
  className?: string;
}>;

export function StatusBadge({
  children,
  tone = "neutral",
  className = "",
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-6 max-w-full items-center rounded-lg border px-2 py-0.5 text-xs font-semibold leading-5 [word-break:keep-all] [overflow-wrap:anywhere] ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

type ChipProps = Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children: ReactNode;
    selected?: boolean;
  }
>;

export function Chip({
  children,
  selected = false,
  className = "",
  type = "button",
  ...buttonProps
}: ChipProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      aria-pressed={selected}
      className={`inline-flex min-h-11 max-w-full items-center rounded-full border px-3 py-2 text-sm font-medium transition-colors [overflow-wrap:anywhere] ${
        selected
          ? "border-brand bg-brand text-brand-ink"
          : "border-line-strong bg-surface text-soft hover:bg-surface-hover"
      } ${className}`.trim()}
    >
      {children}
    </button>
  );
}
