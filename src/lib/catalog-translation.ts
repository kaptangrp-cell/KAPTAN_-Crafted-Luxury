import translations from "./i18n/catalog-de.json" with { type: "json" };

const dictionary: Record<string, string> = translations;

/** Keep merchant source copy intact; only use translations of that exact source. */
export function translateCatalogText(text: string | null | undefined, language: string): string {
  if (!text || !language.toLowerCase().startsWith("de")) return text ?? "";
  return text
    .split(/(\r?\n+)/)
    .map((line) => {
      const translated = dictionary[line.trim()];
      if (translated !== undefined) return translated;
      // Variant summaries are composed at runtime, e.g. "Black, Brown".
      const parts = line.split(/,\s*/);
      if (parts.length > 1 && parts.every((part) => dictionary[part.trim()] !== undefined)) {
        return parts.map((part) => dictionary[part.trim()]).join(", ");
      }
      return line;
    })
    .join("");
}
