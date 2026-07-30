"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, CircleHelp, Cog, CreditCard, House } from "lucide-react";

/**
 * 하단 탭 네비게이션. 가운데 촬영 버튼만 원형으로 띄워 강조한다.
 * /capture 는 자체 하단 액션바를 쓰는 전체화면 플로우라 여기 포함하지 않는다.
 */
const TABS = [
  { href: "/", label: "홈", icon: House },
  { href: "/cards", label: "명함", icon: CreditCard },
  { href: "/capture", label: "촬영", icon: Camera, primary: true },
  { href: "/ask", label: "질문", icon: CircleHelp },
  { href: "/settings", label: "설정", icon: Cog },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe">
      <div className="mx-auto grid max-w-2xl grid-cols-5 px-2 sm:px-4">
        {TABS.map(({ href, label, icon: Icon, ...tab }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          const primary = "primary" in tab;

          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                className="flex min-h-16 flex-col items-center justify-end pb-2 pt-1.5 text-[11px] font-medium text-soft"
                aria-label={label}
              >
                <span className="-mt-5 flex size-13 items-center justify-center rounded-full bg-brand text-brand-ink shadow-lg shadow-brand/30">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <span className="mt-1 text-[10px] font-medium text-soft">{label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 pb-2 pt-2 text-[11px] font-medium transition-colors hover:bg-surface-hover ${
                active ? "text-brand" : "text-faint"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
