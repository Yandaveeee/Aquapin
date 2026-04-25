import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const features = [
  {
    eyebrow: "Approval queue",
    metric: "Primary workflow",
    title: "Role-based access approvals",
    description:
      "Approve staff requests with scoped permissions so field teams get access quickly and safely.",
    detail:
      "Reviewer context, access scope, and audit notes stay in one flow so teams can decide quickly without losing control.",
  },
  {
    eyebrow: "Operations",
    metric: "Live signals",
    title: "Live operations visibility",
    description:
      "Track activity, assignments, and key signals from one dashboard without jumping between tools.",
    detail: "Monitor queue volume, escalation risks, and operational health from a single admin workspace.",
  },
  {
    eyebrow: "Configuration",
    metric: "Policy center",
    title: "Policy and settings control",
    description:
      "Adjust operational rules and configuration in one place with consistent admin guardrails.",
    detail: "Update admin settings with fewer handoffs and clearer governance over what changes are allowed.",
  },
  {
    eyebrow: "Compliance",
    metric: "Audit trail",
    title: "Audit-ready change history",
    description:
      "Keep a clear record of who changed what and when for faster reviews and issue resolution.",
    detail: "Action history stays visible for approvals, policy changes, and exceptions that need follow-up.",
  },
];

const proofPoints = [
  {
    value: "24",
    label: "queued approvals",
    detail: "Field access requests routed into one review queue.",
  },
  {
    value: "95%",
    label: "same-day turnaround",
    detail: "Supervisors can see what is blocked before work slows down.",
  },
  {
    value: "100%",
    label: "action traceability",
    detail: "Every admin change is captured for audits and follow-up.",
  },
];

const previewStats = [
  {
    label: "Pending reviews",
    value: "24",
  },
  {
    label: "Active policies",
    value: "12",
  },
  {
    label: "Escalations",
    value: "03",
  },
];

const previewQueue = [
  {
    team: "North District",
    role: "Meter Reader",
    state: "Awaiting supervisor review",
  },
  {
    team: "Central Ops",
    role: "Maintenance Lead",
    state: "Ready for admin approval",
  },
  {
    team: "South Zone",
    role: "Field Auditor",
    state: "Policy check flagged",
  },
];

