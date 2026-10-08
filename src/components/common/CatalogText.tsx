import { useTranslation } from "react-i18next";
import translations from "@/lib/i18n/catalog-de.json";

/** Exact-source translations never replace changed merchant copy with stale descriptions. */
export function CatalogText({ text }: { text: string | null | undefined }) {
  const { i18n } = useTranslation();
  if (!text || !i18n.language.startsWith("de")) return text ?? null;
  const dictionary: Record<string, string> = translations;
  return text
    .split(/(\n+)/)
    .map((line) => dictionary[line.trim()] ?? line)
    .join("");
}
