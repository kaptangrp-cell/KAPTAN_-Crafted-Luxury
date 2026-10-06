import { useCartStore } from "@/stores/cartStore";

type Attempt = {
  key: string;
  fingerprint: string;
  orderId?: string;
  items: Array<{ id: string; quantity: number }>;
};
const STORAGE = "kaptan-checkout-attempt";

export function readAttempt(): Attempt | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE) ?? "null") as Attempt | null;
  } catch {
    return null;
  }
}

export async function prepareAttempt(
  payload: unknown,
  cancel: (orderId: string) => Promise<unknown>,
) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const fingerprint = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const prior = readAttempt();
  if (prior?.fingerprint === fingerprint) return prior.key;
  if (prior?.orderId) await cancel(prior.orderId);
  const attempt: Attempt = {
    key: crypto.randomUUID(),
    fingerprint,
    items: useCartStore.getState().items.map(({ id, quantity }) => ({ id, quantity })),
  };
  sessionStorage.setItem(STORAGE, JSON.stringify(attempt));
  return attempt.key;
}

export function recordAttemptOrder(orderId: string) {
  const attempt = readAttempt();
  if (attempt) sessionStorage.setItem(STORAGE, JSON.stringify({ ...attempt, orderId }));
}

export function forgetAttempt(orderId?: string) {
  if (!orderId || readAttempt()?.orderId === orderId) sessionStorage.removeItem(STORAGE);
}

/** Remove only the purchased quantities, and only once, after server verification. */
export async function finishAttempt(orderId: string) {
  if (!useCartStore.persist.hasHydrated()) await useCartStore.persist.rehydrate();
  const attempt = readAttempt();
  if (attempt?.orderId !== orderId) return;
  const cart = useCartStore.getState();
  for (const purchased of attempt.items) {
    const current = cart.items.find((i) => i.id === purchased.id);
    if (current)
      cart.updateQuantity(current.id, Math.max(0, current.quantity - purchased.quantity));
  }
  forgetAttempt(orderId);
}