export default function HomePage() {
  return (
    <main className="landing-root">
      <header className="landing-topbar">
        <Link className="landing-brand" href="/">
          <Image
            className="landing-brand-logo"
            src="/media/branding/logo.png"
            alt="AquaPin logo"
            width={44}
            height={44}
            priority
          />
          <span className="landing-brand-copy">
            <strong>AquaPin</strong>
            <small>Operations Console</small>
          </span>
        </Link>
        <div className="landing-topbar-actions">
          <Link className="landing-topbar-link" href="#features">
            Features
          </Link>
          <Link className="landing-login-button" href="/login">
            Login
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-content">
          <p className="landing-kicker">Water Utility Admin Platform</p>
          <h1>Run approvals, monitoring, and policy updates from one command center.</h1>
          <p className="landing-copy">
            AquaPin centralizes admin workflows so teams can move faster while keeping access,
            operations, and configuration under control.
          </p>
          <ul className="landing-highlights">
            <li>Fast staff onboarding and access approval</li>
            <li>One dashboard for operational decisions</li>
            <li>Clear, traceable admin actions</li>
          </ul>
          <div className="landing-actions">
            <Link className="primary-button" href="/login">
              Open Sign In
            </Link>
            <Link className="secondary-button" href="#features">
              Explore Features
            </Link>
          </div>
          <ScrollReveal delay={40}>
            <div className="landing-proof-row">
              {proofPoints.map((point) => (
                <article className="landing-proof-card" key={point.label}>
                  <p className="landing-proof-value">{point.value}</p>
                  <p className="landing-proof-label">{point.label}</p>
                  <p className="landing-proof-detail">{point.detail}</p>
                </article>
              ))}
            </div>
          </ScrollReveal>
          <ScrollReveal delay={90}>
            <section className="landing-preview" aria-label="AquaPin dashboard preview">
              <div className="landing-preview-head">
                <div>
                  <p className="landing-preview-kicker">Live Preview</p>
                  <h2>Approval queue and policy visibility in one view.</h2>
                </div>
                <span className="landing-preview-status">Sync healthy</span>
              </div>
              <div className="landing-preview-grid">
                <div className="landing-preview-stats">
                  {previewStats.map((stat) => (
                    <article className="landing-preview-stat" key={stat.label}>
                      <p>{stat.label}</p>
                      <strong>{stat.value}</strong>
                    </article>
                  ))}
                </div>
                <div className="landing-preview-queue">
                  <div className="landing-preview-queue-head">
                    <p>Pending access queue</p>
                    <span>4 high priority</span>
                  </div>
                  <div className="landing-preview-rows">
                    {previewQueue.map((item) => (
                      <article className="landing-preview-row" key={`${item.team}-${item.role}`}>
                        <div>
                          <strong>{item.team}</strong>
                          <p>{item.role}</p>
                        </div>
                        <span>{item.state}</span>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </ScrollReveal>
        </div>
      </section>

      <section className="landing-features" id="features">
        <ScrollReveal>
          <div className="landing-section-head">
            <p className="landing-kicker">Core Features</p>
            <h2>Built for high-confidence operations teams.</h2>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={70}>
          <div className="landing-feature-grid">
            {features.map((feature, index) => (
              <article
                className={`landing-feature-card${index === 0 ? " landing-feature-card-primary" : ""}`}
                key={feature.title}
              >
                <div className="landing-feature-meta">
                  <p className="landing-feature-eyebrow">{feature.eyebrow}</p>
                  <span className="landing-feature-badge">{feature.metric}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <p className="landing-feature-detail">{feature.detail}</p>
              </article>
            ))}
          </div>
        </ScrollReveal>
      </section>

      <footer className="landing-footer" id="about">
        <ScrollReveal>
          <div className="landing-footer-content">
            <div className="landing-footer-grid">
              <div className="landing-footer-column">
                <p className="landing-footer-heading">About</p>
                <div className="landing-footer-links">
                  <Link className="landing-footer-link" href="#features">
                    Core Features
                  </Link>
                  <Link className="landing-footer-link" href="#about">
                    Footer Information
                  </Link>
                  <Link className="landing-footer-link" href="/login">
                    Sign In
                  </Link>
                </div>
              </div>

              <div className="landing-footer-column">
                <p className="landing-footer-heading">Navigation</p>
                <div className="landing-footer-links">
                  <Link className="landing-footer-link" href="/">
                    Home
                  </Link>
                  <Link className="landing-footer-link" href="#features">
                    Product Overview
                  </Link>
                  <Link className="landing-footer-link" href="/admin">
                    Dashboard Access
                  </Link>
                </div>
              </div>

              <div className="landing-footer-column">
                <p className="landing-footer-heading">Contact</p>
                <div className="landing-footer-links">
                  <a className="landing-footer-link" href="mailto:hello@aquapin.com">
                    hello@aquapin.com
                  </a>
                  <a className="landing-footer-link" href="mailto:support@aquapin.com">
                    support@aquapin.com
                  </a>
                  <a className="landing-footer-link" href="mailto:report@aquapin.com">
                    report@aquapin.com
                  </a>
                </div>
                <p className="landing-footer-help">
                  Report issues or operational concerns through <strong>report@aquapin.com</strong>.
                </p>
              </div>
            </div>
            <div className="landing-footer-meta">
              <p>Terms of Use</p>
              <span>&bull;</span>
              <p>Privacy Policy</p>
              <span>&bull;</span>
              <p>Send Feedback</p>
            </div>
          </div>
        </ScrollReveal>
      </footer>
    </main>
  );
}
