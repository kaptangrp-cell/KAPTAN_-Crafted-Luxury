import { useState } from "react";
import { useTranslation } from "react-i18next";

export function OptionMultiSelect({
  label,
  presets,
  values,
  onChange,
}: {
  label: string;
  presets: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const de = i18n.language.startsWith("de");
  const [custom, setCustom] = useState("");
  const choices = [
    ...new Map([...presets, ...values].map((value) => [value.toLowerCase(), value])).values(),
  ];
  const add = () => {
    const value = custom.trim();
    if (
      !value ||
      value.includes("/") ||
      values.some((v) => v.toLowerCase() === value.toLowerCase())
    )
      return;
    onChange([...values, value]);
    setCustom("");
  };
  return (
    <fieldset className="rounded-xl border border-gold/20 p-3">
      <legend className="px-1 text-xs uppercase tracking-wider text-gold/70">{label}</legend>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-white/50">
          {values.length} {de ? "ausgewählt" : "selected"}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange([...choices])}
            disabled={choices.length === values.length}
            className="min-h-10 text-gold disabled:opacity-40"
          >
            {de ? "Alle auswählen" : "Select all"}
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={!values.length}
            className="min-h-10 text-white/60 disabled:opacity-40"
          >
            {de ? "Auswahl aufheben" : "Clear selection"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {choices.map((value) => {
          const selected = values.some((v) => v.toLowerCase() === value.toLowerCase());
          return (
            <button
              type="button"
              key={value.toLowerCase()}
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? values.filter((v) => v.toLowerCase() !== value.toLowerCase())
                    : [...values, value],
                )
              }
              className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${selected ? "border-gold bg-gold text-black" : "border-gold/25 text-white/75 hover:border-gold"}`}
            >
              {value}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          aria-label={`${label}: ${t("options.custom")}`}
          placeholder={t("options.custom")}
          maxLength={70}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-gold/20 bg-black px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          disabled={!custom.trim() || custom.includes("/")}
          onClick={add}
          className="rounded-lg border border-gold/30 px-3 text-sm text-gold disabled:opacity-40"
        >
          {t("options.addValue")}
        </button>
      </div>
    </fieldset>
  );
}
