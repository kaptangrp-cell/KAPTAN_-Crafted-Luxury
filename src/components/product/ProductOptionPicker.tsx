import { useState } from "react";
import { useTranslation } from "react-i18next";
import { activeOptions, optionParts, type ProductOption } from "@/lib/product-options";

export function ProductOptionPicker({
  options,
  selectedId,
  onChange,
}: {
  options: ProductOption[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [color, setColor] = useState("");
  const visible = activeOptions(options);
  const parts = visible.map(optionParts);
  const colors = [...new Set(parts.map((p) => p.color).filter((v): v is string => Boolean(v)))];
  const structured =
    parts.length > 0 &&
    parts.every(
      (p) =>
        Boolean(p.color) === Boolean(parts[0].color) &&
        Boolean(p.size) === Boolean(parts[0].size) &&
        (p.color || p.size),
    );
  const selected = visible.find((v) => v.id === selectedId);
  const currentColor = selected ? (optionParts(selected).color ?? color) : color;
  const sizes = [
    ...new Set(
      visible
        .filter((v) => !colors.length || optionParts(v).color === currentColor)
        .map((v) => optionParts(v).size)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const style = (pressed: boolean) =>
    `min-h-11 rounded-lg border px-4 py-2 text-sm transition-colors ${pressed ? "border-gold bg-gold text-black" : "border-gold/30 text-white hover:border-gold"} disabled:cursor-not-allowed disabled:opacity-40`;
  if (!options.length) return null;
  if (!visible.length) return <p className="mt-6 text-sm text-white/60">{t("options.none")}</p>;
  return (
    <div className="mt-6 space-y-4">
      {structured ? (
        <>
          {!!colors.length && (
            <fieldset>
              <legend className="mb-2 text-xs uppercase tracking-wider text-gold/70">
                {t("options.color")}
              </legend>
              <div className="flex flex-wrap gap-2">
                {colors.map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={style(currentColor === value)}
                    aria-pressed={currentColor === value}
                    disabled={
                      !visible.some((v) => optionParts(v).color === value && v.stock_quantity !== 0)
                    }
                    onClick={() => {
                      setColor(value);
                      const match = visible.find(
                        (v) => optionParts(v).color === value && !optionParts(v).size,
                      );
                      onChange(match?.id ?? null);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {parts.some((p) => p.size) && (
            <fieldset>
              <legend className="mb-2 text-xs uppercase tracking-wider text-gold/70">
                {t("options.size")}
              </legend>
              {colors.length > 0 && !currentColor ? (
                <p className="text-sm text-white/60">{t("options.chooseColor")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sizes.map((value) => {
                    const match = visible.find(
                      (v) =>
                        optionParts(v).size === value &&
                        (!colors.length || optionParts(v).color === currentColor),
                    );
                    return (
                      <button
                        type="button"
                        key={value}
                        className={style(selectedId === match?.id)}
                        aria-pressed={selectedId === match?.id}
                        disabled={match?.stock_quantity === 0}
                        onClick={() => onChange(match?.id ?? null)}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          )}
        </>
      ) : (
        <fieldset>
          <legend className="mb-2 text-xs uppercase tracking-wider text-gold/70">
            {t("options.choose")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {visible.map((v) => (
              <button
                type="button"
                key={v.id}
                className={style(selectedId === v.id)}
                aria-pressed={selectedId === v.id}
                disabled={v.stock_quantity === 0}
                onClick={() => onChange(v.id)}
              >
                {v.variant_value}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
