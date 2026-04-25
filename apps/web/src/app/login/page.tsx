import { redirect } from "next/navigation";
import packageJson from "../../../package.json";
import AuthSplitShell from "@/components/auth/AuthSplitShell";
import LoginForm from "@/components/auth/LoginForm";
import { getCurrentUserAndProfile } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{ next?: string; reset?: string }>;
};

function sanitizeNextPath(path: string | undefined) {
  if (!path || !path.startsWith("/")) return "/admin";
  return path.startsWith("/admin") ? path : "/admin";
}

function getEnvironmentLabel() {
  if (process.env.VERCEL_ENV === "preview") return "Staging";
  if (process.env.NODE_ENV === "production") return "Production";
  return "Development";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const nextPath = sanitizeNextPath(params?.next);
  const envLabel = getEnvironmentLabel();
  const version = packageJson.version;

  if (!hasSupabaseEnv()) {
    return (
      <AuthSplitShell>
        <section className="auth-console-card">
          <h1>Sign In Unavailable</h1>
          <p className="auth-console-subtitle">
            This console is not configured yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>apps/web/.env.local</code>, then
            restart the web server.
          </p>
          <div className="auth-console-footer">
            <span>{envLabel}</span>
            <span>v{version}</span>
          </div>
        </section>
      </AuthSplitShell>
    );
  }

  const { user, profile } = await getCurrentUserAndProfile();

  if (user && profile?.role === "admin" && profile.status === "approved") {
    redirect("/admin");
  }

  return (
    <AuthSplitShell>
      <LoginForm
        nextPath={nextPath}
        envLabel={envLabel}
        version={version}
        notice={params?.reset === "1" ? "Password updated. Sign in with your new password." : null}
      />
    </AuthSplitShell>
  );
}
