import Link from "next/link";
import type { Database } from "@aquapin/shared";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import {
  approvePendingStaffAction,
  bulkApprovePendingStaffAction,
} from "@/app/admin/approvals/actions";
import { formatDateTime, formatRelativeTime, pluralize } from "@/lib/admin-format";
import {
  getStep5AccessMigrationMessage,
  isMissingSchemaRelationError,
} from "@/lib/supabase-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;
const ALLOWED_STATUS = new Set(["pending", "approved", "all"]);

type ApprovalsPageProps = {
  searchParams?: Promise<{
    q?: string;
    page?: string;
    status?: string;
    approved?: string;
    error?: string;
  }>;
};

type PublicProfileRow = Database["public"]["Tables"]["public_profiles"]["Row"];
type AdminAccessAuditRow = Database["public"]["Tables"]["admin_access_audit"]["Row"];

function normalizePage(rawPage: string | undefined) {
  const parsed = Number(rawPage ?? "1");
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function normalizeStatus(rawStatus: string | undefined) {
  if (!rawStatus || !ALLOWED_STATUS.has(rawStatus)) return "pending";
  return rawStatus as "pending" | "approved" | "all";
}

function safeSearch(rawQuery: string | undefined) {
  return (rawQuery ?? "").trim().slice(0, 120);
}

function buildApprovalsHref({
  page,
  status,
  query,
}: {
  page?: number;
  status: "pending" | "approved" | "all";
  query: string;
}) {
  const params = new URLSearchParams();
  if (status !== "pending") params.set("status", status);
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));

  const serialized = params.toString();
  return serialized ? `/admin/approvals?${serialized}` : "/admin/approvals";
}

