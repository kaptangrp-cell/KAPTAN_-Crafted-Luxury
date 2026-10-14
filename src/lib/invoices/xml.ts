import type { Invoice } from "./model.ts";
import { money, germanDate, germanMoney } from "./model.ts";
export const xmlEscape = (value: string) =>
  value
    // XML 1.0 forbids these control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function invoiceXml(i: Invoice) {
  const e = xmlEscape,
    credit = i.kind === "credit",
    root = credit ? "CreditNote" : "Invoice",
    line = credit ? "CreditNoteLine" : "InvoiceLine";
  const amount = (tag: string, n: number) =>
    `<cbc:${tag} currencyID="EUR">${money(n)}</cbc:${tag}>`;
  const category = `<cbc:ID>${i.taxMode === "kleinunternehmer" ? "E" : "S"}</cbc:ID><cbc:Percent>${i.rate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
  const reference = i.reference
    ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${e(i.reference.number)}</cbc:ID><cbc:IssueDate>${i.reference.date}</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>`
    : "";
  const note =
    i.kind === "advance"
      ? `Vorauszahlungsrechnung. Zahlungseingang: ${germanDate(i.paidDate)}. Lieferung steht noch aus.`
      : i.kind === "final"
        ? i.taxMode === "kleinunternehmer"
          ? `Endrechnung. Vorauszahlung ${i.reference!.number}: EUR ${germanMoney(i.reference!.gross)}. Vollständig abgesetzt; Restbetrag EUR 0,00.`
          : `Endrechnung. Bereits vereinnahmte Vorauszahlung ${i.reference!.number}: netto EUR ${germanMoney(i.reference!.net)}, Umsatzsteuer EUR ${germanMoney(i.reference!.vat)}, brutto EUR ${germanMoney(i.reference!.gross)}. Vollständig abgesetzt; Restbetrag EUR 0,00.`
        : `Rechnungskorrektur: ${i.reason}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${e(i.number)}</cbc:ID><cbc:IssueDate>${i.issueDate}</cbc:IssueDate>
<cbc:${credit ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>${credit ? "381" : "380"}</cbc:${credit ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>
<cbc:Note>${e(note + (i.exemptionReason ? " " + i.exemptionReason : ""))}</cbc:Note>${credit ? "" : `<cbc:TaxPointDate>${i.supplyDate ?? i.paidDate}</cbc:TaxPointDate>`}<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${e(i.buyer.buyerReference || i.orderNumber)}</cbc:BuyerReference>
<cac:OrderReference><cbc:ID>${e(i.buyer.purchaseOrder || i.orderNumber)}</cbc:ID><cbc:SalesOrderID>${e(i.orderNumber)}</cbc:SalesOrderID></cac:OrderReference>${reference}
<cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="EM">${e(i.seller.email)}</cbc:EndpointID><cac:PartyIdentification><cbc:ID>${e(i.seller.taxNumber)}</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>KAPTAN</cbc:Name></cac:PartyName>
<cac:PostalAddress><cbc:StreetName>${e(i.seller.street)}</cbc:StreetName><cbc:CityName>${e(i.seller.city)}</cbc:CityName><cbc:PostalZone>${i.seller.postalCode}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
<cac:PartyTaxScheme><cbc:CompanyID>${e(i.seller.taxNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>${e(i.seller.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
<cac:Contact><cbc:Name>Zoraiz Fazal</cbc:Name><cbc:Telephone>${e(i.seller.phone)}</cbc:Telephone><cbc:ElectronicMail>${e(i.seller.email)}</cbc:ElectronicMail></cac:Contact></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="EM">${e(i.buyer.email)}</cbc:EndpointID>
<cac:PostalAddress><cbc:StreetName>${e(i.buyer.address.line1)}</cbc:StreetName>${i.buyer.address.line2 ? `<cbc:AdditionalStreetName>${e(i.buyer.address.line2)}</cbc:AdditionalStreetName>` : ""}<cbc:CityName>${e(i.buyer.address.city)}</cbc:CityName><cbc:PostalZone>${e(i.buyer.address.postalCode)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
${i.buyer.vatId ? `<cac:PartyTaxScheme><cbc:CompanyID>${e(i.buyer.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}<cac:PartyLegalEntity><cbc:RegistrationName>${e(i.buyer.legalName)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
${i.supplyDate ? `<cac:Delivery><cbc:ActualDeliveryDate>${i.supplyDate}</cbc:ActualDeliveryDate></cac:Delivery>` : ""}
<cac:PaymentMeans><cbc:PaymentMeansCode>1</cbc:PaymentMeansCode><cbc:PaymentID>${e(i.orderNumber)}</cbc:PaymentID></cac:PaymentMeans>
<cac:PaymentTerms><cbc:Note>${credit ? "Erstattung nach Vereinbarung; diese Korrektur löst keine automatische Zahlung aus." : "Vollständig bezahlt. Keine weitere Zahlung erforderlich."}</cbc:Note></cac:PaymentTerms>
<cac:TaxTotal>${amount("TaxAmount", i.vat)}<cac:TaxSubtotal>${amount("TaxableAmount", i.net)}${amount("TaxAmount", i.vat)}<cac:TaxCategory>${i.exemptionReason ? category.replace("<cac:TaxScheme>", `<cbc:TaxExemptionReason>${e(i.exemptionReason)}</cbc:TaxExemptionReason><cac:TaxScheme>`) : category}</cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:LegalMonetaryTotal>${amount("LineExtensionAmount", i.net)}${amount("TaxExclusiveAmount", i.net)}${amount("TaxInclusiveAmount", i.gross)}${amount("PrepaidAmount", i.paid)}${amount("PayableRoundingAmount", i.rounding)}${amount("PayableAmount", i.due)}</cac:LegalMonetaryTotal>
${i.lines.map((l, n) => `<cac:${line}><cbc:ID>${n + 1}</cbc:ID><cbc:${credit ? "CreditedQuantity" : "InvoicedQuantity"} unitCode="C62">${l.quantity}</cbc:${credit ? "CreditedQuantity" : "InvoicedQuantity"}>${amount("LineExtensionAmount", l.net)}<cac:Item><cbc:Name>${e(l.description)}</cbc:Name><cac:ClassifiedTaxCategory>${category}</cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${l.netUnit.toFixed(6)}</cbc:PriceAmount></cac:Price></cac:${line}>`).join("\n")}
</${root}>`;
}
