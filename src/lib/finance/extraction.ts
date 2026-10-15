import { DOMParser, type Element } from "@xmldom/xmldom";
import { z } from "zod";
export const EXTRACTION_ENGINE = "kaptan-structured-1";
export const ExtractionSchema = z.object({
  format: z.enum(["UBL", "CII"]),
  kind: z.enum(["invoice", "credit"]),
  supplier: z.string().nullable(),
  supplierCountry: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  number: z.string().nullable(),
  date: z.string().nullable(),
  currency: z.string().nullable(),
  net: z.string().nullable(),
  tax: z.string().nullable(),
  gross: z.string().nullable(),
  due: z.string().nullable(),
  profile: z.string().nullable(),
  warnings: z.array(z.string()),
  arithmetic: z.enum(["consistent", "inconsistent", "incomplete"]),
  validation: z.literal("not_validated"),
});
export type Extraction = z.infer<typeof ExtractionSchema>;
const NS = {
  invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  credit: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cii: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};
function child(parent: Element | null, namespace: string, name: string): Element | null {
  if (!parent) return null;
  const matches = Array.from(parent.childNodes).filter(
    (n) => n.nodeType === 1 && n.namespaceURI === namespace && n.localName === name,
  ) as Element[];
  if (matches.length > 1) throw new Error(`Ambiguous repeated field: ${name}`);
  return matches[0] ?? null;
}
function value(el: Element | null) {
  if (!el) return null;
  if (Array.from(el.childNodes).some((n) => n.nodeType === 1))
    throw new Error("Expected simple invoice field");
  const s = (el.textContent ?? "").trim();
  if (s.length > 1000) throw new Error("Invoice field too long");
  return s || null;
}
function minor(el: Element | null, currency: string | null) {
  if (el?.getAttribute("currencyID") && el.getAttribute("currencyID") !== currency)
    throw new Error("Amount currency differs from invoice currency");
  const s = value(el);
  if (s === null) return null;
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(s))
    throw new Error("Invoice amount must use non-negative decimal currency units");
  const [w, f = ""] = s.split(".");
  return (BigInt(w) * 100n + BigInt(f.padEnd(2, "0"))).toString();
}
/** Extracts deterministic suggestions only; not EN16931/XRechnung validation. No network or entity resolution. */
export function extractInvoice(xml: string): Extraction {
  if (
    Buffer.byteLength(xml, "utf8") > 3 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    xml.includes("\0")
  )
    throw new Error("Unsafe or oversized XML");
  const doc = new DOMParser({
      onError: () => {
        throw new Error("Malformed XML");
      },
    }).parseFromString(xml, "application/xml"),
    root = doc.documentElement;
  if (!root) throw new Error("Missing invoice root");
  const pending = [{ node: root, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > 30000 || depth > 80) throw new Error("XML too complex");
    for (const c of Array.from(node.childNodes))
      if (c.nodeType === 1) pending.push({ node: c as Element, depth: depth + 1 });
  }
  let out: Omit<Extraction, "warnings" | "arithmetic" | "validation">;
  if (
    (root.namespaceURI === NS.invoice && root.localName === "Invoice") ||
    (root.namespaceURI === NS.credit && root.localName === "CreditNote")
  ) {
    const party = child(child(root, NS.cac, "AccountingSupplierParty"), NS.cac, "Party"),
      legal = child(party, NS.cac, "PartyLegalEntity"),
      address = child(party, NS.cac, "PostalAddress"),
      totals = child(root, NS.cac, "LegalMonetaryTotal");
    const taxTotals = Array.from(root.childNodes).filter(
      (n) => n.nodeType === 1 && n.namespaceURI === NS.cac && n.localName === "TaxTotal",
    ) as Element[];
    const currency = value(child(root, NS.cbc, "DocumentCurrencyCode"));
    const taxAmounts = taxTotals
      .map((t) => child(t, NS.cbc, "TaxAmount"))
      .filter(
        (t) => t && (!t.getAttribute("currencyID") || t.getAttribute("currencyID") === currency),
      );
    if (taxAmounts.length > 1) throw new Error("Ambiguous document-currency tax total");
    out = {
      format: "UBL",
      kind: root.localName === "CreditNote" ? "credit" : "invoice",
      supplier:
        value(child(legal, NS.cbc, "RegistrationName")) ??
        value(child(child(party, NS.cac, "PartyName"), NS.cbc, "Name")),
      supplierCountry: value(
        child(child(address, NS.cac, "Country"), NS.cbc, "IdentificationCode"),
      ),
      supplierTaxId: value(child(child(party, NS.cac, "PartyTaxScheme"), NS.cbc, "CompanyID")),
      number: value(child(root, NS.cbc, "ID")),
      date: value(child(root, NS.cbc, "IssueDate")),
      currency,
      net: minor(child(totals, NS.cbc, "TaxExclusiveAmount"), currency),
      tax: minor(taxAmounts[0] ?? null, currency),
      gross: minor(child(totals, NS.cbc, "TaxInclusiveAmount"), currency),
      due: minor(child(totals, NS.cbc, "PayableAmount"), currency),
      profile: value(child(root, NS.cbc, "CustomizationID")),
    };
  } else if (root.namespaceURI === NS.cii && root.localName === "CrossIndustryInvoice") {
    const doc = child(root, NS.cii, "ExchangedDocument"),
      transaction = child(root, NS.cii, "SupplyChainTradeTransaction"),
      agreement = child(transaction, NS.ram, "ApplicableHeaderTradeAgreement"),
      supplier = child(agreement, NS.ram, "SellerTradeParty"),
      settlement = child(transaction, NS.ram, "ApplicableHeaderTradeSettlement"),
      totals = child(settlement, NS.ram, "SpecifiedTradeSettlementHeaderMonetarySummation");
    const date = child(child(doc, NS.ram, "IssueDateTime"), NS.udt, "DateTimeString"),
      rawDate = value(date),
      type = value(child(doc, NS.ram, "TypeCode"));
    if (type !== "380" && type !== "381")
      throw new Error("Unsupported CII document type; manual review required");
    const taxIds = supplier
      ? (Array.from(supplier.childNodes).filter(
          (n) =>
            n.nodeType === 1 &&
            n.namespaceURI === NS.ram &&
            n.localName === "SpecifiedTaxRegistration",
        ) as Element[])
      : [];
    const vatIds = taxIds
      .map((t) => child(t, NS.ram, "ID"))
      .filter((e) => e?.getAttribute("schemeID") === "VA");
    if (vatIds.length > 1) throw new Error("Ambiguous supplier VAT ID");
    const currency = value(child(settlement, NS.ram, "InvoiceCurrencyCode"));
    out = {
      format: "CII",
      kind: type === "381" ? "credit" : "invoice",
      supplier: value(child(supplier, NS.ram, "Name")),
      supplierCountry: value(
        child(child(supplier, NS.ram, "PostalTradeAddress"), NS.ram, "CountryID"),
      ),
      supplierTaxId: value(vatIds[0] ?? null),
      number: value(child(doc, NS.ram, "ID")),
      date:
        rawDate && date?.getAttribute("format") === "102" && /^\d{8}$/.test(rawDate)
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : null,
      currency,
      net: minor(child(totals, NS.ram, "TaxBasisTotalAmount"), currency),
      tax: minor(child(totals, NS.ram, "TaxTotalAmount"), currency),
      gross: minor(child(totals, NS.ram, "GrandTotalAmount"), currency),
      due: minor(child(totals, NS.ram, "DuePayableAmount"), currency),
      profile: value(
        child(
          child(
            child(root, NS.cii, "ExchangedDocumentContext"),
            NS.ram,
            "GuidelineSpecifiedDocumentContextParameter",
          ),
          NS.ram,
          "ID",
        ),
      ),
    };
  } else throw new Error("Supported roots: UBL Invoice/CreditNote or CII CrossIndustryInvoice");
  const warnings = ["Extraction is not legal/schema validation. Review original before posting."];
  if (out.date && !z.string().date().safeParse(out.date).success)
    throw new Error("Invalid invoice date");
  for (const field of [
    "supplier",
    "supplierCountry",
    "number",
    "date",
    "currency",
    "net",
    "tax",
    "gross",
  ] as const)
    if (out[field] === null) warnings.push(`Missing ${field}`);
  if (out.currency !== "EUR")
    warnings.push("Non-EUR: conversion and tax review required; do not copy amounts as EUR.");
  if (out.supplierCountry !== "DE")
    warnings.push("Non-domestic or unknown supplier: cross-border tax review required.");
  if (out.kind === "credit") warnings.push("Credit note: do not post as a new positive expense.");
  const arithmetic =
    out.net === null || out.tax === null || out.gross === null
      ? "incomplete"
      : BigInt(out.net) + BigInt(out.tax) === BigInt(out.gross)
        ? "consistent"
        : "inconsistent";
  if (arithmetic === "inconsistent") warnings.push("Net + tax does not equal gross.");
  return ExtractionSchema.parse({ ...out, warnings, arithmetic, validation: "not_validated" });
}
