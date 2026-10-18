import { useTranslation } from "react-i18next";
import { translateCatalogText } from "@/lib/catalog-translation";

export function CatalogText({ text }: { text: string | null | undefined }) {
  const { i18n } = useTranslation();
  return translateCatalogText(text, i18n.language);
}
