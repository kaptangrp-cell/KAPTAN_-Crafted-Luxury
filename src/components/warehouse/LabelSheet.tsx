import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { useTranslation } from "react-i18next";
import type { UnitLabel } from "@/lib/warehouse";
import "./barcode-labels.css";

const names: Record<string, [string, string]> = {
  BSL: ["Kugel-Salzlampe", "Ball Salt Lamp"],
  CYL: ["Zylinder-Salzlampe", "Cylinder Salt Lamp"],
  CUB: ["Würfel-Salzlampe", "Cube Salt Lamp"],
  PCL: ["Penny Cube Salzlampe", "Penny Cube Lamp"],
  FBL: ["Schalenlampe", "Fire Bowl Lamp"],
  CSL: ["Kamel-Motiv Lampe", "Camel Scenery Lamp"],
  HCH: ["Kerzenhalter Herz", "Heart Candle Holder"],
  SCH: ["Kerzenhalter Stern", "Star Candle Holder"],
  CLB: ["Klassischer Ledergürtel", "Classic Leather Belt"],
  LLB: ["Leder-Laptoptasche", "Leather Laptop Bag"],
};
const colours: Record<string, string> = {
  PK: "PINK / ROSA",
  BK: "BLACK / SCHWARZ",
  BR: "BROWN / BRAUN",
  GR: "GREEN / GRÜN",
  BL: "BLUE / BLAU",
  WH: "WHITE / WEISS",
  BE: "BEIGE",
  RD: "RED / ROT",
  GY: "GREY / GRAU",
};
export function LabelSheet({ labels }: { labels: UnitLabel[] }) {
  const { t, i18n } = useTranslation();
  const printSheet = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    try {
      const result: Record<string, string> = {};
      for (const label of labels) {
        if (!label.unit_number) throw new Error("Missing unit number");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, label.unit_number, {
          format: "CODE128",
          width: 2,
          height: 100,
          displayValue: false,
          margin: 20,
          background: "#ffffff",
          lineColor: "#000000",
        });
        result[label.id] =
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      }
      setImages(result);
    } catch {
      setImages({});
      setError(true);
    }
  }, [labels]);
  if (!labels.length) return null;
  return (
    <section>
      <p className="mt-4 text-sm text-muted-foreground">
        {i18n.resolvedLanguage?.startsWith("de")
          ? "Barcode-Etiketten · 76 × 51 mm · Mit 100 % / tatsächlicher Größe drucken. Nachdrucke behalten dieselbe Artikelnummer."
          : "Barcode labels · 76 × 51 mm · Print at 100% / actual size. Reprints keep the same unit number."}
      </p>
      <button
        disabled={Object.keys(images).length !== labels.length}
        onClick={() => {
          const sheet = printSheet.current;
          if (!sheet) return;
          sheet.id = "warehouse-labels";
          try {
            window.print();
          } finally {
            sheet.removeAttribute("id");
          }
        }}
        className="warehouse-button my-4"
      >
        {t("warehouse.print", { count: labels.length })}
      </button>
      {error && <p role="alert">{t("warehouse.labelError")}</p>}
      <div ref={printSheet} className="barcode-sheet">
        {labels.map((l) => {
          const parts = l.unit_number?.split("-") ?? [];
          const title = parts[0] === "KP" ? names[parts[1]] : undefined;
          const option =
            parts[0] === "KP" ? `${colours[parts[2]] ?? l.variant} · SIZE ${parts[3]}` : l.variant;
          return (
            <article key={l.id} className="warehouse-label barcode-label">
              <header className="barcode-label-heading">
                <img src="/kaptan-logo.png" alt="KAPTAN" className="barcode-brand" />
                <div>
                  <h3>{title?.[0] ?? l.name}</h3>
                  {title && <b>{title[1]}</b>}
                  <p>{option}</p>
                </div>
              </header>
              {images[l.id] && (
                <img src={images[l.id]} alt={`Barcode ${l.unit_number}`} className="barcode-bars" />
              )}
              <strong className="barcode-number">{l.unit_number}</strong>
              <footer>KAPTAN · KAPTANGRP.COM</footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
