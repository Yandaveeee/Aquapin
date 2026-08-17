import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parsePeriodDays(period: string) {
  const match = /^(\d+)\s*d$/i.exec(period);
  if (!match) return 30;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 && days <= 365 ? days : 30;
}

function sumBy<T>(rows: T[], getValue: (row: T) => number) {
  return rows.reduce((sum, row) => sum + getValue(row), 0);
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

    const { period = '30d' } = await req.json().catch(() => ({}));
    const days = parsePeriodDays(String(period));
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [pondsResult, mortalityResult, harvestResult, stockingResult, feedLogsResult] = await Promise.all([
      supabaseClient.from('ponds').select('*'),
      supabaseClient.from('mortality_logs').select('*').gte('created_at', sinceIso),
      supabaseClient.from('harvests').select('*').gte('created_at', sinceIso),
      supabaseClient.from('stocking_logs').select('*').gte('created_at', sinceIso),
      supabaseClient.from('feed_logs').select('*').gte('created_at', sinceIso),
    ]);

    if (pondsResult.error) throw pondsResult.error;
    if (mortalityResult.error) throw mortalityResult.error;
    if (harvestResult.error) throw harvestResult.error;
    if (stockingResult.error) throw stockingResult.error;

    const ponds = pondsResult.data ?? [];
    const mortalityLogs = mortalityResult.data ?? [];
    const harvests = harvestResult.data ?? [];
    const stockings = stockingResult.data ?? [];
    const feedLogs = feedLogsResult.error ? [] : feedLogsResult.data ?? [];

    const totalPonds = ponds.length;
    const activePonds = ponds.filter((pond: any) => pond.is_active).length;
    const totalCurrentStock = sumBy(ponds, (pond: any) => Number(pond.current_stock_count ?? 0));
    const totalStocked = sumBy(stockings, (row: any) => Number(row.quantity ?? 0));
    const totalMortality = sumBy(mortalityLogs, (row: any) => Number(row.quantity ?? 0));
    const totalHarvestKg = sumBy(harvests, (row: any) => Number(row.yield_kg ?? 0));
    const feedConsumedKg = sumBy(
      feedLogs.filter((row: any) => row.type === 'consumption'),
      (row: any) => Math.abs(Number(row.quantity_bags ?? 0)) * 25,
    );
    const mortalityRate = totalStocked > 0
      ? (totalMortality / totalStocked) * 100
      : totalCurrentStock > 0
        ? (totalMortality / totalCurrentStock) * 100
        : 0;
    const fcr = totalHarvestKg > 0 && feedConsumedKg > 0 ? feedConsumedKg / totalHarvestKg : null;
    const lowStockPonds = ponds.filter((pond: any) => Number(pond.current_stock_count ?? 0) > 0 && Number(pond.current_stock_count ?? 0) < 1000);

    const insights = [];

    if (mortalityRate > 10 || totalMortality >= 2500) {
      insights.push({
        category: 'mortality',
        title: 'High mortality pressure',
        description: `${totalMortality.toLocaleString()} mortalities were logged in the selected period (${mortalityRate.toFixed(1)}% estimated rate).`,
        severity: mortalityRate > 25 ? 'high' : 'medium',
        action: 'Prioritize water quality checks and compare field logs against stocking baselines.',
      });
    }

    if (lowStockPonds.length > 0) {
      insights.push({
        category: 'stocking',
        title: 'Low-stock ponds need planning',
        description: `${lowStockPonds.length} pond${lowStockPonds.length === 1 ? '' : 's'} are below 1,000 current stock.`,
        severity: 'medium',
        action: 'Use the Feed & Stocking planner to schedule restocking or mark inactive ponds.',
      });
    }

    if (fcr !== null && fcr > 1.8) {
      insights.push({
        category: 'feed',
        title: 'Elevated feed conversion ratio',
        description: `Logged FCR is ${fcr.toFixed(2)} based on feed movement and harvest biomass records.`,
        severity: 'medium',
        action: 'Review feeding logs, harvest weights, and feed wastage reports for the affected period.',
      });
    }

    if (harvests.length === 0 && activePonds > 0) {
      insights.push({
        category: 'harvest',
        title: 'No harvest records in period',
        description: `There are ${activePonds} active ponds but no harvest entries for ${period}.`,
        severity: 'low',
        action: 'Confirm whether the period is between harvest cycles or if field reporting is delayed.',
      });
    }

    const recommendations = [
      'Review ponds flagged by the verification dashboard before approving major stocking decisions.',
      'Keep feed movement logs updated so FCR reports remain reliable.',
      'Compare mortality spikes with pond history entries and weather or water quality notes.',
    ];

    if (feedLogsResult.error) {
      recommendations.unshift('Apply the feed inventory migration so AI reports can include FCR from feed logs.');
    }

    return new Response(JSON.stringify({
      summary: `Aquaculture operations report for ${period}: ${activePonds}/${totalPonds} ponds active, ${totalCurrentStock.toLocaleString()} fish currently tracked, ${totalMortality.toLocaleString()} mortalities, and ${totalHarvestKg.toFixed(1)} kg harvested.`,
      insights,
      trends: {
        period,
        activePonds,
        totalPonds,
        currentStock: totalCurrentStock,
        stockedThisPeriod: totalStocked,
        mortalityCount: totalMortality,
        mortalityRate: Number(mortalityRate.toFixed(1)),
        harvestYieldKg: Number(totalHarvestKg.toFixed(1)),
        feedConsumedKg: Number(feedConsumedKg.toFixed(1)),
        fcr: fcr === null ? null : Number(fcr.toFixed(2)),
        efficiency: Number(Math.max(0, 100 - mortalityRate).toFixed(1)),
      },
      recommendations,
      generatedAt: new Date().toISOString(),
      schemaWarnings: feedLogsResult.error ? [feedLogsResult.error.message] : [],
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
