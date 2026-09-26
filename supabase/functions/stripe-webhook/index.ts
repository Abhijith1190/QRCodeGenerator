// Supabase Edge Function: stripe-webhook
//
// Stripe calls this directly (not the browser), so it must NOT require a
// Supabase JWT — see supabase/config.toml which sets verify_jwt = false
// for this function. Authenticity is instead verified via Stripe's own
// signature header.
//
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets needed (set once):
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//
// After deploying, copy this function's URL into Stripe Dashboard ->
// Developers -> Webhooks -> Add endpoint, and subscribe it to:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function setPlanByCustomerId(customerId: string, plan: 'free' | 'pro', subscriptionId: string | null, periodEnd: number | null) {
  await supabaseAdmin
    .from('profiles')
    .update({
      plan,
      stripe_subscription_id: subscriptionId,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription && session.customer) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await setPlanByCustomerId(
            session.customer as string,
            'pro',
            subscription.id,
            subscription.current_period_end,
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const active = subscription.status === 'active' || subscription.status === 'trialing';
        await setPlanByCustomerId(
          subscription.customer as string,
          active ? 'pro' : 'free',
          subscription.id,
          subscription.current_period_end,
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await setPlanByCustomerId(subscription.customer as string, 'free', null, null);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Stripe retries on non-2xx, so surface errors instead of failing open here.
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
