import { ReactNode } from "react";
import AdminShell from "@/components/admin/AdminShell";
import { getAdminShellData } from "@/lib/admin-data";
import { requireApprovedAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireApprovedAdmin();
  const shellData = await getAdminShellData();

  return (
    <AdminShell userEmail={profile.email} shellData={shellData}>
      {children}
    </AdminShell>
  );
}
