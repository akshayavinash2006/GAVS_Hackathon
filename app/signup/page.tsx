import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignupWizard } from "@/components/signup-wizard";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AuthShell
      title="Set up your shop"
      subtitle="Takes about a minute"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand">
            Log in
          </Link>
        </>
      }
    >
      <SignupWizard />
    </AuthShell>
  );
}
