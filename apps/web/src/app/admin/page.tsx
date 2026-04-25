import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { formatDateTime, formatRelativeTime } from "@/lib/admin-format";
import { getDashboardOverview } from "@/lib/admin-data";

type AdminDashboardPageProps = {
  searchParams?: Promise<{ days?: string }>;
};

function normalizeDays(rawDays: string | undefined) {
  const parsed = Number(rawDays ?? "7");
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) return 7;
  return parsed;
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const days = normalizeDays(params?.days);
  const overview = await getDashboardOverview(days);

  return (
    <section className="stack">
      <AdminPageHeader
        eyebrow="Operational Snapshot"
        title="Prioritized farm health"
        description={`Review queue pressure, pond thresholds, and recent activity for the last ${days} day${days === 1 ? "" : "s"}.`}
        actions={
          <div className="page-tools">
            <div className="chip-row">
              {[1, 7, 30].map((value) => (
                <Link
                  key={value}
                  href={`/admin?days=${value}`}
                  className={`chip ${value === days ? "chip-active" : ""}`}
                >
                  {value} day{value === 1 ? "" : "s"}
                </Link>
              ))}
            </div>
            <form className="inline-form" method="GET">
              <label className="field-label sr-only" htmlFor="days">
                Custom date range in days
              </label>
              <input
                className="field-input compact"
                id="days"
                max={90}
                min={1}
                name="days"
                type="number"
                defaultValue={days}
              />
              <button className="secondary-button" type="submit">
                Apply
              </button>
            </form>
          </div>
        }
      />

      <div className="card-grid admin-metric-grid">
        {overview.metrics.map((metric) => (
          <Link key={metric.label} href={metric.href} className={`metric-card metric-card-link is-${metric.tone}`}>
            <p className="metric-label">{metric.label}</p>
            <p className="metric-value">{metric.value}</p>
            <p className="metric-trend">{metric.trend}</p>
            <p className="metric-detail">{metric.detail}</p>
          </Link>
        ))}
      </div>

      <div className="card-grid two-col dashboard-split-grid">
        <article className="panel" id="attention">
          <div className="panel-header-row">
            <div>
              <h3 className="panel-title">Attention Required</h3>
              <p className="panel-subtitle">Work items that need admin review before they turn into delays.</p>
            </div>
            <span
              className={`ui-pill ${
                overview.attentionItems.length > 1 || overview.counts.pendingApprovals > 0
                  ? "ui-pill-warning"
                  : "ui-pill-success"
              }`}
            >
              {overview.attentionItems.length} items
            </span>
          </div>

          <div className="attention-list">
            {overview.attentionItems.map((item) => (
              <article key={item.id} className={`attention-item is-${item.tone}`}>
                <div>
                  <div className="attention-title-row">
                    <h4>{item.title}</h4>
                    <span className={`ui-pill ui-pill-${item.tone}`}>{item.tone}</span>
                  </div>
                  <p>{item.description}</p>
                </div>
                <a className="secondary-button" href={item.href}>
                  {item.actionLabel}
                </a>
              </article>
            ))}
          </div>
        </article>

        <article className="panel" id="pond-health">
          <div className="panel-header-row">
            <div>
              <h3 className="panel-title">Pond Health Snapshot</h3>
              <p className="panel-subtitle">
                Threshold-aware status summary based on active pond activity and current stock.
              </p>
            </div>
            <span className="ui-pill ui-pill-ghost">Updated {formatRelativeTime(overview.updatedAt)}</span>
          </div>

          <div className="summary-stat-grid">
            <article className="summary-stat">
              <span>Active ponds</span>
              <strong>{overview.counts.activePonds}</strong>
              <small>{overview.counts.totalPonds} total ponds in the system</small>
            </article>
            <article className="summary-stat">
              <span>Low-stock threshold</span>
              <strong>{overview.thresholds.lowStockThreshold}</strong>
              <small>{overview.counts.lowStockCount} active ponds below target</small>
            </article>
            <article className="summary-stat" id="stale-activity">
              <span>Stale activity window</span>
              <strong>{overview.thresholds.staleSyncMinutes} min</strong>
              <small>{overview.counts.stalePondsCount} active ponds need fresh history</small>
            </article>
          </div>
        </article>
      </div>

      <article className="panel" id="feed">
        <div className="panel-header-row">
          <div>
            <h3 className="panel-title">Operational Timeline</h3>
            <p className="panel-subtitle">
              Readable activity feed from <code>pond_history</code> for the last {days} day
              {days === 1 ? "" : "s"}.
            </p>
          </div>
          <span className="ui-pill ui-pill-ghost">{overview.recentEvents.length} records</span>
        </div>

        {overview.recentEvents.length > 0 ? (
          <div className="timeline-list">
            {overview.recentEvents.map((event) => (
              <article className="timeline-card" key={event.id}>
                <div className="timeline-head">
                  <div className="timeline-badges">
                    <span className={`ui-pill ui-pill-${event.tone}`}>{event.badge}</span>
                    <span className="ui-pill ui-pill-ghost">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                  <p className="timeline-timestamp">{formatDateTime(event.createdAt)}</p>
                </div>

                <h4>{event.summary}</h4>
                <p className="timeline-detail">{event.detail}</p>

                <div className="timeline-meta">
                  <span>Pond: {event.pondName}</span>
                  <span>Actor: {event.actorName}</span>
                </div>

                {event.rawData ? (
                  <details className="detail-disclosure">
                    <summary>View raw payload</summary>
                    <pre>{JSON.stringify(event.rawData, null, 2)}</pre>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-panel">
            <p>No pond history entries were recorded for this window.</p>
            <p className="muted">Try expanding the range or verify that field activity is syncing into history.</p>
          </div>
        )}
      </article>
    </section>
  );
}
