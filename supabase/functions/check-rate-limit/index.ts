// Supabase Edge Function: check-rate-limit
//
// Called once per "Generate" click. Looks at the REAL client IP (from a
// header Supabase's own gateway sets — the browser cannot forge this),
// atomically increments that IP's counter for the current hour, and
// reports whether this request is past the free limit.
//
// Signed-in Pro subscribers are exempt (unlimited generations) — checked
// server-side against the profiles table, not trusted from the client.
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(
        authHeader.replace('Bearer ', ''),
      );
      if (user) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('plan')
          .eq('id', user.id)
          .single();
        if (profile?.plan === 'pro') {
          return new Response(
            JSON.stringify({ count: 0, showAd: false, limit: null, pro: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

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
