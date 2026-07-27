import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/app/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={{ elements: { cardBox: "shadow-none" } }} />
    </AuthShell>
  );
}
