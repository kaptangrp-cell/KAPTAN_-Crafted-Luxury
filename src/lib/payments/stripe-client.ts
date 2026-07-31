import { loadStripe, type Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Lazily loads Stripe.js on the client using the publishable key.
 * Returns null (never rejects) when the key isn't configured, so callers
 * can gate express-checkout UI without crashing the page.
 */
export function getStripeJs(): Promise<Stripe | null> {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  if (!key) return Promise.resolve(null);
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}
