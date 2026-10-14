import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Invoice } from "./model.ts";
import { money } from "./model.ts";
export async function invoicePdf(
  i: Invoice,
  assets: { inter: Uint8Array; serif: Uint8Array; logo: Uint8Array },
  sample = false,
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(assets.inter, { subset: true }),
    serif = await pdf.embedFont(assets.serif, { subset: true }),
    logo = await pdf.embedPng(assets.logo);
  const gold = rgb(0.67, 0.53, 0.16),
    ink = rgb(0.08, 0.08, 0.08),
    muted = rgb(0.4, 0.4, 0.4);
  let page = pdf.addPage([595.28, 841.89]),
    y = 0;
  const text = (value: string, x: number, yy: number, size = 10, f: PDFFont = font, color = ink) =>
    page.drawText(value, { x, y: yy, size, font: f, color });
  const wrap = (value: string, width: number, size = 10) => {
    const rows: string[] = [];
    let row = "";
    for (const word of value.replace(/[\r\n]+/g, " ").split(" ")) {
      if (font.widthOfTextAtSize(row + (row ? " " : "") + word, size) > width && row) {
        rows.push(row);
        row = "";
      }
      for (const ch of word) {
        if (font.widthOfTextAtSize(row + ch, size) > width) {
          rows.push(row);
          row = "";
        }
        row += ch;
      }
      row += " ";
    }
    if (row.trim()) rows.push(row.trim());
    return rows;
  };
  const header = () => {
    page.drawRectangle({ x: 0, y: 727, width: 596, height: 115, color: ink });
    page.drawImage(logo, { x: 42, y: 756, width: 54, height: 54 });
    text("KAPTAN", 112, 783, 25, serif, gold);
    text("CRAFTED LUXURY", 113, 761, 8, font, rgb(0.8, 0.8, 0.8));
    text(sample ? "MUSTER - NICHT BUCHEN" : i.number, 350, 782, 10, font, rgb(1, 1, 1));
    text(i.issueDate, 350, 760, 10, font, rgb(0.8, 0.8, 0.8));
    y = 698;
  };
  header();
  const ensure = (height: number) => {
    if (y - height < 110) {
      page = pdf.addPage([595.28, 841.89]);
      header();
    }
  };
  const para = (value: string, width = 500, size = 10) => {
    for (const row of wrap(value, width, size)) {
      ensure(16);
      text(row, 44, y, size);
      y -= 15;
    }
    y -= 5;
  };
  text(
    i.kind === "advance"
      ? "Vorauszahlungsrechnung"
      : i.kind === "credit"
        ? "Rechnungskorrektur"
        : "Endrechnung",
    44,
    y,
    24,
    serif,
  );
  y -= 30;
  para(`Bestellung ${i.orderNumber}`, 500, 9);
  para(`${i.seller.name} | ${i.seller.street} | ${i.seller.postalCode} ${i.seller.city}`, 500, 8);
  y -= 6;
  para(i.buyer.legalName);
  para(
    [
      i.buyer.address.line1,
      i.buyer.address.line2,
      `${i.buyer.address.postalCode} ${i.buyer.address.city}`,
      "Deutschland",
    ]
      .filter(Boolean)
      .join(", "),
  );
  if (i.buyer.vatId) para(`USt-IdNr. Kunde: ${i.buyer.vatId}`);
  if (i.buyer.buyerReference) para(`Käuferreferenz / Leitweg-ID: ${i.buyer.buyerReference}`);
  if (i.buyer.purchaseOrder) para(`Bestellreferenz: ${i.buyer.purchaseOrder}`);
  para(
    i.kind === "advance"
      ? `Zahlungseingang: ${i.paidDate}. Lieferung steht noch aus.`
      : `Leistungsdatum: ${i.supplyDate || i.paidDate}`,
  );
  y -= 12;
  const tableHeader = () => {
    ensure(35);
    page.drawRectangle({ x: 44, y: y - 8, width: 507, height: 26, color: rgb(0.96, 0.94, 0.88) });
    text("Artikel / Beschreibung", 50, y, 9);
    text("Menge", 325, y, 9);
    text("Einzel netto", 375, y, 9);
    text("Gesamt netto", 465, y, 9);
    y -= 30;
  };
  tableHeader();
  for (const line of i.lines) {
    const rows = wrap(line.description, 263, 9);
    const height = rows.length * 14 + 18;
    if (y - height < 115) {
      page = pdf.addPage([595.28, 841.89]);
      header();
      tableHeader();
    }
    rows.forEach((r, n) => text(r, 50, y - n * 14, 9));
    text(String(line.quantity), 333, y, 9);
    text(i.lines.length ? line.netUnit.toFixed(2) + " €" : "", 383, y, 9);
    text(money(line.net) + " €", 474, y, 9);
    y -= height;
    page.drawLine({
      start: { x: 44, y: y + 8 },
      end: { x: 551, y: y + 8 },
      color: rgb(0.9, 0.9, 0.9),
      thickness: 0.5,
    });
  }
  y -= 12;
  ensure(160);
  for (const [label, value] of [
    ["Nettobetrag", i.net],
    ["Umsatzsteuer 19 %", i.vat],
    ["Bruttobetrag", i.gross],
    ["Rundung", i.rounding],
    [
      i.kind === "credit" ? "Erstattungsbetrag" : "Bereits bezahlt",
      i.kind === "credit" ? i.due : i.paid,
    ],
    ["Noch zu zahlen", i.kind === "credit" ? 0 : i.due],
  ] as const) {
    text(label, 300, y, 10);
    text(money(value) + " €", 470, y, 10);
    y -= 22;
  }
  y -= 10;
  if (i.reference) {
    para(`Bezug: ${i.reference.number} vom ${i.reference.date}.`);
    if (i.kind === "final")
      para(
        `Vereinnahmte Vorauszahlung vollständig abgesetzt: netto ${money(i.reference.net)} €, USt. ${money(i.reference.vat)} €, brutto ${money(i.reference.gross)} €. Kein weiterer Zahlungsbetrag.`,
      );
  }
  if (i.reason) para(`Korrekturgrund: ${i.reason}`);
  if (i.kind === "credit") para("Die Rechnungskorrektur löst keine automatische Erstattung aus.");
  for (const [n, p] of pdf.getPages().entries()) {
    page = p;
    page.drawLine({ start: { x: 44, y: 88 }, end: { x: 551, y: 88 }, color: gold, thickness: 1 });
    text(`${i.seller.name} | ${i.seller.legalForm}`, 44, 72, 8);
    text(
      `${i.seller.street}, ${i.seller.postalCode} ${i.seller.city} | USt-IdNr. ${i.seller.vatId}`,
      44,
      58,
      8,
    );
    text(`${i.seller.email} | ${i.seller.phone}`, 44, 44, 8);
    text(`${n + 1} / ${pdf.getPageCount()}`, 520, 44, 8);
  }
  pdf.setTitle(`${sample ? "MUSTER " : ""}${i.number}`);
  pdf.setAuthor(i.seller.name);
  return pdf.save();
}
