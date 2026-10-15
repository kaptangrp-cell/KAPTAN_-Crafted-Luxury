import { z } from "zod";
export const BankMapping = z
  .object({
    delimiter: z.enum([";", ",", "\t"]),
    dateColumn: z.number().int().min(0).max(99),
    amountColumn: z.number().int().min(0).max(99),
    referenceColumn: z.number().int().min(0).max(99),
    idColumn: z.number().int().min(0).max(99).nullable(),
    currencyColumn: z.number().int().min(0).max(99).nullable(),
    dateFormat: z.enum(["iso", "german", "us", "iso_timestamp"]),
    decimalFormat: z.enum(["german", "english"]),
    provider: z.enum(["custom", "revolut", "paypal"]).default("custom"),
    feeColumn: z.number().int().min(0).max(99).nullable().default(null),
    grossColumn: z.number().int().min(0).max(99).nullable().default(null),
    statusColumn: z.number().int().min(0).max(99).nullable().default(null),
    typeColumn: z.number().int().min(0).max(99).nullable().default(null),
    impactColumn: z.number().int().min(0).max(99).nullable().default(null),
  })
  .refine(
    (m) =>
      m.dateColumn !== m.amountColumn &&
      m.referenceColumn !== m.amountColumn &&
      m.referenceColumn !== m.dateColumn,
    "Use separate date, amount and reference columns",
  );
