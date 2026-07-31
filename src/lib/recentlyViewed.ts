const STORAGE_KEY = "kaptan_recently_viewed";
const MAX_ITEMS = 20;

function readIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_ITEMS)));
  } catch {
    // Storage full or unavailable (private browsing) — fail silently.
  }
}

/** Records a product view, most-recent-first, de-duplicated. */
export function trackProductView(productId: string) {
  const existing = readIds().filter((id) => id !== productId);
  writeIds([productId, ...existing]);
}

/** Returns recently viewed product IDs, most-recent-first, optionally excluding one. */
export function getRecentlyViewedIds(excludeId?: string, limit = 12): string[] {
  const ids = readIds().filter((id) => id !== excludeId);
  return ids.slice(0, limit);
}
