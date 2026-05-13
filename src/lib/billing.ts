export const activeSubscriptionStatuses = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function isActiveSubscriptionStatus(status: string | null | undefined) {
  return Boolean(status && activeSubscriptionStatuses.has(status));
}
