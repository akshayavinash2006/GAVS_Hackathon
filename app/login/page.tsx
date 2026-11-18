import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { currentShop } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentShop()) redirect("/dashboard");
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your shop"
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium text-brand">
            Set up your shop
          </Link>
          <span className="mx-2">·</span>
          <Link href="/#demo" className="hover:text-ink-2">
            Try a demo
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
