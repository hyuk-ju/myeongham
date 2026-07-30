import { SignUp } from "@clerk/nextjs";
import { AuthView, authAppearance } from "@/app/auth-shell";

export default function SignUpPage() {
  return (
    <AuthView>
      <SignUp appearance={authAppearance} />
    </AuthView>
  );
}
