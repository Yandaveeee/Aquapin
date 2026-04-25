import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="auth-root">
      <section className="auth-card">
        <h1>Access blocked</h1>
        <p className="muted">
          Your account is authenticated but does not have approved access to this console.
        </p>
        <p className="muted">
          Ask the account owner to review your status in <code>public_profiles</code>.
        </p>
        <Link className="primary-button" href="/login">
          Back to Login
        </Link>
      </section>
    </main>
  );
}
