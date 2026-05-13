import { NextResponse } from "next/server";
import { getBillingOrganization } from "@/lib/organizations";
import { getBearerToken, getUserFromRequest } from "@/lib/supabase/admin";
import { createUserRequestClient } from "@/lib/supabase/server";
import { createStripeClient, ownerPlan } from "@/lib/stripe";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  const { user, error: authError } = await getUserFromRequest(request);

  if (!token || !user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { orgId } = (await request.json()) as { orgId?: string };

  if (!orgId) {
    return NextResponse.json({ error: "Missing organization." }, { status: 400 });
  }

  const supabase = createUserRequestClient(token);
  const { membership, organization, error } = await getBillingOrganization(
    supabase,
    orgId,
  );

  if (error || !membership || !organization) {
    return NextResponse.json(
      { error: error ?? "Organization not found." },
      { status: 404 },
    );
  }

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only organization owners can manage billing." }, { status: 403 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const stripe = createStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: organization?.stripe_customer_id ?? undefined,
    customer_email: organization?.stripe_customer_id ? undefined : user.email ?? undefined,
    client_reference_id: orgId,
    line_items: [
      process.env.STRIPE_PRICE_ID
        ? { price: process.env.STRIPE_PRICE_ID, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: ownerPlan.currency,
              unit_amount: ownerPlan.amount,
              recurring: { interval: ownerPlan.interval },
              product_data: { name: ownerPlan.name },
            },
          },
    ],
    metadata: {
      org_id: orgId,
      user_id: user.id,
    },
    subscription_data: {
      metadata: {
        org_id: orgId,
        user_id: user.id,
      },
    },
    success_url: `${origin}/owner?checkout=success&org=${orgId}`,
    cancel_url: `${origin}/owner?checkout=canceled&org=${orgId}`,
  });

  return NextResponse.json({ url: session.url });
}
