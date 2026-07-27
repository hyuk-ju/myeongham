import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/app/auth-shell";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthShell error={error}>
      <SignIn appearance={{ elements: { cardBox: "shadow-none" } }} />
    </AuthShell>
  );
}
