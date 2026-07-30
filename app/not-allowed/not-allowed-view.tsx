import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { AuthView } from "@/app/auth-shell";
import { StateBlock } from "@/components/ui";
import { CopySupportDetails } from "./copy-id";

type NotAllowedViewProps = Readonly<{
  supportCode: string;
  maskedEmail: string | null;
  privateRelay: boolean;
  signOutAction: ReactNode;
}>;

export function NotAllowedView({
  supportCode,
  maskedEmail,
  privateRelay,
  signOutAction,
}: NotAllowedViewProps) {
  return (
    <AuthView title="권한 요청" description="관리자가 계정을 확인할 수 있도록 지원 정보를 보내 주세요.">
      <div className="space-y-4">
        <StateBlock
          state="info"
          title="아직 사용 권한이 없습니다"
          description="아래의 마스킹된 정보는 계정을 노출하지 않고 권한을 요청하는 데 사용됩니다."
        />

        <CopySupportDetails supportCode={supportCode} maskedEmail={maskedEmail} />

        {privateRelay ? (
          <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>
              Apple 이메일 가리기를 사용 중입니다. 관리자에게 지원 코드를 함께
              보내 주세요.
            </p>
          </div>
        ) : null}

        {signOutAction}
      </div>
    </AuthView>
  );
}
