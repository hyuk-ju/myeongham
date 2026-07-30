import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { getSignedInUser } from "@/lib/auth";
import { Action } from "@/components/ui";
import { NotAllowedView } from "./not-allowed-view";
import { createSupportCode, maskEmail } from "./support-details";

export default async function NotAllowedPage() {
  const user = await getSignedInUser();
  if (user === null) redirect("/sign-in");

  return (
    <NotAllowedView
      supportCode={createSupportCode(user.id)}
      maskedEmail={maskEmail(user.email)}
      privateRelay={user.email?.endsWith("privaterelay.appleid.com") ?? false}
      signOutAction={
        <SignOutButton redirectUrl="/sign-in">
          <Action variant="secondary" className="w-full">
            다른 계정으로 로그인
          </Action>
        </SignOutButton>
      }
    />
  );
}