async function countProfiles(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  status?: "pending" | "approved"
) {
  let query = supabase
    .from("public_profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "field_staff");

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;
  if (error) {
    console.error("Failed to count profiles:", error.message);
    return 0;
  }

  return count ?? 0;
}

export default async function AdminApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const query = safeSearch(params?.q);
  const status = normalizeStatus(params?.status);
  const page = normalizePage(params?.page);
  const offset = (page - 1) * PAGE_SIZE;
  const safeReturnTo = buildApprovalsHref({ page, status, query });
  const supabase = await createSupabaseServerClient();

  let queueQuery = supabase
    .from("public_profiles")
    .select("id, email, role, status, created_at, updated_at", { count: "exact" })
    .eq("role", "field_staff")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (status !== "all") {
    queueQuery = queueQuery.eq("status", status);
  }

  if (query.length > 0) {
    queueQuery = queueQuery.ilike("email", `%${query}%`);
  }

  const [queueResult, auditResult, pendingCount, approvedCount] = await Promise.all([
    queueQuery,
    supabase
      .from("admin_access_audit")
      .select(
        "id, target_user_id, previous_status, new_status, changed_by, changed_at, notes"
      )
      .order("changed_at", { ascending: false })
      .limit(12),
    countProfiles(supabase, "pending"),
    countProfiles(supabase, "approved"),
  ]);

  const queueRows = (queueResult.data ?? []) as PublicProfileRow[];
  const auditRows = (auditResult.data ?? []) as AdminAccessAuditRow[];
  const queueError = queueResult.error;
  const auditError = auditResult.error;
  const accessAuditUnavailable = isMissingSchemaRelationError(auditError, "admin_access_audit");
  const totalRows = queueResult.count ?? 0;

  if (queueError) {
    console.error("Failed to load access queue:", queueError.message);
  }

  if (auditError && !accessAuditUnavailable) {
    console.error("Failed to load access audit:", auditError.message);
  }

  const profileIds = new Set<string>();
  auditRows.forEach((row) => {
    profileIds.add(row.target_user_id);
    profileIds.add(row.changed_by);
  });

  let profileEmailMap = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profilesData } = await supabase
      .from("public_profiles")
      .select("id, email")
      .in("id", Array.from(profileIds));
    const profiles = (profilesData ?? []) as Pick<PublicProfileRow, "id" | "email">[];
    profileEmailMap = new Map(profiles.map((profile) => [profile.id, profile.email]));
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const makePageHref = (targetPage: number) =>
    buildApprovalsHref({ page: targetPage, status, query });

  return (
    <section className="stack">
      <AdminPageHeader
        eyebrow="Access Queue"
        title="Field staff approvals"
        description="Search the queue, review account detail, and clear multiple pending signups in one pass."
        actions={
          <div className="page-tools">
            <div className="chip-row">
              {[
                { label: `Pending (${pendingCount})`, value: "pending" as const },
                { label: `Approved (${approvedCount})`, value: "approved" as const },
                { label: `All (${pendingCount + approvedCount})`, value: "all" as const },
              ].map((item) => (
                <Link
                  key={item.value}
                  href={buildApprovalsHref({ status: item.value, query, page: 1 })}
                  className={`chip ${status === item.value ? "chip-active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <Link className="secondary-button" href={safeReturnTo}>
              Refresh
            </Link>
          </div>
        }
      />

      {params?.approved ? (
        <p className="flash-success">
          {pluralize(Number(params.approved), "account")} approved successfully.
        </p>
      ) : null}
      {params?.error ? <p className="flash-error">{params.error}</p> : null}

      <div className="card-grid three-col">
        <article className="metric-card">
          <p className="metric-label">Pending Queue</p>
          <p className="metric-value">{pendingCount}</p>
          <p className="metric-detail">Accounts waiting for admin approval</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Approved Staff</p>
          <p className="metric-value">{approvedCount}</p>
          <p className="metric-detail">Field staff accounts already cleared</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Visible Results</p>
          <p className="metric-value">{queueRows.length}</p>
          <p className="metric-detail">
            Page {page} of {totalPages} for the current filter
          </p>
        </article>
      </div>

      <article className="panel">
        <form className="inline-form filter-form" method="GET">
          <div className="filter-field">
            <label htmlFor="q" className="field-label">
              Search by email
            </label>
            <input id="q" name="q" defaultValue={query} className="field-input" />
          </div>

          <div className="filter-field">
            <label htmlFor="status" className="field-label">
              Status filter
            </label>
            <select id="status" name="status" className="field-input" defaultValue={status}>
              <option value="pending">
                Pending
              </option>
              <option value="approved">
                Approved
              </option>
              <option value="all">
                All
              </option>
            </select>
          </div>

          <input type="hidden" name="page" value="1" />
          <button className="secondary-button" type="submit">
            Apply filters
          </button>
        </form>
      </article>

      <article className="panel">
        <div className="panel-header-row">
          <div>
            <h3 className="panel-title">Review Queue</h3>
            <p className="panel-subtitle">
              Select pending rows to bulk approve, or inspect individual details before acting.
            </p>
          </div>
          <form id="bulk-approve-form" action={bulkApprovePendingStaffAction} className="bulk-action-bar">
            <input type="hidden" name="returnTo" value={safeReturnTo} />
            <input
              type="text"
              name="notes"
              className="field-input compact"
              placeholder="Note for selected approvals"
              maxLength={250}
            />
            <button className="primary-button" type="submit">
              Approve Selected
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table className="data-table approvals-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Email</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Waiting</th>
                <th>Review</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {queueRows.length > 0 ? (
                queueRows.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      {profile.status === "pending" ? (
                        <input
                          type="checkbox"
                          name="targetUserId"
                          value={profile.id}
                          form="bulk-approve-form"
                          aria-label={`Select ${profile.email}`}
                        />
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="table-primary-cell">
                        <strong>{profile.email}</strong>
                        <span className="muted">{profile.role}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`ui-pill ${
                          profile.status === "pending" ? "ui-pill-warning" : "ui-pill-success"
                        }`}
                      >
                        {profile.status}
                      </span>
                    </td>
                    <td>{formatDateTime(profile.created_at)}</td>
                    <td>{formatRelativeTime(profile.created_at)}</td>
                    <td>
                      <details className="detail-disclosure">
                        <summary>Open details</summary>
                        <div className="approval-detail-card">
                          <p>
                            <strong>User ID:</strong> {profile.id}
                          </p>
                          <p>
                            <strong>Created:</strong> {formatDateTime(profile.created_at)}
                          </p>
                          <p>
                            <strong>Updated:</strong> {formatDateTime(profile.updated_at)}
                          </p>
                          <p>
                            <strong>Status:</strong> {profile.status}
                          </p>
                          <p className="muted">
                            Use a note when context matters so the access audit trail explains why the
                            approval happened.
                          </p>
                        </div>
                      </details>
                    </td>
                    <td>
                      {profile.status === "pending" ? (
                        <form action={approvePendingStaffAction} className="approve-form">
                          <input type="hidden" name="targetUserId" value={profile.id} />
                          <input type="hidden" name="returnTo" value={safeReturnTo} />
                          <input
                            type="text"
                            name="notes"
                            className="field-input compact"
                            placeholder="Approval note"
                            maxLength={250}
                          />
                          <button className="primary-button" type="submit">
                            Approve
                          </button>
                        </form>
                      ) : (
                        <span className="ui-pill ui-pill-success">Already approved</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    No staff accounts match this filter. Try widening the status filter or clearing the
                    email search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <Link className="chip" href={makePageHref(prevPage)}>
            Previous
          </Link>
          <span className="muted">
            Showing {queueRows.length} of {totalRows}
          </span>
          <Link className="chip" href={makePageHref(nextPage)}>
            Next
          </Link>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header-row">
          <div>
            <h3 className="panel-title">Recent Access Audit</h3>
            <p className="panel-subtitle">Latest approval transitions written by the admin RPC.</p>
          </div>
          <span className="ui-pill ui-pill-ghost">{auditRows.length} entries</span>
        </div>

        {accessAuditUnavailable ? (
          <div className="empty-panel">
            <p>{getStep5AccessMigrationMessage()}</p>
            <p className="muted">
              Apply the Step 5 SQL migration, then refresh this page to enable the access audit trail.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Changed At</th>
                  <th>Target User</th>
                  <th>Transition</th>
                  <th>Changed By</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.length > 0 ? (
                  auditRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.changed_at)}</td>
                      <td>{profileEmailMap.get(row.target_user_id) ?? row.target_user_id}</td>
                      <td>
                        <span className="transition-pill">
                          <span className="ui-pill ui-pill-warning">{row.previous_status}</span>
                          <span className="transition-arrow">to</span>
                          <span className="ui-pill ui-pill-success">{row.new_status}</span>
                        </span>
                      </td>
                      <td>{profileEmailMap.get(row.changed_by) ?? row.changed_by}</td>
                      <td>{row.notes || <span className="muted">No note</span>}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No audit entries yet. Approved accounts will appear here automatically.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
