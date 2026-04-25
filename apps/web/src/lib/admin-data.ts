import type { Json } from "@aquapin/shared";
import type { Database } from "@aquapin/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeAdminSettingSection } from "@/lib/admin-settings";
import { formatSignedDelta, pluralize } from "@/lib/admin-format";

type EventTable = "stocking_logs" | "mortality_logs" | "harvests" | "pond_history";
type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SettingsRow = Pick<
  Database["public"]["Tables"]["admin_settings"]["Row"],
  "section" | "value"
>;
type PendingProfileRow = Pick<
  Database["public"]["Tables"]["public_profiles"]["Row"],
  "id" | "email" | "created_at" | "status"
>;
type PondSummaryRow = Pick<
  Database["public"]["Tables"]["ponds"]["Row"],
  "id" | "name" | "is_active" | "current_stock_count"
>;
type PondHistoryRow = Database["public"]["Tables"]["pond_history"]["Row"];
type ProfileLabelRow = Pick<
  Database["public"]["Tables"]["public_profiles"]["Row"],
  "id" | "email"
>;

const EVENT_TABLES: EventTable[] = ["stocking_logs", "mortality_logs", "harvests", "pond_history"];

export type ShellData = {
  organizationName: string;
  pendingApprovals: number;
  attentionCount: number;
  navBadges: {
    dashboard: number;
    approvals: number;
    settings: number;
  };
};

export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  href: string;
};

export type DashboardAttentionItem = {
  id: string;
  title: string;
  description: string;
  tone: "info" | "warning" | "danger";
  href: string;
  actionLabel: string;
};

export type DashboardTimelineItem = {
  id: string;
  createdAt: string;
  pondName: string;
  actorName: string;
  badge: string;
  tone: "info" | "success" | "warning" | "danger";
  summary: string;
  detail: string;
  rawData: Json | null;
};

export type DashboardOverview = {
  metrics: DashboardMetric[];
  attentionItems: DashboardAttentionItem[];
  recentEvents: DashboardTimelineItem[];
  counts: {
    pendingApprovals: number;
    lowStockCount: number;
    stalePondsCount: number;
    activePonds: number;
    totalPonds: number;
  };
  thresholds: {
    lowStockThreshold: number;
    staleSyncMinutes: number;
  };
  updatedAt: string;
};

