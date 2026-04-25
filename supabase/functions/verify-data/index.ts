import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerificationResult {
  table: string;
  total: number;
  synced: number;
  pending: number;
  lastSync: string | null;
  errors: string[];
}

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
    const { syncCheck = false } = await req.json().catch(() => ({}));

    const results: VerificationResult[] = [];
    const errors: string[] = [];

    // Verify ponds table
    try {
      const { data: ponds, error } = await supabaseClient
        .from('ponds')
        .select('id, synced_at, created_at')
        .eq('created_by', user.id);

      if (error) throw error;

      const synced = ponds?.filter(p => p.synced_at).length ?? 0;
      results.push({
        table: 'ponds',
        total: ponds?.length ?? 0,
        synced,
        pending: (ponds?.length ?? 0) - synced,
        lastSync: ponds?.filter(p => p.synced_at).sort((a, b) => 
          new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime()
        )[0]?.synced_at || null,
        errors: [],
      });
    } catch (e) {
      errors.push(`Ponds verification failed: ${e.message}`);
    }

    // Verify mortality entries
    try {
      const { data: entries, error } = await supabaseClient
        .from('mortality_entries')
        .select('id, synced_at')
        .eq('user_id', user.id);

      if (error) throw error;

      const synced = entries?.filter(e => e.synced_at).length ?? 0;
      results.push({
        table: 'mortality_entries',
        total: entries?.length ?? 0,
        synced,
        pending: (entries?.length ?? 0) - synced,
        lastSync: entries?.filter(e => e.synced_at).sort((a, b) => 
          new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime()
        )[0]?.synced_at || null,
        errors: [],
      });
    } catch (e) {
      errors.push(`Mortality entries verification failed: ${e.message}`);
    }

    // Verify harvest entries
    try {
      const { data: entries, error } = await supabaseClient
        .from('harvest_entries')
        .select('id, synced_at')
        .eq('user_id', user.id);

      if (error) throw error;

      const synced = entries?.filter(e => e.synced_at).length ?? 0;
      results.push({
        table: 'harvest_entries',
        total: entries?.length ?? 0,
        synced,
        pending: (entries?.length ?? 0) - synced,
        lastSync: entries?.filter(e => e.synced_at).sort((a, b) => 
          new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime()
        )[0]?.synced_at || null,
        errors: [],
      });
    } catch (e) {
      errors.push(`Harvest entries verification failed: ${e.message}`);
    }

    // Check data integrity if requested
    let integrityCheck = null;
    if (syncCheck) {
      integrityCheck = {
        allSynced: results.every(r => r.pending === 0),
        totalPending: results.reduce((sum, r) => sum + r.pending, 0),
        orphanedRecords: 0, // Would check for records without valid pond references
      };
    }

    const summary = {
      status: errors.length === 0 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      userId: user.id,
      tables: results,
      integrity: integrityCheck,
      errors: errors.length > 0 ? errors : undefined,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
