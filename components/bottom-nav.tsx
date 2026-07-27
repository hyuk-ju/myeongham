"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 하단 탭 네비게이션. 가운데 촬영 버튼만 원형으로 띄워 강조한다.
 * /capture 는 자체 하단 액션바를 쓰는 전체화면 플로우라 여기 포함하지 않는다.
 */
const TABS = [
  { href: "/", label: "홈", icon: HomeIcon },
  { href: "/cards", label: "명함", icon: CardsIcon },
  { href: "/capture", label: "촬영", icon: CameraIcon, primary: true },
  { href: "/ask", label: "질문", icon: AskIcon },
  { href: "/settings", label: "설정", icon: GearIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe">
      <div className="mx-auto grid max-w-2xl grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, ...tab }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const primary = "primary" in tab;

          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center justify-end pb-2 pt-1.5"
                aria-label={label}
              >
                <span className="-mt-5 flex h-13 w-13 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg shadow-brand/30">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="mt-1 text-[10px] font-medium text-soft">{label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-medium ${
                active ? "text-brand" : "text-faint"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5.5 w-5.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h5v-6h4v6h5V9.5" />
    </svg>
  );
}

function CardsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h5" />
      <path d="M7 14h8" />
    </svg>
  );
}

function CameraIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 8h2.5L8 5.8h8L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function AskIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a8 8 0 1 1-3.1-6.3L21 4l-.9 3.4A8 8 0 0 1 21 12Z" />
      <path d="M9.5 10.5c.2-1.2 1.2-2 2.5-2 1.4 0 2.5.9 2.5 2.1 0 1.5-1.6 1.7-2.3 2.7" />
      <path d="M12 16.2v.1" />
    </svg>
  );
}

function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.5h4l.4-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z" />
    </svg>
  );
}
