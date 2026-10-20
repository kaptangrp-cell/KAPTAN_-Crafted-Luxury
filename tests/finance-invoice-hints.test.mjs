import test from "node:test";
import assert from "node:assert/strict";
import { invoiceHints } from "../src/lib/finance/invoice-hints.ts";
test("invoice hints distinguish total from tax, balance and payments", () => {
  const hints = invoiceHints(
    "Lieferant: Office GmbH\nRechnungsnummer: INV-2026/1\nRechnungsdatum: 20.10.2026\nNettobetrag 100,00\nGesamtbetrag: 1.234,56 EUR\nBereits bezahlt 500,00\nRestbetrag 734,56",
  );
  assert.deepEqual(hints, {
    supplier: "Office GmbH",
    number: "INV-2026/1",
    date: "2026-10-20",
    gross: "123456",
  });
  assert.equal(invoiceHints("Subtotal 100.00\nTax 19.00\nAmount due 119.00").gross, null);
});
test("ambiguous totals, foreign currencies, invalid dates and unlabeled names stay empty", () => {
  assert.equal(invoiceHints("Gesamtbetrag 19,00\nGesamtbetrag 20,00").gross, null);
  assert.equal(invoiceHints("Invoice total 12.00\nUSD").gross, null);
  assert.equal(invoiceHints("Datum: 31.02.2026").date, null);
  assert.equal(invoiceHints("KAPTAN\nRechnungsempfänger: Zoraiz Fazal").supplier, null);
  assert.equal(invoiceHints("Total: 1,234.56 EUR").gross, "123456");
  assert.equal(invoiceHints("Restbetrag: 0,00 EUR").gross, null);
});
