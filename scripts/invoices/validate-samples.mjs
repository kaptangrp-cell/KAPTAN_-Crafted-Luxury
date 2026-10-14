import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { buildInvoice } from "../../src/lib/invoices/model.ts";
import { invoiceXml } from "../../src/lib/invoices/xml.ts";
import { validateXml } from "./validate.mjs";
const sample = JSON.parse(await readFile("/tmp/kaptan-kosit/sample.json", "utf8"));
const reference = {
  number: sample.number,
  date: sample.issueDate,
  net: sample.net,
  vat: sample.vat,
  gross: sample.paid,
};
for (const model of [
  sample,
  { ...sample, number: "MUSTER-FINAL", kind: "final", supplyDate: "2026-10-14", reference },
  {
    ...sample,
    number: "MUSTER-CREDIT",
    kind: "credit",
    paid: 0,
    due: sample.paid,
    reference,
    reason: "Full return",
  },
  {
    ...sample,
    number: "MUSTER-PUBLIC",
    buyer: {
      ...sample.buyer,
      customerType: "public_authority",
      buyerReference: "04011000-12345-03",
      deliveryChannel: "portal",
      portalInstructions: "Sample only",
    },
  },
  buildInvoice({
    sellerTaxNumber: "NOCH ANZUGEBEN - MUSTER",
    taxMode: "regular",
    number: "MUSTER-ROUNDING",
    kind: "advance",
    issueDate: sample.issueDate,
    supplyDate: null,
    paidDate: sample.paidDate,
    orderId: sample.orderId,
    orderNumber: sample.orderNumber,
    buyer: sample.buyer,
    items: [
      {
        product_id: null,
        product_name: "Rounding fixture",
        variant_info: null,
        quantity: 3,
        unit_price: 1.18,
        line_total: 3.54,
      },
    ],
    shipping: 7.13,
    total: 10.67,
  }),
]) {
  const result = await validateXml(invoiceXml(model));
  if (!result.accepted) {
    await writeFile("/tmp/kaptan-kosit/rejected-report.xml", result.report);
    console.error(result.report.match(/<svrl:failed-assert[\s\S]*?<\/svrl:failed-assert>/g));
  }
  assert.equal(result.accepted, true, model.number);
  console.log(model.number + ": accepted");
}
// A broken tax total must never pass the issuance gate.
const invalid = await validateXml(invoiceXml({ ...sample, vat: 1 }));
assert.equal(invalid.accepted, false);
console.log("Invalid VAT fixture: rejected");
