import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { getSignedInUser } from "@/lib/auth";
import { AuthShell } from "@/app/auth-shell";
import { CopyId } from "./copy-id";

/**
 * 로그인은 됐지만 허용 목록에 없는 사람에게 보여주는 화면.
 *
 * 그냥 "안 됩니다" 로 끝내면 등록을 요청할 방법이 없다. Apple "이메일 가리기" 를
 * 쓰면 관리자가 이메일을 미리 알 수도 없으므로, 본인 식별자를 복사해서 보낼 수
 * 있게 해준다.
 */
export default async function NotAllowedPage() {
  const user = await getSignedInUser();
  if (!user) redirect("/sign-in");

  const isPrivateRelay = user.email?.endsWith("privaterelay.appleid.com") ?? false;

  return (
    <AuthShell>
      <div className="w-full space-y-4">
        <div className="rounded-2xl border border-warn/25 bg-warn-soft px-4 py-3.5 text-sm text-warn">
          <p className="font-semibold">아직 사용 권한이 없습니다</p>
          <p className="mt-1 text-warn/80">
            아래 정보를 관리자에게 보내면 등록해 드립니다.
          </p>
        </div>

        <CopyId userId={user.id} email={user.email} />

        {isPrivateRelay && (
          <p className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-soft">
            Apple 로그인에서 <strong className="text-ink">이메일 가리기</strong>를
            사용하셨습니다. 이 경우 이메일 대신 위의 <strong className="text-ink">사용자 ID</strong>로
            등록해야 합니다.
          </p>
        )}

        <SignOutButton redirectUrl="/sign-in">
          <button className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-soft">
            다른 계정으로 로그인
          </button>
        </SignOutButton>
      </div>
    </AuthShell>
  );
}
