import { useTranslation } from "react-i18next";

interface ProductFactsProps {
  specifications?: unknown;
  variants?:
    { variant_type?: string; variant_value?: string; is_available?: boolean | null }[] | null;
  compact?: boolean;
}

export function ProductFacts({ specifications, variants, compact = false }: ProductFactsProps) {
  const { t } = useTranslation();
  const entries =
    specifications && typeof specifications === "object" && !Array.isArray(specifications)
      ? Object.entries(specifications)
      : [];
  function valueFor(keys: string[]) {
    const value = entries.find(([key]) => keys.includes(key.toLowerCase().trim()))?.[1];
    return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  }
  const colors = [
    ...new Set(
      (variants ?? [])
        .filter((v) => v.is_available !== false && /^(colou?r|farbe)$/i.test(v.variant_type ?? ""))
        .map((v) => v.variant_value)
        .filter(Boolean),
    ),
  ].join(", ");
  const facts = [
    { label: "material", value: valueFor(["material", "materials", "composition", "materialien"]) },
    {
      label: "colors",
      value: colors || valueFor(["color", "colour", "colors", "colours", "farbe", "farben"]),
    },
    {
      label: "use",
      value: valueFor(["use", "uses", "ideal for", "usage", "verwendung", "ideal für"]),
    },
    ...(!compact
      ? [
          { label: "dimensions", value: valueFor(["dimensions", "size", "maße", "abmessungen"]) },
          { label: "care", value: valueFor(["care", "pflege", "care instructions"]) },
        ]
      : []),
  ].filter((fact) => fact.value);
  if (!facts.length) return null;
  return (
    <dl
      className={`mt-4 space-y-2 border-t border-gold/10 pt-3 ${compact ? "text-xs" : "text-sm"}`}
    >
      {facts.map(({ label, value }) => (
        <div key={label} className="flex flex-wrap gap-x-2">
          <dt className="text-white/50">{t(`productFacts.${label}`)}</dt>
          <dd className="break-words text-white/80">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
