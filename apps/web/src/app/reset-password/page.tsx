import packageJson from "../../../package.json";
import AuthSplitShell from "@/components/auth/AuthSplitShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import { hasSupabaseEnv } from "@/lib/supabase/env";

function getEnvironmentLabel() {
  if (process.env.VERCEL_ENV === "preview") return "Staging";
  if (process.env.NODE_ENV === "production") return "Production";
  return "Development";
}

export default function ResetPasswordPage() {
  const envLabel = getEnvironmentLabel();
  const version = packageJson.version;

  if (!hasSupabaseEnv()) {
    return (
      <AuthSplitShell>
        <section className="auth-console-card">
          <h1>Reset Unavailable</h1>
          <p className="auth-console-subtitle">
            This console is not configured yet. Add the Supabase environment variables in{" "}
            <code>apps/web/.env.local</code>, then restart the web server.
          </p>
          <div className="auth-console-footer">
            <span>{envLabel}</span>
            <span>v{version}</span>
          </div>
        </section>
      </AuthSplitShell>
    );
  }

  return (
    <AuthSplitShell>
      <ResetPasswordForm envLabel={envLabel} version={version} />
    </AuthSplitShell>
  );
}
