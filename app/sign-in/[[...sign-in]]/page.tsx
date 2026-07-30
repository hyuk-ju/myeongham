import { SignIn } from "@clerk/nextjs";
import { AuthView, authAppearance } from "@/app/auth-shell";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <AuthView error={error}>
      <SignIn appearance={authAppearance} />
    </AuthView>
  );
}
