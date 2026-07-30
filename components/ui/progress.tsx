import { LoaderCircle } from "lucide-react";

type ProgressProps = Readonly<{
  label: string;
  value?: number;
  max?: number;
}>;

export function Progress({ label, value, max = 100 }: ProgressProps) {
  if (value === undefined) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-11 items-center gap-2 text-sm text-soft">
        <LoaderCircle aria-hidden="true" className="ui-spinner size-4 shrink-0 text-brand" />
        <span>{label}</span>
      </div>
    );
  }

  const boundedValue = Math.min(Math.max(value, 0), max);
  const percentage = max > 0 ? (boundedValue / max) * 100 : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={boundedValue}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-soft">{Math.round(percentage)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-soft">
        <div
          className="h-full rounded-full bg-brand transition-transform motion-reduce:transition-none"
          style={{ transform: `translateX(${percentage - 100}%)` }}
        />
      </div>
    </div>
  );
}
