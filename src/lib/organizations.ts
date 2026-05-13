import type { SupabaseClient } from "@supabase/supabase-js";

type BillingOrganizationRow = {
  role: string;
  stripe_customer_id: string | null;
};

export async function getBillingOrganization(
  supabase: SupabaseClient,
  orgId: string,
) {
  const { data, error } = await supabase.rpc("get_billing_organization", {
    requested_org_id: orgId,
  });

  if (error) {
    return {
      membership: null,
      organization: null,
      error: error.message,
    };
  }

  const row = (data as BillingOrganizationRow[] | null)?.[0];

  if (!row) {
    return {
      membership: null,
      organization: null,
      error: "Organization not found for this signed-in owner.",
    };
  }

  return {
    membership: { role: row.role },
    organization: { stripe_customer_id: row.stripe_customer_id },
    error: null,
  };
}
