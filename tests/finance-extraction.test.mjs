import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { extractInvoice } from "../src/lib/finance/extraction.ts";
import { embeddedInvoice } from "../src/lib/finance/embedded-invoice.server.ts";
const xml = `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:c="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:a="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"><c:ID>INV-123</c:ID><c:IssueDate>2026-10-15</c:IssueDate><c:DocumentCurrencyCode>EUR</c:DocumentCurrencyCode><a:AccountingSupplierParty><a:Party><a:PartyLegalEntity><c:RegistrationName>Supplier GmbH</c:RegistrationName></a:PartyLegalEntity><a:PostalAddress><a:Country><c:IdentificationCode>DE</c:IdentificationCode></a:Country></a:PostalAddress></a:Party></a:AccountingSupplierParty><a:TaxTotal><c:TaxAmount currencyID="EUR">19.00</c:TaxAmount></a:TaxTotal><a:LegalMonetaryTotal><c:TaxExclusiveAmount currencyID="EUR">100.00</c:TaxExclusiveAmount><c:TaxInclusiveAmount currencyID="EUR">119.00</c:TaxInclusiveAmount><c:PayableAmount currencyID="EUR">19.00</c:PayableAmount></a:LegalMonetaryTotal></Invoice>`;
test("structured invoice extraction uses document totals rather than unpaid remainder and never claims validation", () => {
  const r = extractInvoice(xml);
  assert.throws(
    () =>
      extractInvoice(
        xml.replace('TaxInclusiveAmount currencyID="EUR"', 'TaxInclusiveAmount currencyID="USD"'),
      ),
    /currency/,
  );
  assert.equal(r.gross, "11900");
  assert.equal(r.due, "1900");
  assert.equal(r.supplier, "Supplier GmbH");
  assert.equal(r.arithmetic, "consistent");
  assert.equal(r.validation, "not_validated");
  assert.throws(
    () => extractInvoice('<!DOCTYPE Invoice [<!ENTITY evil SYSTEM "https://example.test">]>' + xml),
    /Unsafe/,
  );
  assert.throws(
    () => extractInvoice(xml.replace("<c:ID>INV-123</c:ID>", "<c:ID>A</c:ID><c:ID>B</c:ID>")),
    /Ambiguous/,
  );
  assert.throws(() => extractInvoice(xml.replace("2026-10-15", "2026-02-30")), /date/);
  assert.throws(() => extractInvoice(xml.replace("Invoice-2", "Invoice-999")), /Supported roots/);
  assert.throws(() => extractInvoice(xml.slice(0, -10)));
  assert.equal(extractInvoice(xml.replace("119.00", "120.00")).arithmetic, "inconsistent");
  assert.ok(
    extractInvoice(xml.replaceAll("EUR", "USD")).warnings.some((w) => w.startsWith("Non-EUR")),
  );
});
test("embedded XML is recovered exactly from a ZUGFeRD/Factur-X-style attachment; plain PDF is not invented as XML", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await pdf.attach(Buffer.from(xml), "factur-x.xml", { mimeType: "text/xml" });
  const bytes = await pdf.save();
  assert.equal(await embeddedInvoice(bytes), xml);
  const ordinary = await PDFDocument.create();
  ordinary.addPage();
  await assert.rejects(embeddedInvoice(await ordinary.save()), /No recognized/);
  await pdf.attach(Buffer.from(xml), "zugferd-invoice.xml", { mimeType: "text/xml" });
  await assert.rejects(embeddedInvoice(await pdf.save()), /Ambiguous/);
});
test("CII fields are namespace-aware and support exact total/date extraction", () => {
  const cii = `<r:CrossIndustryInvoice xmlns:r="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:a="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:u="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"><r:ExchangedDocument><a:ID>CII-1</a:ID><a:TypeCode>380</a:TypeCode><a:IssueDateTime><u:DateTimeString format="102">20261015</u:DateTimeString></a:IssueDateTime></r:ExchangedDocument><r:SupplyChainTradeTransaction><a:ApplicableHeaderTradeAgreement><a:SellerTradeParty><a:Name>Vendor</a:Name><a:PostalTradeAddress><a:CountryID>DE</a:CountryID></a:PostalTradeAddress></a:SellerTradeParty></a:ApplicableHeaderTradeAgreement><a:ApplicableHeaderTradeSettlement><a:InvoiceCurrencyCode>EUR</a:InvoiceCurrencyCode><a:SpecifiedTradeSettlementHeaderMonetarySummation><a:TaxBasisTotalAmount>100.00</a:TaxBasisTotalAmount><a:TaxTotalAmount currencyID="EUR">19.00</a:TaxTotalAmount><a:GrandTotalAmount>119.00</a:GrandTotalAmount><a:DuePayableAmount>119.00</a:DuePayableAmount></a:SpecifiedTradeSettlementHeaderMonetarySummation></a:ApplicableHeaderTradeSettlement></r:SupplyChainTradeTransaction></r:CrossIndustryInvoice>`;
  const r = extractInvoice(cii);
  assert.equal(r.format, "CII");
  assert.equal(r.date, "2026-10-15");
  assert.equal(r.gross, "11900");
  assert.equal(r.arithmetic, "consistent");
  assert.equal(extractInvoice(cii.replace(">380<", ">381<")).kind, "credit");
});
