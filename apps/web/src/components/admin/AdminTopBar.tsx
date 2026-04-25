"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type AdminTopBarProps = {
  organizationName: string;
  envLabel: string;
  pendingApprovals: number;
  attentionCount: number;
  settingsChanges: number;
  isSidebarOpen: boolean;
  onMenuToggle: () => void;
};

type PageMeta = {
  title: string;
  description: string;
  shortcuts: Array<{ href: string; label: string; badge?: number }>;
};

function getPageMeta(
  pathname: string,
  pendingApprovals: number,
  settingsChanges: number
): PageMeta {
  if (pathname.startsWith("/admin/approvals")) {
    return {
      title: "Access Queue",
      description: "Review staff signups, clear queue pressure, and audit admin approvals.",
      shortcuts: [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/settings", label: "Settings", badge: settingsChanges },
      ],
    };
  }

  if (pathname.startsWith("/admin/settings")) {
    return {
      title: "Settings & Audit",
      description: "Manage typed configuration, review diffs, and restore recent changes.",
      shortcuts: [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/approvals?status=pending", label: "Review Queue", badge: pendingApprovals },
      ],
    };
  }

  return {
    title: "Operations Dashboard",
    description: "Track farm health, approval backlog, and recent operational activity.",
    shortcuts: [
      { href: "/admin/approvals?status=pending", label: "Review Queue", badge: pendingApprovals },
      { href: "/admin/settings", label: "Settings", badge: settingsChanges },
    ],
  };
}

export default function AdminTopBar({
  organizationName,
  envLabel,
  pendingApprovals,
  attentionCount,
  settingsChanges,
  isSidebarOpen,
  onMenuToggle,
}: AdminTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const pageMeta = getPageMeta(pathname, pendingApprovals, settingsChanges);

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-main">
        <button
          aria-controls="admin-sidebar"
          aria-expanded={isSidebarOpen}
          aria-label={isSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          className="admin-menu-toggle"
          onClick={onMenuToggle}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="admin-topbar-copy">
          <div className="admin-topbar-meta">
            <span className="ui-pill ui-pill-ghost">{organizationName}</span>
            <span className="ui-pill ui-pill-info">{envLabel}</span>
            <span className={`ui-pill ${attentionCount > 0 ? "ui-pill-warning" : "ui-pill-success"}`}>
              {attentionCount > 0 ? `${attentionCount} attention items` : "Operations stable"}
            </span>
          </div>
          <div>
            <h1>{pageMeta.title}</h1>
            <p>{pageMeta.description}</p>
          </div>
        </div>
      </div>

      <div className="admin-topbar-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>

        {pageMeta.shortcuts.map((shortcut) => (
          <Link className="secondary-button admin-shortcut" key={shortcut.href} href={shortcut.href}>
            <span>{shortcut.label}</span>
            {shortcut.badge && shortcut.badge > 0 ? (
              <span className="button-badge">{shortcut.badge}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </header>
  );
}
