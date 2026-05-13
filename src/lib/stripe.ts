import Stripe from "stripe";

export const ownerPlan = {
  name: "Fellowship Owner Plan",
  amount: 500,
  currency: "usd",
  interval: "month" as const,
};

export function createStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY.");
  }

  return new Stripe(secretKey);
}
