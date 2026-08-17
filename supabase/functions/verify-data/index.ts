import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Severity = 'info' | 'warning' | 'danger';

type VerificationAlert = {
  id: string;
  pondId?: string;
  pondName?: string;
  severity: Severity;
  type: 'gps_out_of_bounds' | 'high_mortality' | 'harvest_imbalance' | 'impossible_growth' | 'sync_error';
  message: string;
  detail: string;
  createdAt: string;
};

function hasValidBoundary(boundary: unknown) {
  if (typeof boundary !== 'string' || boundary.length === 0) return false;

  try {
    const parsed = JSON.parse(boundary);
    return Array.isArray(parsed) && parsed.length >= 3;
  } catch {
    return false;
  }
}

function lastCreatedAt(rows: Array<{ created_at: string }>) {
  return rows
    .map((row) => row.created_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { staleSyncMinutes = 45 } = await req.json().catch(() => ({}));

    const [pondsResult, mortalityResult, harvestResult, stockingResult, historyResult] = await Promise.all([
      supabaseClient.from('ponds').select('*'),
      supabaseClient.from('mortality_logs').select('*'),
      supabaseClient.from('harvests').select('*'),
      supabaseClient.from('stocking_logs').select('*'),
      supabaseClient.from('pond_history').select('*'),
    ]);

    const errors = [
      pondsResult.error ? `ponds: ${pondsResult.error.message}` : null,
      mortalityResult.error ? `mortality_logs: ${mortalityResult.error.message}` : null,
      harvestResult.error ? `harvests: ${harvestResult.error.message}` : null,
      stockingResult.error ? `stocking_logs: ${stockingResult.error.message}` : null,
      historyResult.error ? `pond_history: ${historyResult.error.message}` : null,
    ].filter(Boolean);

    const ponds = pondsResult.data ?? [];
    const mortalities = mortalityResult.data ?? [];
    const harvests = harvestResult.data ?? [];
    const stockings = stockingResult.data ?? [];
    const history = historyResult.data ?? [];
    const pondMap = new Map(ponds.map((pond: any) => [pond.id, pond]));
    const stockedByPond = new Map<string, number>();
    const lastHistoryByPond = new Map<string, string>();
    const now = Date.now();
    const alerts: VerificationAlert[] = [];

    stockings.forEach((row: any) => {
      if (String(row.status ?? '').toLowerCase() === 'harvested') return;
      stockedByPond.set(row.pond_id, (stockedByPond.get(row.pond_id) ?? 0) + Number(row.quantity ?? 0));
    });

    history.forEach((row: any) => {
      const previous = lastHistoryByPond.get(row.pond_id);
      if (!previous || new Date(row.created_at).getTime() > new Date(previous).getTime()) {
        lastHistoryByPond.set(row.pond_id, row.created_at);
      }
    });

    ponds.forEach((pond: any) => {
      if (!hasValidBoundary(pond.boundary)) {
        alerts.push({
          id: `boundary-${pond.id}`,
          pondId: pond.id,
          pondName: pond.name,
          severity: pond.is_active ? 'warning' : 'info',
          type: 'gps_out_of_bounds',
          message: 'Boundary needs verification',
          detail: `${pond.name} does not have a valid multi-point boundary saved.`,
          createdAt: new Date().toISOString(),
        });
      }

      if (pond.is_active) {
        const lastHistoryAt = lastHistoryByPond.get(pond.id);
        const staleMinutes = lastHistoryAt
          ? Math.round((now - new Date(lastHistoryAt).getTime()) / 60000)
          : Number.POSITIVE_INFINITY;

        if (!lastHistoryAt || staleMinutes > Number(staleSyncMinutes)) {
          alerts.push({
            id: `stale-${pond.id}`,
            pondId: pond.id,
            pondName: pond.name,
            severity: 'warning',
            type: 'sync_error',
            message: 'Stale pond activity',
            detail: lastHistoryAt
              ? `${pond.name} has no pond history update for ${staleMinutes.toLocaleString()} minutes.`
              : `${pond.name} has no pond history records.`,
            createdAt: lastHistoryAt ?? new Date().toISOString(),
          });
        }
      }
    });

    mortalities.forEach((row: any) => {
      const pond: any = pondMap.get(row.pond_id);
      const stocked = stockedByPond.get(row.pond_id) ?? Number(pond?.current_stock_count ?? 0);
      const mortalityRate = stocked > 0 ? (Number(row.quantity) / stocked) * 100 : 0;
      const threshold = Math.max(500, stocked * 0.1);

      if (Number(row.quantity) >= threshold) {
        alerts.push({
          id: `mortality-${row.id}`,
          pondId: row.pond_id,
          pondName: pond?.name,
          severity: mortalityRate >= 25 || Number(row.quantity) >= 2500 ? 'danger' : 'warning',
          type: 'high_mortality',
          message: 'High mortality detected',
          detail: stocked > 0
            ? `${Number(row.quantity).toLocaleString()} mortalities represent ${mortalityRate.toFixed(1)}% of tracked stock.`
            : `${Number(row.quantity).toLocaleString()} mortalities were logged without an active stocking baseline.`,
          createdAt: row.created_at,
        });
      }
    });

    harvests.forEach((row: any) => {
      const pond: any = pondMap.get(row.pond_id);
      const currentStock = Number(pond?.current_stock_count ?? 0);
      const fishCount = Number(row.fish_count ?? 0);
      const yieldKg = Number(row.yield_kg ?? 0);

      if (fishCount > 0 && currentStock > 0 && row.is_partial && fishCount > currentStock * 1.5) {
        alerts.push({
          id: `harvest-imbalance-${row.id}`,
          pondId: row.pond_id,
          pondName: pond?.name,
          severity: 'warning',
          type: 'harvest_imbalance',
          message: 'Harvest count exceeds remaining stock',
          detail: `${fishCount.toLocaleString()} harvested fish were logged while the pond shows ${currentStock.toLocaleString()} fish remaining.`,
          createdAt: row.created_at,
        });
      }

      if (fishCount > 0) {
        const kgPerFish = yieldKg / fishCount;
        if (kgPerFish > 2 || kgPerFish < 0.02) {
          alerts.push({
            id: `growth-${row.id}`,
            pondId: row.pond_id,
            pondName: pond?.name,
            severity: 'warning',
            type: 'impossible_growth',
            message: 'Harvest weight needs review',
            detail: `Average harvest weight is ${kgPerFish.toFixed(2)} kg/fish.`,
            createdAt: row.created_at,
          });
        }
      }
    });

    const dangerCount = alerts.filter((alert) => alert.severity === 'danger').length;
    const status = errors.length > 0 || dangerCount > 0
      ? 'critical'
      : alerts.length > 0
        ? 'degraded'
        : 'healthy';

    return new Response(JSON.stringify({
      status,
      timestamp: new Date().toISOString(),
      userId: user.id,
      tables: [
        { table: 'ponds', total: ponds.length, lastRecord: lastCreatedAt(ponds) },
        { table: 'stocking_logs', total: stockings.length, lastRecord: lastCreatedAt(stockings) },
        { table: 'mortality_logs', total: mortalities.length, lastRecord: lastCreatedAt(mortalities) },
        { table: 'harvests', total: harvests.length, lastRecord: lastCreatedAt(harvests) },
        { table: 'pond_history', total: history.length, lastRecord: lastCreatedAt(history) },
      ],
      alerts,
      syncErrors: alerts.filter((alert) => alert.type === 'sync_error').length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
