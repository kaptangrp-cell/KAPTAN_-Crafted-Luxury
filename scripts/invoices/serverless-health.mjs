// Synthetic data only: validates the packaged runtime without claiming jobs or sending mail.
import assert from "node:assert/strict";
import { buildInvoice } from "../../src/lib/invoices/model.ts";
import { invoiceXml } from "../../src/lib/invoices/xml.ts";
import { validateXml } from "./validate.mjs";
const model = buildInvoice({
  sellerTaxNumber: "031 816 03520",
  taxMode: "kleinunternehmer",
  number: "MUSTER-RUNTIME-TEST",
  kind: "advance",
  issueDate: "2026-10-16",
  paidDate: "2026-10-16",
  supplyDate: null,
  orderId: "00000000-0000-4000-8000-000000000001",
  orderNumber: "MUSTER-RUNTIME-TEST",
  buyer: {
    customerType: "business",
    legalName: "Musterkunde GmbH",
    email: "sample@example.test",
    vatId: null,
    buyerReference: "MUSTER-001",
    purchaseOrder: null,
    deliveryChannel: "email",
    portalInstructions: null,
    address: {
      line1: "Musterstraße 10",
      line2: "",
      postalCode: "10115",
      city: "Berlin",
      country: "DE",
    },
  },
  items: [
    {
      product_id: null,
      product_name: "Musterartikel",
      variant_info: null,
      quantity: 1,
      unit_price: 15,
      line_total: 15,
    },
  ],
  shipping: 0,
  total: 15,
});
assert.equal((await validateXml(invoiceXml(model))).accepted, true);
assert.equal((await validateXml(invoiceXml({ ...model, vat: 1 }))).accepted, false);
console.log("Packaged validator accepted the valid fixture and rejected the invalid fixture.");
