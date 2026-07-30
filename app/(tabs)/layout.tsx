import { BottomNav } from "@/components/bottom-nav";

/** 하단 탭이 있는 화면들의 공통 셸. /capture 와 /sign-in 은 이 그룹 밖이다. */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div id="main-content" className="min-h-dvh pb-safe-nav">{children}</div>
      <BottomNav />
    </>
  );
}
