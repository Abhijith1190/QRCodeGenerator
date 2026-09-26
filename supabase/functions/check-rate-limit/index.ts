// Supabase Edge Function: check-rate-limit
//
// Called once per "Generate" click. Looks at the REAL client IP (from a
// header Supabase's own gateway sets — the browser cannot forge this),
// atomically increments that IP's counter for the current hour, and
// reports whether this request is past the free limit.
//
// Deploy with the Supabase CLI from the project root:
//   supabase functions deploy check-rate-limit
// (No extra secrets to set — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are automatically available to every Edge Function.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FREE_LIMIT = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: count, error } = await supabaseAdmin.rpc('increment_ip_generation_count', {
      p_ip: ip,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({ count, showAd: count > FREE_LIMIT, limit: FREE_LIMIT }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    // Fail OPEN: if the rate-limit check itself breaks, don't block the
    // core free feature — just skip the ad this time.
    return new Response(
      JSON.stringify({ count: 0, showAd: false, error: String(err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
