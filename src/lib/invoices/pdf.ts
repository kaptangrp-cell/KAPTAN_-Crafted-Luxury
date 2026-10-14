import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Invoice } from "./model.ts";
import { germanMoney as money, germanDate } from "./model.ts";
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
    text("HOCHWERTIGE LEDERWAREN", 113, 761, 8, font, rgb(0.8, 0.8, 0.8));
    text("RECHNUNG", 391, 793, 16, font, rgb(1, 1, 1));
    text(i.number, 350, 771, 9, font, rgb(0.8, 0.8, 0.8));
    text(
      sample ? "MUSTER - NICHT BUCHEN" : `Datum: ${germanDate(i.issueDate)}`,
      350,
      750,
      9,
      font,
      gold,
    );
    // Leave a clear white gap below the dark brand header on every page.
    y = 675;
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
  y -= 36;
  para(`Bestellung ${i.orderNumber}`, 500, 9);
  const columnTop = y - 18;
  const column = (label: string, values: string[], x: number, width: number) => {
    let cursor = columnTop;
    text(label, x, cursor, 9, font, muted);
    cursor -= 23;
    for (const value of values) {
      for (const row of wrap(value, width, 10)) {
        text(row, x, cursor, 10);
        cursor -= 15;
      }
      cursor -= 5;
    }
    return cursor;
  };
  const sellerBottom = column(
    "Verkäufer",
    [
      i.seller.name,
      i.seller.street,
      `${i.seller.postalCode} ${i.seller.city}`,
      `Steuernummer: ${i.seller.taxNumber}`,
    ],
    44,
    230,
  );
  const buyerBottom = column(
    "Rechnungsempfänger",
    [
      i.buyer.legalName,
      i.buyer.address.line1,
      ...(i.buyer.address.line2 ? [i.buyer.address.line2] : []),
      `${i.buyer.address.postalCode} ${i.buyer.address.city}`,
      `Rechnungsdatum: ${germanDate(i.issueDate)}`,
    ],
    314,
    237,
  );
  y = Math.min(sellerBottom, buyerBottom) - 44;
  if (i.buyer.vatId) para(`USt-IdNr. Kunde: ${i.buyer.vatId}`);
  if (i.buyer.buyerReference) para(`Käuferreferenz / Leitweg-ID: ${i.buyer.buyerReference}`);
  if (i.buyer.purchaseOrder) para(`Bestellreferenz: ${i.buyer.purchaseOrder}`);
  para(
    i.kind === "advance"
      ? `Zahlungseingang: ${germanDate(i.paidDate)}. Lieferung steht noch aus.`
      : `Leistungsdatum: ${germanDate(i.supplyDate || i.paidDate)}`,
  );
  y -= 24;
  const tableHeader = () => {
    ensure(35);
    page.drawRectangle({ x: 44, y: y - 8, width: 507, height: 26, color: rgb(0.96, 0.94, 0.88) });
    text("Artikel / Beschreibung", 50, y, 9);
    text("Menge", 325, y, 9);
    text(i.taxMode === "kleinunternehmer" ? "Einzelpreis" : "Einzel netto", 375, y, 9);
    text(i.taxMode === "kleinunternehmer" ? "Gesamt" : "Gesamt netto", 465, y, 9);
    y -= 38;
  };
  tableHeader();
  for (const line of i.lines) {
    const rows = wrap(line.description, 263, 9);
    const height = rows.length * 14 + 30;
    if (y - height < 115) {
      page = pdf.addPage([595.28, 841.89]);
      header();
      tableHeader();
    }
    rows.forEach((r, n) => text(r, 50, y - n * 14, 9));
    text(String(line.quantity), 333, y, 9);
    const unitText =
      new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(
        line.netUnit,
      ) + " €";
    text(unitText, 455 - font.widthOfTextAtSize(unitText, 8), y, 8);
    const lineText = money(line.net) + " €";
    text(lineText, 545 - font.widthOfTextAtSize(lineText, 9), y, 9);
    y -= height;
    page.drawLine({
      start: { x: 44, y: y + 16 },
      end: { x: 551, y: y + 16 },
      color: rgb(0.9, 0.9, 0.9),
      thickness: 0.5,
    });
  }
  y -= 24;
  // Exempt invoices have three summary rows; avoid an unnecessary second page.
  ensure(i.taxMode === "kleinunternehmer" ? 125 : 175);
  for (const [label, value] of [
    ...(i.taxMode === "kleinunternehmer"
      ? [["Gesamtbetrag", i.gross] as const]
      : [
          ["Nettobetrag", i.net] as const,
          ["Umsatzsteuer 19 %", i.vat] as const,
          ["Bruttobetrag", i.gross] as const,
          ["Rundung", i.rounding] as const,
        ]),
    [
      i.kind === "credit" ? "Erstattungsbetrag" : "Bereits bezahlt",
      i.kind === "credit" ? i.due : i.paid,
    ],
    ["Noch zu zahlen", i.kind === "credit" ? 0 : i.due],
  ] as const) {
    const important = label === "Gesamtbetrag" || label === "Bruttobetrag";
    const size = important ? 15 : 10;
    text(label, 300, y, size, font, important ? gold : ink);
    const formatted = money(value) + " €";
    text(
      formatted,
      545 - font.widthOfTextAtSize(formatted, size),
      y,
      size,
      font,
      important ? gold : ink,
    );
    y -= important ? 29 : 22;
  }
  y -= 10;
  if (i.exemptionReason) para(i.exemptionReason);
  if (i.reference) {
    para(`Bezug: ${i.reference.number} vom ${germanDate(i.reference.date)}.`);
    if (i.kind === "final")
      para(
        i.taxMode === "kleinunternehmer"
          ? `Vereinnahmte Vorauszahlung vollständig abgesetzt: ${money(i.reference.gross)} €. Kein weiterer Zahlungsbetrag.`
          : `Vereinnahmte Vorauszahlung vollständig abgesetzt: netto ${money(i.reference.net)} €, USt. ${money(i.reference.vat)} €, brutto ${money(i.reference.gross)} €. Kein weiterer Zahlungsbetrag.`,
      );
  }
  if (i.reason) para(`Korrekturgrund: ${i.reason}`);
  if (i.kind === "credit") para("Die Rechnungskorrektur löst keine automatische Erstattung aus.");
  for (const [n, p] of pdf.getPages().entries()) {
    page = p;
    page.drawLine({ start: { x: 44, y: 88 }, end: { x: 551, y: 88 }, color: gold, thickness: 1 });
    text(`${i.seller.name} | ${i.seller.legalForm}`, 44, 72, 8);
    text(
      `${i.seller.street}, ${i.seller.postalCode} ${i.seller.city} | Steuernummer: ${i.seller.taxNumber}`,
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
