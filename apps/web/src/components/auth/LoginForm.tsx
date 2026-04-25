"use client";

import { FormEvent, startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  envLabel: string;
  nextPath: string;
  notice?: string | null;
  version: string;
};

function normalizeNextPath(path: string) {
  return path.startsWith("/admin") ? path : "/admin";
}

export default function LoginForm({ envLabel, nextPath, notice, version }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(notice ?? null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    const supabase = createSupabaseBrowserClient({
      storage: rememberMe ? window.localStorage : window.sessionStorage,
    });

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    startTransition(() => {
      router.push(normalizeNextPath(nextPath));
      router.refresh();
    });
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email address first to receive a password reset link.");
      return;
    }

    setResetting(true);
    setError(null);
    setStatus(null);

    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (resetError) {
      setError(resetError.message);
      setResetting(false);
      return;
    }

    setStatus("Password recovery link sent. Check your email to continue.");
    setResetting(false);
  }

  return (
    <form className="auth-console-card" onSubmit={handleSubmit}>
      <div className="auth-console-header">
        <div className="auth-console-meta">
          <span className="auth-env-pill">{envLabel}</span>
          <span className="auth-version-pill">v{version}</span>
        </div>
        <h1>Console Login</h1>
        <p className="auth-console-subtitle">Sign in to AquaPin Operations Console</p>
        <p className="auth-console-note">Authorized personnel only.</p>
      </div>

      <label className="field-label" htmlFor="email">
        Email address
      </label>
      <input
        className="field-input"
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label className="field-label" htmlFor="password">
        Password
      </label>
      <div className="auth-password-wrap">
        <input
          className="field-input auth-password-input"
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button
          className="auth-input-action"
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <div className="auth-form-row">
        <label className="auth-checkbox" htmlFor="remember-me">
          <input
            id="remember-me"
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <span>Remember me</span>
        </label>
        <button
          className="auth-link-button"
          type="button"
          onClick={handleForgotPassword}
          disabled={resetting}
        >
          {resetting ? "Sending..." : "Forgot password?"}
        </button>
      </div>

      {status ? <p className="flash-success">{status}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <button className="primary-button auth-submit" type="submit" disabled={submitting}>
        {submitting ? "Signing in..." : "Sign In"}
      </button>

      <div className="auth-console-footer">
        <span>Secure enterprise access</span>
        <span>Session storage: {rememberMe ? "device" : "browser tab"}</span>
      </div>
    </form>
  );
}
