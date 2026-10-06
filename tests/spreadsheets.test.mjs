import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

test("updated SheetJS retains product import and order export data", () => {
  const rows = [{ name: "Leather Wallet", price: 29.99, stock_quantity: 3, sku: "KPT-01" }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const restored = XLSX.read(buffer);
  assert.deepEqual(XLSX.utils.sheet_to_json(restored.Sheets.Products), rows);
  assert.match(XLSX.utils.sheet_to_csv(ws), /Leather Wallet,29.99,3,KPT-01/);
});
