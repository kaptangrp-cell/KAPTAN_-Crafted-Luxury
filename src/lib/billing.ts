import { z } from "zod";

export const BillingInputSchema = z
  .object({
    customerType: z.enum(["private", "business", "public_authority"]),
    legalName: z.string().trim().max(160).default(""),
    vatId: z.string().trim().max(40).default(""),
    buyerReference: z.string().trim().max(100).default(""),
    purchaseOrder: z.string().trim().max(100).default(""),
    deliveryChannel: z.enum(["email", "portal"]).default("email"),
    portalInstructions: z.string().trim().max(500).default(""),
    sameAsShipping: z.boolean().default(true),
    line1: z.string().trim().max(200).default(""),
    line2: z.string().trim().max(200).default(""),
    city: z.string().trim().max(80).default(""),
    postalCode: z.string().trim().max(20).default(""),
    emailConsent: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const issue = (path: keyof typeof data, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (data.customerType !== "private" && !data.legalName)
      issue("legalName", "Enter the legal company or authority name.");
    if (data.customerType === "public_authority" && !data.buyerReference)
      issue("buyerReference", "Enter the buyer reference / Leitweg-ID supplied by the authority.");
    if (
      data.customerType === "public_authority" &&
      data.deliveryChannel === "portal" &&
      !data.portalInstructions
    )
      issue("portalInstructions", "Enter the recipient's invoice submission instructions.");
    if (!data.sameAsShipping)
      for (const key of ["line1", "city", "postalCode"] as const)
        if (!data[key]) issue(key, "Complete the billing address.");
    if (!data.emailConsent)
      issue(
        "emailConsent",
        "Please consent to electronic invoice delivery or contact us for an alternative.",
      );
  });
export type BillingInput = z.infer<typeof BillingInputSchema>;
export const emptyBilling: BillingInput = {
  customerType: "private",
  legalName: "",
  vatId: "",
  buyerReference: "",
  purchaseOrder: "",
  deliveryChannel: "email",
  portalInstructions: "",
  sameAsShipping: true,
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  emailConsent: false,
};
export function billingSnapshot(
  input: BillingInput,
  contact: { name: string; email: string },
  shipping: {
    line1: string;
    line2?: string | null;
    city: string;
    postal_code: string;
    country: string;
  },
) {
  const parsed = BillingInputSchema.parse(input);
  if (shipping.country.toUpperCase() !== "DE")
    throw new Error("We currently accept orders for delivery in Germany only.");
  return {
    version: 1,
    customerType: parsed.customerType,
    legalName: parsed.customerType === "private" ? contact.name : parsed.legalName,
    contactName: contact.name,
    email: contact.email,
    vatId: parsed.customerType === "private" ? null : parsed.vatId || null,
    buyerReference: parsed.customerType === "private" ? null : parsed.buyerReference || null,
    purchaseOrder: parsed.customerType === "private" ? null : parsed.purchaseOrder || null,
    deliveryChannel: parsed.customerType === "public_authority" ? parsed.deliveryChannel : "email",
    portalInstructions:
      parsed.customerType === "public_authority" ? parsed.portalInstructions : null,
    address: {
      line1: parsed.sameAsShipping ? shipping.line1 : parsed.line1,
      line2: parsed.sameAsShipping ? (shipping.line2 ?? "") : parsed.line2,
      city: parsed.sameAsShipping ? shipping.city : parsed.city,
      postalCode: parsed.sameAsShipping ? shipping.postal_code : parsed.postalCode,
      country: "DE",
    },
    emailConsent: true,
  };
}
