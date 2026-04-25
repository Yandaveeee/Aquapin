import Image from "next/image";
import type { ReactNode } from "react";

type AuthSplitShellProps = {
  children: ReactNode;
};

export default function AuthSplitShell({ children }: AuthSplitShellProps) {
  return (
    <main className="auth-shell">
      <section className="auth-hero-panel">
        <div className="auth-hero-inner">
          <div className="auth-hero-brand">
            <Image
              className="auth-hero-logo"
              src="/media/branding/logo.png"
              alt="AquaPin logo"
              width={64}
              height={64}
              priority
            />
            <div className="auth-hero-brandcopy">
              <p>AquaPin</p>
              <span>Operations Console</span>
            </div>
          </div>

          <p className="auth-hero-kicker">Secure Operations Workspace</p>
          <h1>Operate approvals, monitoring, and policy controls from one secure console.</h1>
          <p className="auth-hero-copy">
            AquaPin gives authorized personnel a focused workspace for approvals, operational
            visibility, and controlled configuration updates.
          </p>

          <ul className="auth-hero-list">
            <li>Secure role-gated access for sensitive operations</li>
            <li>Audited approval and policy workflows</li>
            <li>Centralized visibility for operational decisions</li>
          </ul>
        </div>
      </section>

      <section className="auth-panel">{children}</section>
    </main>
  );
}
