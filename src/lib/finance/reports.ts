import { z } from "zod";
const integer = z.string().regex(/^-?\d+$/);
export const ReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  postedCount: integer,
  draftCount: integer,
  cash: z.object({ inflow: integer, outflow: integer }),
  accounts: z.array(
    z.object({
      code: z.string(),
      name_de: z.string(),
      name_en: z.string(),
      kind: z.enum(["asset", "liability", "equity", "income", "expense"]),
      opening: integer,
      debit: integer,
      credit: integer,
      closing: integer,
    }),
  ),
});
export type FinanceReport = z.infer<typeof ReportSchema>;
export function summarizeReport(report: FinanceReport) {
  const sum = (kind: string, key: "opening" | "closing") =>
    report.accounts.filter((a) => a.kind === kind).reduce((n, a) => n + BigInt(a[key]), 0n);
  const period = (kind: string) =>
    report.accounts
      .filter((a) => a.kind === kind)
      .reduce((n, a) => n + BigInt(a.debit) - BigInt(a.credit), 0n);
  const revenue = -period("income"),
    expenses = period("expense"),
    profit = revenue - expenses;
  const assets = sum("asset", "closing"),
    liabilities = -sum("liability", "closing"),
    equity = -sum("equity", "closing") - sum("income", "closing") - sum("expense", "closing");
  const cash = (key: "opening" | "closing") =>
    report.accounts
      .filter((a) => ["BANK", "CASH"].includes(a.code))
      .reduce((n, a) => n + BigInt(a[key]), 0n);
  const get = (code: string) => report.accounts.find((a) => a.code === code)?.closing ?? "0";
  return {
    revenue: revenue.toString(),
    expenses: expenses.toString(),
    profit: profit.toString(),
    assets: assets.toString(),
    liabilities: liabilities.toString(),
    equity: equity.toString(),
    balanceGap: (assets - liabilities - equity).toString(),
    cashOpening: cash("opening").toString(),
    cashClosing: cash("closing").toString(),
    cashGap: (
      cash("closing") -
      cash("opening") -
      BigInt(report.cash.inflow) +
      BigInt(report.cash.outflow)
    ).toString(),
    bank: get("BANK"),
    inventory: get("STOCK"),
    receivables: get("AR"),
    payables: (-BigInt(get("AP"))).toString(),
  };
}
function csvCell(value: string) {
  return (
    '"' +
    (/^[=+\-@\t\r\n]/.test(value) && !/^-?\d+$/.test(value) ? "'" : "") +
    value.replaceAll('"', '""') +
    '"'
  );
}
export function reportCsv(report: FinanceReport, german: boolean) {
  const header = german
    ? [
        "Konto",
        "Bezeichnung",
        "Klasse",
        "Anfang (EUR Cent)",
        "Soll (EUR Cent)",
        "Haben (EUR Cent)",
        "Ende (EUR Cent)",
      ]
    : [
        "Account",
        "Name",
        "Class",
        "Opening (EUR cents)",
        "Debit (EUR cents)",
        "Credit (EUR cents)",
        "Closing (EUR cents)",
      ];
  return (
    "\uFEFF" +
    [
      header,
      ...report.accounts.map((a) => [
        a.code,
        german ? a.name_de : a.name_en,
        a.kind,
        a.opening,
        a.debit,
        a.credit,
        a.closing,
      ]),
    ]
      .map((r) => r.map(csvCell).join(";"))
      .join("\r\n")
  );
}
