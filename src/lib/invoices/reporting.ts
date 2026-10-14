import { berlinDate } from "./model.ts";
export type InvoicePeriod = "day" | "week" | "month" | "year" | "all";
export function invoiceRange(period: InvoicePeriod, anchor = berlinDate()) {
  if (period === "all") return { from: "", to: "" };
  const [year, month, day] = anchor.split("-").map(Number),
    date = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || date.toISOString().slice(0, 10) !== anchor)
    throw new Error("Invalid date");
  let start = new Date(date),
    end = new Date(date);
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
  }
  if (period === "month") {
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 0));
  }
  if (period === "year") {
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year, 11, 31));
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
export function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return '"' + (/^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw).replaceAll('"', '""') + '"';
}
