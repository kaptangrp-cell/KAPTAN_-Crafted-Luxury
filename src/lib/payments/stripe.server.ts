import Stripe from "stripe";

let cachedClient: Stripe | null = null;

/**
 * Lazily creates a Stripe client from STRIPE_SECRET_KEY.
 * Returns null when the key isn't configured yet, so callers can fail
 * gracefully instead of crashing the checkout flow.
 */
export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) return null;

  if (!cachedClient) {
    cachedClient = new Stripe(secretKey, {
      apiVersion: "2025-08-27.basil",
    });
  }

  return cachedClient;
}
