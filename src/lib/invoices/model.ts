import catalogGerman from "../i18n/catalog-de.json" with { type: "json" };
import { z } from "zod";
export const seller = {
  name: "Kaptan, Inhaber Zoraiz Fazal",
  legalForm: "Einzelunternehmen",
  street: "Bahnhofstraße 36",
  postalCode: "35037",
  city: "Marburg",
  country: "DE",
  vatId: "DE464080693",
  taxNumber: "031 816 03520",
  email: "kaptangrp@gmail.com",
  phone: "015216164830",
};
export const InvoiceSchema = z.object({
  version: z.literal(1),
  number: z.string().min(1),
  kind: z.enum(["advance", "final", "credit"]),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplyDate: z.string().nullable(),
  paidDate: z.string(),
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  seller: z.object({
    name: z.string(),
    legalForm: z.string(),
    street: z.string(),
    postalCode: z.string(),
    city: z.string(),
    country: z.literal("DE"),
    vatId: z.string(),
    taxNumber: z.string().min(3),
    email: z.string().email(),
    phone: z.string(),
  }),
  buyer: z.object({
    customerType: z.enum(["private", "business", "public_authority"]),
    legalName: z.string().min(1),
    email: z.string().email(),
    vatId: z.string().nullable(),
    buyerReference: z.string().nullable(),
    purchaseOrder: z.string().nullable(),
    deliveryChannel: z.enum(["email", "portal"]),
    portalInstructions: z.string().nullable(),
    address: z.object({
      line1: z.string(),
      line2: z.string(),
      city: z.string(),
      postalCode: z.string(),
      country: z.literal("DE"),
    }),
  }),
  lines: z
    .array(
      z.object({
        productId: z.string().nullable(),
        description: z.string(),
        quantity: z.number().int().positive(),
        netUnit: z.number(),
        net: z.number().int(),
        gross: z.number().int(),
      }),
    )
    .min(1),
  net: z.number().int(),
  vat: z.number().int(),
  gross: z.number().int(),
  rounding: z.number().int(),
  paid: z.number().int(),
  due: z.number().int(),
  rate: z.union([z.literal(0), z.literal(19)]),
  taxMode: z.enum(["kleinunternehmer", "regular"]),
  exemptionReason: z.string().nullable(),
  reference: z
    .object({
      number: z.string(),
      date: z.string(),
      net: z.number().int(),
      vat: z.number().int(),
      gross: z.number().int(),
    })
    .nullable(),
  reason: z.string().nullable(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;
export const cents = (value: number | string) => Math.round(Number(value) * 100);
export const money = (value: number) => (value / 100).toFixed(2);
export function berlinDate(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
// A single immutable snapshot drives PDF, XML and reporting. Never read live catalogue prices.
export function buildInvoice(input: {
  taxMode: "kleinunternehmer" | "regular";
  sellerTaxNumber: string;
  number: string;
  kind: Invoice["kind"];
  issueDate: string;
  supplyDate: string | null;
  paidDate: string;
  orderId: string;
  orderNumber: string;
  buyer: unknown;
  items: {
    product_id: string | null;
    product_name: string;
    variant_info: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[];
  shipping: number;
  total: number;
  reference?: Invoice["reference"];
  reason?: string | null;
}): Invoice {
  if (!input.sellerTaxNumber?.trim())
    throw new Error("Steuernummer fehlt. Rechnung kann nicht ausgestellt werden.");
  if (/^DE\d/i.test(input.sellerTaxNumber.trim()))
    throw new Error("USt-IdNr. ist keine Steuernummer.");
  const exempt = input.taxMode === "kleinunternehmer";
  const rate = exempt ? 0 : 19;
  const factor = 1 + rate / 100;
  const lines = input.items.map((i) => ({
    productId: i.product_id,
    description:
      germanDescription(i.product_name) +
      (i.variant_info ? ` - ${germanDescription(i.variant_info)}` : ""),
    quantity: i.quantity,
    netUnit: Math.round((Number(i.unit_price) / factor) * 1000000) / 1000000,
    net: Math.round(cents(i.line_total) / factor),
    gross: cents(i.line_total),
  }));
  if (input.shipping > 0)
    lines.push({
      productId: null,
      description: "Versand",
      quantity: 1,
      netUnit: Math.round((input.shipping / factor) * 1000000) / 1000000,
      net: Math.round(cents(input.shipping) / factor),
      gross: cents(input.shipping),
    });
  const net = lines.reduce((s, l) => s + l.net, 0),
    vat = Math.round((net * rate) / 100),
    gross = net + vat;
  const paid = cents(input.total),
    rounding = paid - gross;
  if (Math.abs(rounding) > (exempt ? 0 : lines.length))
    throw new Error("Order total does not reconcile with invoice lines");
  if (input.kind === "final" && (!input.supplyDate || !input.reference))
    throw new Error("Final invoice requires supply date and advance invoice");
  if (input.kind === "credit" && (!input.reference || !input.reason))
    throw new Error("Credit note requires original invoice and reason");
  return InvoiceSchema.parse({
    version: 1,
    number: input.number,
    kind: input.kind,
    issueDate: input.issueDate,
    supplyDate: input.supplyDate,
    paidDate: input.paidDate,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    seller: { ...seller, taxNumber: input.sellerTaxNumber.trim() },
    buyer: input.buyer,
    lines,
    net,
    vat,
    gross,
    rounding,
    paid: input.kind === "credit" ? 0 : paid,
    due: input.kind === "credit" ? paid : 0,
    rate,
    taxMode: input.taxMode,
    exemptionReason: exempt
      ? "Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG. Es wird keine Umsatzsteuer berechnet."
      : null,
    reference: input.reference ?? null,
    reason: input.reason ?? null,
  });
}

export const germanMoney = (minor: number) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    minor / 100,
  );
export const germanDate = (iso: string) => iso.split("-").reverse().join(".");
function germanDescription(value: string) {
  const dictionary: Record<string, string> = catalogGerman;
  if (dictionary[value]) return dictionary[value];
  const terms: Record<string, string> = {
    Color: "Farbe",
    Colour: "Farbe",
    Size: "Größe",
    Black: "Schwarz",
    Brown: "Braun",
    White: "Weiß",
    Blue: "Blau",
    Red: "Rot",
    Green: "Grün",
    Grey: "Grau",
    Gray: "Grau",
    Beige: "Beige",
    Tan: "Hellbraun",
    "One size": "Einheitsgröße",
  };
  return value
    .split(/(\s*[:/]\s*)/)
    .map((part) => terms[part] ?? part)
    .join("");
}
