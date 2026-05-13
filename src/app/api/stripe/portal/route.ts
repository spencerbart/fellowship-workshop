import { NextResponse } from "next/server";
import { createAdminClient, getUserFromRequest } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const { user, error: authError } = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const { orgId } = (await request.json()) as { orgId?: string };

  if (!orgId) {
    return NextResponse.json({ error: "Missing organization." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("role, organizations(stripe_customer_id)")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  if (membership.role !== "owner") {
    return NextResponse.json({ error: "Only organization owners can manage billing." }, { status: 403 });
  }

  const organization = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;

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
