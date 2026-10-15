import type { financeExport } from "../finance-export.functions";
export type AccountantExport = Awaited<ReturnType<typeof financeExport>>;
/** Values remain strings, preserving large exact integer cents in spreadsheet exports. */
export function journalRows(data: AccountantExport): string[][] {
  return [
    [
      "Journal ID",
      "External key",
      "Date",
      "Status",
      "Memo",
      "Account",
      "Debit EUR cents",
      "Credit EUR cents",
      "Source JSON",
      "Reversal of",
    ],
    ...data.lines.map((l) => [
      l.journal_id,
      l.external_key,
      l.booking_date,
      l.status,
      l.memo,
      l.account,
      l.debit,
      l.credit,
      l.source,
      l.reversal_of ?? "",
    ]),
  ];
}
export function journalCsv(data: AccountantExport) {
  return (
    "\uFEFF" +
    journalRows(data)
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              (/^[=+\-@\t\r\n]/.test(v) && !/^\d+$/.test(v) ? "'" : "") +
              v.replaceAll('"', '""') +
              '"',
          )
          .join(";"),
      )
      .join("\r\n")
  );
}
export async function accountantWorkbook(data: AccountantExport) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["KAPTAN", "Internal account mapping – not DATEV"],
      ["Period", data.from, data.to],
      ["Generated", data.generatedAt],
      ["Amounts", "EUR cents stored as text for exactness"],
      ["Status", "Drafts included in Journals; reports include posted entries only"],
    ]),
    "Read me",
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(journalRows(data)), "Journals");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [
        "Account",
        "Name DE",
        "Name EN",
        "Kind",
        "Opening EUR cents",
        "Debit EUR cents",
        "Credit EUR cents",
        "Closing EUR cents",
      ],
      ...data.report.accounts.map((a) => [
        a.code,
        a.name_de,
        a.name_en,
        a.kind,
        a.opening,
        a.debit,
        a.credit,
        a.closing,
      ]),
    ]),
    "Trial balance",
  );
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}
