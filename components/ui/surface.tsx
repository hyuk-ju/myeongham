import type { ReactNode } from "react";

const SURFACE_VARIANT_CLASS = {
  plain: "",
  slip: "ui-surface-slip",
  raised: "ui-surface-raised",
  tinted: "ui-surface-tinted",
} as const;

type SurfaceProps = Readonly<{
  children: ReactNode;
  variant?: keyof typeof SURFACE_VARIANT_CLASS;
  className?: string;
  labelledBy?: string;
}>;

export function Surface({
  children,
  variant = "plain",
  className = "",
  labelledBy,
}: SurfaceProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`ui-surface ${SURFACE_VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {children}
    </section>
  );
}

type PanelProps = SurfaceProps &
  Readonly<{
    title: string;
    description?: string;
  }>;

export function Panel({
  title,
  description,
  children,
  className = "",
  ...surfaceProps
}: PanelProps) {
  return (
    <Surface {...surfaceProps} className={`p-4 sm:p-6 ${className}`}>
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-soft">{description}</p> : null}
      </div>
      {children}
    </Surface>
  );
}