function isPlainObject(value: Json | null): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTitleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function readNumber(raw: Record<string, Json>, keys: string[]) {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

function readString(raw: Record<string, Json>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function eventToneForType(eventType: string) {
  const normalized = eventType.toLowerCase();

  if (
    normalized.includes("mortal") ||
    normalized.includes("error") ||
    normalized.includes("critical") ||
    normalized.includes("alert")
  ) {
    return "danger" as const;
  }

  if (normalized.includes("stock") || normalized.includes("approve")) {
    return "success" as const;
  }

  if (normalized.includes("harvest")) {
    return "info" as const;
  }

  return "warning" as const;
}

function summarizeEvent(event: PondHistoryRow, pondName: string) {
  const eventData = isPlainObject(event.event_data) ? event.event_data : {};
  const eventType = event.event_type.toLowerCase();
  const badge = toTitleCase(event.event_type);

  if (eventType.includes("stock")) {
    const quantity = readNumber(eventData, ["quantity", "stockCount", "count"]);
    const species = readString(eventData, ["species", "current_species"]);
    return {
      badge,
      tone: "success" as const,
      summary: quantity
        ? `${pluralize(quantity, "fish")} stocked into ${pondName}.`
        : `Stocking activity recorded for ${pondName}.`,
      detail: species ? `Species: ${species}` : "Stocking parameters updated.",
    };
  }

  if (eventType.includes("mortal")) {
    const quantity = readNumber(eventData, ["quantity", "count", "losses"]);
    const notes = readString(eventData, ["notes", "reason"]);
    return {
      badge,
      tone: "danger" as const,
      summary: quantity
        ? `${pluralize(quantity, "mortality event", "mortality events")} logged for ${pondName}.`
        : `Mortality activity recorded for ${pondName}.`,
      detail: notes ? notes : "Review pond health and follow-up actions.",
    };
  }

  if (eventType.includes("harvest")) {
    const yieldKg = readNumber(eventData, ["yield_kg", "yieldKg", "weightKg"]);
    const fishCount = readNumber(eventData, ["fish_count", "fishCount", "count"]);
    return {
      badge,
      tone: "info" as const,
      summary: yieldKg
        ? `${yieldKg} kg harvested from ${pondName}.`
        : `Harvest activity recorded for ${pondName}.`,
      detail: fishCount
        ? `${pluralize(fishCount, "fish")} counted in the harvest record.`
        : "Harvest totals updated.",
    };
  }

  const notes = readString(eventData, ["notes", "message", "summary"]);
  return {
    badge,
    tone: eventToneForType(event.event_type),
    summary: `${toTitleCase(event.event_type)} recorded for ${pondName}.`,
    detail: notes ?? "Open the event payload for more context.",
  };
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  applyFilters?: (query: any) => any
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (applyFilters) {
    query = applyFilters(query);
  }

  const { count, error } = await query;
  if (error) {
    console.error(`Count failed for ${table}:`, error.message);
    return 0;
  }

  return count ?? 0;
}

async function countEventsBetween(supabase: SupabaseClient, sinceIso: string, untilIso?: string) {
  const counts = await Promise.all(
    EVENT_TABLES.map((table) =>
      countRows(supabase, table, (query) => {
        let nextQuery = query.gte("created_at", sinceIso);
        if (untilIso) {
          nextQuery = nextQuery.lt("created_at", untilIso);
        }

        return nextQuery;
      })
    )
  );

  return counts.reduce((sum, value) => sum + value, 0);
}

async function getSettingsSnapshot(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("section, value")
    .in("section", ["general", "operations", "notifications"]);

  if (error) {
    console.error("Failed to load admin settings snapshot:", error.message);
  }

  const rows = (data ?? []) as SettingsRow[];
  const rowMap = new Map(rows.map((row) => [row.section, row.value]));

  return {
    general: normalizeAdminSettingSection("general", rowMap.get("general")),
    operations: normalizeAdminSettingSection("operations", rowMap.get("operations")),
    notifications: normalizeAdminSettingSection("notifications", rowMap.get("notifications")),
  };
}

async function getStalePonds(supabase: SupabaseClient, staleSyncMinutes: number) {
  const sinceIso = new Date(Date.now() - staleSyncMinutes * 60 * 1000).toISOString();
  const [{ data: activePondsData, error: activePondsError }, { data: recentHistoryData, error: recentHistoryError }] =
    await Promise.all([
      supabase
        .from("ponds")
        .select("id, name, is_active, current_stock_count")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase.from("pond_history").select("pond_id").gte("created_at", sinceIso),
    ]);

  if (activePondsError) {
    console.error("Failed to load active ponds:", activePondsError.message);
  }

  if (recentHistoryError) {
    console.error("Failed to load recent pond history for stale check:", recentHistoryError.message);
  }

  const activePonds = (activePondsData ?? []) as PondSummaryRow[];
  const recentHistoryRows = (recentHistoryData ?? []) as Array<{ pond_id: string }>;
  const recentPondIds = new Set(recentHistoryRows.map((row) => row.pond_id));

  return activePonds.filter((pond) => !recentPondIds.has(pond.id));
}

export async function getAdminShellData(): Promise<ShellData> {
  const supabase = await createSupabaseServerClient();
  const [settingsSnapshot, pendingApprovals, settingsChanges24h] = await Promise.all([
    getSettingsSnapshot(supabase),
    countRows(supabase, "public_profiles", (query) =>
      query.eq("role", "field_staff").eq("status", "pending")
    ),
    countRows(supabase, "admin_settings_audit", (query) =>
      query.gte("changed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ),
  ]);

  const lowStockThreshold = settingsSnapshot.operations.lowStockThreshold;
  const staleSyncMinutes = settingsSnapshot.notifications.staleSyncMinutes;

  const [lowStockCount, stalePonds] = await Promise.all([
    countRows(supabase, "ponds", (query) =>
      query.eq("is_active", true).lt("current_stock_count", lowStockThreshold)
    ),
    getStalePonds(supabase, staleSyncMinutes),
  ]);

  const attentionCount = [pendingApprovals, lowStockCount, stalePonds.length].filter(
    (count) => count > 0
  ).length;

  return {
    organizationName: settingsSnapshot.general.organizationName,
    pendingApprovals,
    attentionCount,
    navBadges: {
      dashboard: attentionCount,
      approvals: pendingApprovals,
      settings: settingsChanges24h,
    },
  };
}

export async function getDashboardOverview(days: number): Promise<DashboardOverview> {
  const supabase = await createSupabaseServerClient();
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const previous24h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const feedSince = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  const [
    settingsSnapshot,
    totalStaff,
    pendingApprovals,
    pendingCreatedLast7d,
    totalPonds,
    activePonds,
    events24h,
    eventsPrevious24h,
    settingsChanges24h,
  ] = await Promise.all([
    getSettingsSnapshot(supabase),
    countRows(supabase, "public_profiles", (query) => query.eq("role", "field_staff")),
    countRows(supabase, "public_profiles", (query) =>
      query.eq("role", "field_staff").eq("status", "pending")
    ),
    countRows(supabase, "public_profiles", (query) =>
      query.eq("role", "field_staff").eq("status", "pending").gte("created_at", since7d)
    ),
    countRows(supabase, "ponds"),
    countRows(supabase, "ponds", (query) => query.eq("is_active", true)),
    countEventsBetween(supabase, since24h),
    countEventsBetween(supabase, previous24h, since24h),
    countRows(supabase, "admin_settings_audit", (query) => query.gte("changed_at", since24h)),
  ]);

  const lowStockThreshold = settingsSnapshot.operations.lowStockThreshold;
  const staleSyncMinutes = settingsSnapshot.notifications.staleSyncMinutes;

  const [
    lowStockCount,
    lowStockPondsResult,
    stalePonds,
    pendingProfilesResult,
    recentEventsResult,
  ] = await Promise.all([
    countRows(supabase, "ponds", (query) =>
      query.eq("is_active", true).lt("current_stock_count", lowStockThreshold)
    ),
    supabase
      .from("ponds")
      .select("id, name, is_active, current_stock_count")
      .eq("is_active", true)
      .lt("current_stock_count", lowStockThreshold)
      .order("current_stock_count", { ascending: true })
      .limit(4),
    getStalePonds(supabase, staleSyncMinutes),
    supabase
      .from("public_profiles")
      .select("id, email, created_at, status")
      .eq("role", "field_staff")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3),
    supabase
      .from("pond_history")
      .select("id, pond_id, event_type, event_data, recorded_by, created_at")
      .gte("created_at", feedSince)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const lowStockPonds = (lowStockPondsResult.data ?? []) as PondSummaryRow[];
  const pendingProfiles = (pendingProfilesResult.data ?? []) as PendingProfileRow[];
  const recentEvents = (recentEventsResult.data ?? []) as PondHistoryRow[];

  if (lowStockPondsResult.error) {
    console.error("Failed to load low-stock ponds:", lowStockPondsResult.error.message);
  }

  if (pendingProfilesResult.error) {
    console.error("Failed to load pending profiles preview:", pendingProfilesResult.error.message);
  }

  if (recentEventsResult.error) {
    console.error("Failed to load dashboard feed:", recentEventsResult.error.message);
  }

  const pondIds = new Set(recentEvents.map((event) => event.pond_id));
  const actorIds = new Set(recentEvents.map((event) => event.recorded_by));

  const pondLabelRows = (
    pondIds.size > 0
      ? ((await supabase.from("ponds").select("id, name").in("id", Array.from(pondIds))).data ?? [])
      : []
  ) as Array<{ id: string; name: string }>;
  const actorLabelRows = (
    actorIds.size > 0
      ? ((await supabase
          .from("public_profiles")
          .select("id, email")
          .in("id", Array.from(actorIds))).data ?? [])
      : []
  ) as ProfileLabelRow[];

  const pondMap = new Map(pondLabelRows.map((row) => [row.id, row.name]));
  const actorMap = new Map(actorLabelRows.map((row) => [row.id, row.email]));

  const timelineItems = recentEvents.map((event) => {
    const pondName = pondMap.get(event.pond_id) ?? `Pond ${event.pond_id.slice(0, 8)}`;
    const actorName = actorMap.get(event.recorded_by) ?? event.recorded_by;
    const summary = summarizeEvent(event, pondName);

    return {
      id: event.id,
      createdAt: event.created_at,
      pondName,
      actorName,
      badge: summary.badge,
      tone: summary.tone,
      summary: summary.summary,
      detail: summary.detail,
      rawData: event.event_data,
    };
  });

  const attentionItems: DashboardAttentionItem[] = [];

  if (pendingApprovals > 0) {
    const pendingPreview =
      pendingProfiles.length > 0
        ? pendingProfiles.map((profile) => profile.email).join(", ")
        : "Review the waiting queue for new field staff accounts.";

    attentionItems.push({
      id: "pending-approvals",
      title: `${pluralize(pendingApprovals, "pending approval")}`,
      description: pendingPreview,
      tone: pendingApprovals > 5 ? "danger" : "warning",
      href: "/admin/approvals?status=pending",
      actionLabel: "Review queue",
    });
  }

  if (lowStockCount > 0) {
    const pondPreview =
      lowStockPonds.length > 0
        ? lowStockPonds
            .map((pond) => `${pond.name} (${pond.current_stock_count ?? "unknown"})`)
            .join(", ")
        : "Inspect low-stock ponds and restocking schedules.";

    attentionItems.push({
      id: "low-stock",
      title: `${pluralize(lowStockCount, "low-stock pond")} below threshold`,
      description: `${pondPreview}. Threshold: ${lowStockThreshold}.`,
      tone: lowStockCount > 3 ? "danger" : "warning",
      href: "#pond-health",
      actionLabel: "Inspect pond health",
    });
  }

  if (stalePonds.length > 0) {
    attentionItems.push({
      id: "stale-activity",
      title: `${pluralize(stalePonds.length, "active pond")} with stale activity`,
      description: `${stalePonds
        .slice(0, 4)
        .map((pond) => pond.name)
        .join(", ")}${stalePonds.length > 4 ? "..." : ""}. No pond history in ${staleSyncMinutes} minutes.`,
      tone: stalePonds.length > 2 ? "danger" : "warning",
      href: "#stale-activity",
      actionLabel: "Review stale ponds",
    });
  }

  if (attentionItems.length === 0) {
    attentionItems.push({
      id: "all-clear",
      title: "No urgent operational blockers",
      description: "Queue pressure, pond thresholds, and recent activity are all within target.",
      tone: "info",
      href: "#feed",
      actionLabel: "Review feed",
    });
  }

  const metrics: DashboardMetric[] = [
    {
      label: "Pending Approvals",
      value: pendingApprovals.toString(),
      detail: "Field staff waiting for admin review",
      trend:
        pendingCreatedLast7d > 0
          ? `${pluralize(pendingCreatedLast7d, "new account")} in 7d`
          : "No new pending accounts this week",
      tone: pendingApprovals > 0 ? "warning" : "success",
      href: "/admin/approvals?status=pending",
    },
    {
      label: "Low-Stock Ponds",
      value: lowStockCount.toString(),
      detail: `Threshold below ${lowStockThreshold} fish`,
      trend:
        lowStockCount > 0
          ? `${pluralize(lowStockCount, "pond")} need restock review`
          : "All active ponds above target",
      tone: lowStockCount > 0 ? "danger" : "success",
      href: "#pond-health",
    },
    {
      label: "Stale Activity",
      value: stalePonds.length.toString(),
      detail: `No pond history in ${staleSyncMinutes} minutes`,
      trend:
        stalePonds.length > 0
          ? `${pluralize(activePonds - stalePonds.length, "active pond")} reporting recently`
          : "All active ponds reporting within target window",
      tone: stalePonds.length > 0 ? "warning" : "success",
      href: "#stale-activity",
    },
    {
      label: "Activity (24h)",
      value: events24h.toString(),
      detail: "Stocking, mortality, harvest, and history records",
      trend: `${formatSignedDelta(events24h - eventsPrevious24h)} vs previous 24h`,
      tone:
        events24h > eventsPrevious24h ? "success" : events24h < eventsPrevious24h ? "warning" : "neutral",
      href: "/admin?days=1",
    },
    {
      label: "Active Ponds",
      value: `${activePonds}/${totalPonds}`,
      detail: `${totalStaff} field staff records supporting operations`,
      trend:
        totalPonds - activePonds > 0
          ? `${pluralize(totalPonds - activePonds, "pond")} inactive`
          : "All ponds marked active",
      tone: "neutral",
      href: "#pond-health",
    },
    {
      label: "Settings Changes",
      value: settingsChanges24h.toString(),
      detail: "Configuration changes captured in the audit trail",
      trend:
        settingsChanges24h > 0 ? "Recent configuration activity detected" : "No config changes in 24h",
      tone: settingsChanges24h > 0 ? "info" : "neutral",
      href: "/admin/settings",
    },
  ];

  return {
    metrics,
    attentionItems,
    recentEvents: timelineItems,
    counts: {
      pendingApprovals,
      lowStockCount,
      stalePondsCount: stalePonds.length,
      activePonds,
      totalPonds,
    },
    thresholds: {
      lowStockThreshold,
      staleSyncMinutes,
    },
    updatedAt: new Date().toISOString(),
  };
}
