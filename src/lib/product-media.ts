// Presentation metadata lives in the existing specifications JSON; no schema migration required.
export interface MediaDetail {
  url: string;
  color: string;
  view: string;
  alt: string;
}
export function mediaDetails(specifications: unknown): MediaDetail[] {
  if (!specifications || typeof specifications !== "object") return [];
  const value = (specifications as Record<string, unknown>)._media;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is MediaDetail =>
      !!v &&
      typeof v === "object" &&
      ["url", "color", "view", "alt"].every((k) => typeof v[k] === "string"),
  );
}
export function galleryForColor<T extends { url: string; sort_order?: number | null }>(
  images: T[],
  specifications: unknown,
  color: string,
) {
  const details = mediaDetails(specifications);
  const sorted = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (!color) return sorted;
  const matching = sorted.filter((image) =>
    details.some((d) => d.url === image.url && d.color.toLowerCase() === color.toLowerCase()),
  );
  const shared = sorted.filter((image) => !details.find((d) => d.url === image.url)?.color);
  // Never present a different colour as the selected colour's photograph.
  return [...matching, ...shared];
}
export function colorHex(color: string) {
  const palette: Record<string, string> = {
    black: "#202020",
    schwarz: "#202020",
    brown: "#75452e",
    braun: "#75452e",
    tan: "#bb8957",
    cognac: "#a86032",
    taupe: "#a69a8d",
    beige: "#d9c7a8",
    white: "#f4f1e9",
    weiß: "#f4f1e9",
    blue: "#34566c",
    blau: "#34566c",
    navy: "#26334c",
    red: "#973e3e",
    rot: "#973e3e",
    burgundy: "#602c38",
    green: "#596851",
    grün: "#596851",
    grey: "#868686",
    gray: "#868686",
    grau: "#868686",
    cream: "#eee4d1",
    pink: "#c695a0",
    gold: "#bd9c53",
  };
  return palette[color.trim().toLowerCase()] ?? "linear-gradient(135deg, #b5a48e, #63594c)";
}
