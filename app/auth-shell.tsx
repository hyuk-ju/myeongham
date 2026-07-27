/** 로그인/가입 화면 공통 껍데기 — 앱 아이덴티티를 Clerk 카드 위에 얹는다. */
export function AuthShell({
  error,
  children,
}: {
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-10">
      <div className="space-y-2.5 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-brand-ink shadow-md shadow-brand/25">
          명
        </span>
        <h1 className="text-2xl font-bold tracking-tight">명함첩</h1>
        <p className="text-sm text-soft">찍어두면 필요할 때 찾아줍니다.</p>
      </div>

      {error === "not_allowed" && (
        <p className="w-full max-w-sm rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          허용되지 않은 계정입니다. <code className="font-mono">ALLOWED_EMAILS</code> 에
          등록된 이메일로 로그인하세요.
        </p>
      )}

      <div className="flex w-full max-w-sm justify-center">{children}</div>
    </main>
  );
}
