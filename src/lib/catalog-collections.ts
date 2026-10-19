export const COLLECTIONS = ["leather", "salt"] as const;
export type Collection = (typeof COLLECTIONS)[number];
/** Preserve database categories and legacy URLs; group only recognised catalogue families. */
export function collectionForCategory(category: {
  name?: string | null;
  slug?: string | null;
}): Collection | null {
  const text = `${category.slug ?? ""} ${category.name ?? ""}`.toLowerCase();
  if (/salt|salz|himalaya/.test(text)) return "salt";
  if (/leather|leder|wallet|bag|belt|kaptan[- ](everyday|work|women|travel|heritage)/.test(text))
    return "leather";
  return null;
}
export function collectionLabel(collection: Collection, de = false) {
  return collection === "leather"
    ? "Kaptan Leather"
    : de
      ? "Kaptan Salzlampen"
      : "Kaptan Salt Lamps";
}
