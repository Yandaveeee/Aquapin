"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminNavItem = {
  href: string;
  label: string;
  badge?: number;
};

type AdminSidebarNavProps = {
  items: AdminNavItem[];
};

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebarNav({ items }: AdminSidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin navigation">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            className={`admin-nav-link ${active ? "is-active" : ""}`}
            key={item.href}
            href={item.href}
          >
            <span>{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="admin-nav-badge" aria-label={`${item.badge} items`}>
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
