import { NextResponse } from "next/server";
import { getBillingOrganization } from "@/lib/organizations";
import { getBearerToken, getUserFromRequest } from "@/lib/supabase/admin";
import { createUserRequestClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

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

  if (!organization?.stripe_customer_id) {
    return NextResponse.json({ error: "Start a subscription before opening billing." }, { status: 400 });
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const stripe = createStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: organization.stripe_customer_id,
    return_url: `${origin}/owner?org=${orgId}`,
  });

  return NextResponse.json({ url: session.url });
}
