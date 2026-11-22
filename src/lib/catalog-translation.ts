import translations from "./i18n/catalog-de.json" with { type: "json" };

const dictionary: Record<string, string> = translations;
const normalizedDictionary = new Map(
  Object.entries(dictionary).map(([source, target]) => [source.trim().toLowerCase(), target]),
);

function translateLine(line: string): string {
  const translated = dictionary[line.trim()] ?? normalizedDictionary.get(line.trim().toLowerCase());
  if (translated !== undefined) return translated;
  // Translate compound option labels without changing sizes, SKUs or unknown copy.
  const parts = line.split(/(\s+\/\s+|,\s*|\s+·\s+)/);
  if (parts.length > 1) {
    return parts
      .map((part, index) =>
        index % 2
          ? part
          : (dictionary[part.trim()] ??
            normalizedDictionary.get(part.trim().toLowerCase()) ??
            part),
      )
      .join("");
  }
  return line;
}

/** Keep merchant source copy intact; only use translations of that exact source. */
export function translateCatalogText(text: string | null | undefined, language: string): string {
  if (!text || !language.toLowerCase().startsWith("de")) return text ?? "";
  return text
    .split(/(\r?\n+)/)
    .map(translateLine)
    .join("");
}
