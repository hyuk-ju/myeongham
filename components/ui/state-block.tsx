import {
  AlertCircle,
  CheckCircle2,
  CircleHelp,
  Inbox,
  LoaderCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SemanticTone } from "./chip";

const STATE_CONFIG = {
  loading: {
    icon: LoaderCircle,
    tone: "brand",
    role: "status",
    live: "polite",
  },
  empty: { icon: Inbox, tone: "neutral", role: "status", live: "polite" },
  error: { icon: AlertCircle, tone: "danger", role: "alert", live: "assertive" },
  success: {
    icon: CheckCircle2,
    tone: "success",
    role: "status",
    live: "polite",
  },
  info: { icon: CircleHelp, tone: "brand", role: "status", live: "polite" },
} as const satisfies Record<
  string,
  {
    readonly icon: typeof AlertCircle;
    readonly tone: SemanticTone;
    readonly role: "status" | "alert";
    readonly live: "polite" | "assertive";
  }
>;

const STATE_TONE_CLASS: Record<SemanticTone, string> = {
  neutral: "bg-surface-hover text-soft",
  brand: "bg-brand-soft text-brand",
  success: "bg-ok-soft text-ok",
  warning: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

type StateBlockProps = Readonly<{
  state: keyof typeof STATE_CONFIG;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}>;

export function StateBlock({
  state,
  title,
  description,
  action,
  className = "",
}: StateBlockProps) {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;

  return (
    <section
      role={config.role}
      aria-live={config.live}
      className={`ui-surface flex flex-col items-center px-5 py-8 text-center sm:px-8 ${className}`.trim()}
    >
      <span
        className={`mb-4 flex size-11 items-center justify-center rounded-xl ${STATE_TONE_CLASS[config.tone]}`}
      >
        <Icon
          aria-hidden="true"
          className={`size-5 ${state === "loading" ? "ui-spinner" : ""}`}
        />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