export type BankMapping = z.infer<typeof BankMapping>;
/** RFC-style quoted fields, including newlines and escaped quotes; no guessing. */
export function parseCsv(input: string, delimiter: string) {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > 100) throw new Error("Maximum 100 columns");
  };
  const pushRow = () => {
    pushCell();
    if (row.some((v) => v.trim())) rows.push(row);
    row = [];
    if (rows.length > 1001) throw new Error("Maximum 1,000 transactions per statement");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === delimiter) pushCell();
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed CSV quoting");
      cell += c;
    }
    if (cell.length > 20000) throw new Error("CSV field too long");
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell || row.length || closed) pushRow();
  if (rows.length < 2) throw new Error("Header and at least one transaction required");
  const headers = rows.shift()!.map((v) => v.trim());
  if (headers.some((v) => !v) || new Set(headers).size !== headers.length)
    throw new Error("Headers must be non-empty and unique");
  if (rows.some((r) => r.length !== headers.length))
    throw new Error("CSV rows have different column counts");
  return { headers, rows };
}
export function bankAmount(raw: string, format: "german" | "english"): string {
  const text = raw.trim();
  const pattern =
    format === "german"
      ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
      : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(text)) throw new Error("Amount does not match selected decimal format");
  const normalized =
    format === "german" ? text.replaceAll(".", "").replace(",", ".") : text.replaceAll(",", "");
  const negative = normalized.startsWith("-"),
    [whole, fraction = ""] = normalized.replace(/^[+-]/, "").split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (value > 9000000000000n) throw new Error("Amount too large");
  return (negative ? -value : value).toString();
}
function bankDate(raw: string, format: BankMapping["dateFormat"]) {
  let value = raw.trim();
  if (format === "german") {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(value)) throw new Error("Use DD.MM.YYYY dates");
    value = value.split(".").reverse().join("-");
  }
  if (format === "iso_timestamp") {
    if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(value))
      throw new Error("Use a local ISO date/time without timezone suffix");
    value = value.slice(0, 10);
  }
  if (format === "us") {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) throw new Error("Use MM/DD/YYYY dates");
    const [m, d, y] = value.split("/");
    value = `${y}-${m}-${d}`;
  }
  return z.string().date().parse(value);
}
export function mapBankCsv(text: string, mapping: BankMapping) {
  const m = BankMapping.parse(mapping),
    { headers, rows } = parseCsv(text, m.delimiter);
  for (const col of [
    m.dateColumn,
    m.amountColumn,
    m.referenceColumn,
    m.idColumn,
    m.currencyColumn,
    m.feeColumn,
    m.grossColumn,
    m.statusColumn,
    m.typeColumn,
    m.impactColumn,
  ])
    if (col !== null && col >= headers.length) throw new Error("Mapped column does not exist");
  return rows.map((row, index) => {
    try {
      if (m.currencyColumn !== null && row[m.currencyColumn].trim().toUpperCase() !== "EUR")
        throw new Error("Only EUR statements are supported");
      if (
        m.provider !== "custom" &&
        (m.currencyColumn === null || m.statusColumn === null || m.typeColumn === null)
      )
        throw new Error("Provider imports require currency, status and type columns");
      if (
        m.statusColumn !== null &&
        !/^(completed|abgeschlossen)$/i.test(row[m.statusColumn].trim())
      )
        throw new Error("Only completed transactions can be imported; review status in original");
      if (
        m.impactColumn !== null &&
        /^(memo|neutral|keine auswirkung)$/i.test(row[m.impactColumn].trim())
      )
        throw new Error("Non-balance transaction needs review");
      if (
        m.typeColumn !== null &&
        /exchange|conversion|umrechnung|währungs|wechsel/i.test(row[m.typeColumn])
      )
        throw new Error("Currency conversion needs manual review; EUR statements only");
      const reference = row[m.referenceColumn].trim();
      if (reference.length > 1000) throw new Error("Reference exceeds 1,000 characters");
      const transactionId = m.idColumn === null ? null : row[m.idColumn].trim() || null;
      if (transactionId && transactionId.length > 200) throw new Error("Transaction ID too long");
      const amount = bankAmount(row[m.amountColumn], m.decimalFormat);
      if (amount === "0") throw new Error("Zero-amount rows need manual review");
      const fee = m.feeColumn === null ? null : bankAmount(row[m.feeColumn], m.decimalFormat);
      if (m.provider === "revolut" && fee !== null && BigInt(fee) !== 0n)
        throw new Error(
          "Revolut fee-bearing rows require custom mapping and verification of the actual net balance movement",
        );
      const gross = m.grossColumn === null ? null : bankAmount(row[m.grossColumn], m.decimalFormat);
      if (
        m.provider === "paypal" &&
        (fee === null || gross === null || BigInt(gross) + BigInt(fee) !== BigInt(amount))
      )
        throw new Error("PayPal requires Gross + signed Fee = Net; check column mapping");
      return {
        fee,
        gross,
        line: index + 1,
        date: bankDate(row[m.dateColumn], m.dateFormat),
        amount,
        reference,
        transactionId,
      };
    } catch (e) {
      throw new Error(`CSV row ${index + 2}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}

/** Presets are suggestions for known English/German headers; the user confirms the preview. */
export function bankPreset(
  headers: string[],
  provider: "revolut" | "paypal",
  delimiter: BankMapping["delimiter"],
): BankMapping {
  const column = (...names: string[]) => {
    const index = headers.findIndex((h) => names.some((n) => h.toLowerCase() === n.toLowerCase()));
    return index < 0 ? null : index;
  };
  const required = (...names: string[]) => {
    const c = column(...names);
    if (c === null)
      throw new Error(`Missing column: ${names.join(" / ")}. Use custom mapping for this export.`);
    return c;
  };
  const german = headers.includes("Datum") || headers.includes("Beschreibung");
  return BankMapping.parse({
    provider,
    delimiter,
    dateColumn:
      provider === "paypal"
        ? required("Date", "Datum")
        : required("Completed Date", "Abgeschlossen am"),
    amountColumn: provider === "paypal" ? required("Net", "Netto") : required("Amount", "Betrag"),
    referenceColumn:
      provider === "paypal" ? required("Name") : required("Description", "Beschreibung"),
    currencyColumn: required("Currency", "Währung"),
    statusColumn: required("Status", "State"),
    typeColumn: required("Type", "Typ"),
    idColumn: column("Transaction ID", "Transaktionscode", "ID"),
    feeColumn: required("Fee", "Gebühr", "Gebühren"),
    grossColumn: provider === "paypal" ? required("Gross", "Brutto") : null,
    impactColumn: column("Balance Impact", "Auswirkung auf Guthaben"),
    dateFormat: provider === "revolut" ? "iso_timestamp" : german ? "german" : "us",
    decimalFormat: german ? "german" : "english",
  });
}
