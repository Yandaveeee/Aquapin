import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user from auth
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get request body
    const { farmId, period = '30d' } = await req.json();

    // Fetch pond data
    const { data: ponds, error: pondsError } = await supabaseClient
      .from('ponds')
      .select('*')
      .eq('created_by', user.id);

    if (pondsError) throw pondsError;

    // Fetch mortality entries
    const { data: mortalityEntries, error: mortalityError } = await supabaseClient
      .from('mortality_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (mortalityError) throw mortalityError;

    // Fetch harvest entries
    const { data: harvestEntries, error: harvestError } = await supabaseClient
      .from('harvest_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (harvestError) throw harvestError;

    // Calculate metrics
    const totalPonds = ponds?.length ?? 0;
    const totalMortality = mortalityEntries?.reduce((sum, e) => sum + (e.count || 0), 0) ?? 0;
    const totalHarvest = harvestEntries?.reduce((sum, e) => sum + (e.amount_kg || 0), 0) ?? 0;
    const mortalityRate = totalPonds > 0 ? (totalMortality / (totalPonds * 1000)) * 100 : 0;

    // AI Analysis (mock for now - would integrate with OpenAI/Claude)
    const insights = [];

    if (mortalityRate > 5) {
      insights.push({
        category: 'mortality',
        title: 'High Mortality Alert',
        description: `Mortality rate of ${mortalityRate.toFixed(1)}% exceeds recommended threshold of 5%.`,
        severity: 'high',
        action: 'Immediate water quality testing and veterinary inspection recommended.',
      });
    }

    if (totalHarvest < 100) {
      insights.push({
        category: 'harvest',
        title: 'Low Harvest Yield',
        description: 'Harvest yield is below expected levels for the reporting period.',
        severity: 'medium',
        action: 'Review feeding protocols and growth monitoring.',
      });
    }

    // Generate recommendations
    const recommendations = [
      'Maintain daily water quality monitoring logs',
      'Schedule regular health checks for fish stock',
      'Optimize feeding schedules based on growth data',
    ];

    if (mortalityRate > 3) {
      recommendations.unshift('Investigate and address mortality causes immediately');
    }

    const report = {
      summary: `Farm analysis for period: ${period}. Managing ${totalPonds} ponds with ${mortalityRate.toFixed(1)}% mortality rate and ${totalHarvest.toFixed(1)}kg total harvest.`,
      insights,
      trends: {
        period,
        mortalityRate: parseFloat(mortalityRate.toFixed(1)),
        harvestYield: parseFloat(totalHarvest.toFixed(1)),
        efficiency: parseFloat((100 - mortalityRate).toFixed(1)),
      },
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(report), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
