import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const ACTION_VARIANT_CLASS = {
  primary: "ui-action-primary",
  secondary: "ui-action-secondary",
  quiet: "ui-action-quiet",
  danger: "ui-action-danger",
} as const;

export type ActionVariant = keyof typeof ACTION_VARIANT_CLASS;

type ActionProps = Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ActionVariant;
    loading?: boolean;
    icon?: ReactNode;
  }
>;

export function actionClassName(
  variant: ActionVariant = "primary",
  className = "",
): string {
  return `ui-action ${ACTION_VARIANT_CLASS[variant]} ${className}`.trim();
}

export function Action({
  variant = "primary",
  loading = false,
  icon,
  className,
  disabled,
  children,
  type = "button",
  ...buttonProps
}: ActionProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={actionClassName(variant, className)}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="ui-spinner size-4 shrink-0" />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
}
