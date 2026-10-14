import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { unitCode, type UnitLabel } from "@/lib/warehouse";
export function LabelSheet({ labels }: { labels: UnitLabel[] }) {
  const { t } = useTranslation();
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setImages({});
    setError(false);
    void Promise.all(
      labels.map(async (l) => [
        l.id,
        await QRCode.toDataURL(unitCode(l.id), {
          width: 240,
          margin: 4,
          errorCorrectionLevel: "M",
        }),
      ]),
    )
      .then((rows) => {
        if (active) setImages(Object.fromEntries(rows));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [labels]);
  if (!labels.length) return null;
  return (
    <section>
      <button
        disabled={Object.keys(images).length !== labels.length}
        onClick={() => window.print()}
        className="warehouse-button my-4"
      >
        {t("warehouse.print", { count: labels.length })}
      </button>
      {error && <p role="alert">{t("warehouse.labelError")}</p>}
      <div id="warehouse-labels" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {labels.map((l) => (
          <article
            key={l.id}
            className="warehouse-label rounded-lg bg-white p-3 text-center text-black"
          >
            {images[l.id] && (
              <img src={images[l.id]} alt={unitCode(l.id)} className="mx-auto h-28 w-28" />
            )}
            <b className="block text-xs">{l.name}</b>
            <span className="block text-xs">
              {l.variant} · {l.location}
            </span>
            <span className="block break-all text-[8px]">{l.sku}</span>
            <span className="block font-mono text-[8px]">{l.id}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
