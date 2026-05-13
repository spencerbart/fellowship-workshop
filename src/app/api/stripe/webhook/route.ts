import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing webhook secret." }, { status: 500 });
  }

  const stripe = createStripeClient();
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature ?? "", webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    try {
      await syncStripeEvent(event);
    } catch (error) {
      console.error("Stripe webhook sync failed", error);
      return NextResponse.json(
        { error: "Webhook sync failed." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true });
}

async function syncStripeEvent(event: Stripe.Event) {
  const supabase = createAdminClient();
  const stripe = createStripeClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.org_id;

    if (orgId && session.customer) {
      const { error } = await supabase
        .from("organizations")
        .update({ stripe_customer_id: String(session.customer) })
        .eq("id", orgId);

      if (error) {
        throw error;
      }
    }

    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        String(session.subscription),
      );
      await syncSubscription(supabase, subscription);
    }

    return;
  }

  const subscription = event.data.object as Stripe.Subscription;
  await syncSubscription(supabase, subscription);
}

async function syncSubscription(
  supabase: ReturnType<typeof createAdminClient>,
  subscription: Stripe.Subscription,
) {
  const orgId = subscription.metadata?.org_id;

  if (!orgId) {
    return;
  }

  const { error: subscriptionError } = await supabase.from("org_subscriptions").upsert(
    {
      org_id: orgId,
      stripe_customer_id: String(subscription.customer),
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      current_period_end: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );

  if (subscriptionError) {
    throw subscriptionError;
  }

  const { error: organizationError } = await supabase
    .from("organizations")
    .update({ stripe_customer_id: String(subscription.customer) })
    .eq("id", orgId);

  if (organizationError) {
    throw organizationError;
  }
}
