import { readFile, writeFile } from "node:fs/promises";
import { buildInvoice } from "../../src/lib/invoices/model.ts";
import { invoiceXml } from "../../src/lib/invoices/xml.ts";
import { invoicePdf } from "../../src/lib/invoices/pdf.ts";
const model = buildInvoice({
  number: "MUSTER-KPT-WEB-00000001",
  kind: "advance",
  issueDate: "2026-10-14",
  supplyDate: null,
  paidDate: "2026-10-14",
  orderId: "00000000-0000-4000-8000-000000000001",
  orderNumber: "MUSTER-BESTELLUNG-001",
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
      city: "Berlin",
      postalCode: "10115",
      country: "DE",
    },
  },
  items: [
    {
      product_id: "00000000-0000-4000-8000-000000000002",
      product_name: "Premium Leather Wallet",
      variant_info: "Black / S",
      quantity: 2,
      unit_price: 17.85,
      line_total: 35.7,
    },
  ],
  shipping: 7.13,
  total: 42.83,
});
const assets = {
  inter: await readFile(
    new URL(
      "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
      import.meta.url,
    ),
  ),
  serif: await readFile(
    new URL(
      "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
      import.meta.url,
    ),
  ),
  logo: await readFile(new URL("../../public/kaptan-logo.png", import.meta.url)),
};
await writeFile("output/pdf/kaptan-invoice-sample.pdf", await invoicePdf(model, assets, true));
await writeFile("/tmp/kaptan-kosit/sample.xml", invoiceXml(model));
await writeFile("/tmp/kaptan-kosit/sample.json", JSON.stringify(model));
