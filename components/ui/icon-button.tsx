import type { ButtonHTMLAttributes, ReactNode } from "react";
import { actionClassName, type ActionVariant } from "./action";

type IconButtonProps = Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> & {
    "aria-label": string;
    icon: ReactNode;
    variant?: ActionVariant;
  }
>;

export function IconButton({
  icon,
  variant = "quiet",
  className,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={actionClassName(variant, `ui-icon-button ${className ?? ""}`)}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
