// Suggestions only: never use OCR output as payment evidence or post it without review.
export type InvoiceHints = {
  supplier: string | null;
  number: string | null;
  date: string | null;
  gross: string | null;
};
export function invoiceHints(text: string): InvoiceHints {
  const lines = text
    .slice(0, 100000)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = (values: string[]) => (new Set(values).size === 1 ? values[0] : null);
  const numbers: string[] = [],
    dates: string[] = [],
    totals: string[] = [],
    suppliers: string[] = [];
  for (const line of lines) {
    const number = line.match(
      /^(?:Rechnungs(?:nummer|[- ]?nr\.?)|Invoice\s*(?:number|no\.?|#)|Kassenzeichen|Aktenzeichen)\s*[:#]?\s+([\w./-]{1,100})\s*$/i,
    );
    if (number) numbers.push(number[1]);
    const supplier = line.match(
      /^(?:Lieferant|Rechnungssteller|Supplier|Seller)\s*:\s*(.{2,200})$/i,
    );
    if (supplier) suppliers.push(supplier[1]);
    const date = line.match(
      /^(?:Rechnungsdatum|Invoice date|Bescheiddatum|Datum)\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\s*$/i,
    );
    if (date) {
      const p = date[1].split(".");
      const iso =
        p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}` : date[1];
      if (!Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso)
        dates.push(iso);
    }
    // Do not mistake subtotal, net, remaining balance, or a payment for invoice total.
    const total = line.match(
      /^(?:Gesamtbetrag|Rechnungsbetrag|Bruttobetrag|Gesamtsumme|Gesamtgebühr|Invoice total|Grand total|Total(?: incl\.? VAT)?)\s*:?\s*(?:EUR|€)?\s*([\d., ]+)\s*(?:EUR|€)?\s*$/i,
    );
    if (total && !/\b(?:USD|GBP|CHF)\b/.test(text)) {
      const raw = total[1].replace(/ /g, "");
      let normalized: string | undefined;
      if (/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(raw) || /^\d+,\d{2}$/.test(raw))
        normalized = raw.replace(/\./g, "").replace(",", ".");
      else if (/^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(raw) || /^\d+\.\d{2}$/.test(raw))
        normalized = raw.replace(/,/g, "");
      if (normalized) {
        const [whole, fraction] = normalized.split(".");
        const value = BigInt(whole) * 100n + BigInt(fraction);
        if (value > 0n && value <= 9000000000000n) totals.push(String(value));
      }
    }
  }
  return {
    supplier: unique(suppliers),
    number: unique(numbers),
    date: unique(dates),
    gross: unique(totals),
  };
}
