import { z } from "zod";
import { allocate } from "./money.ts";
const positive = z.string().regex(/^[1-9]\d{0,12}$/);
const amount = z.string().regex(/^\d{1,13}$/);
export const ShipmentInput = z
  .object({
    id: z.string().uuid(),
    reference: z.string().trim().min(3).max(200),
    supplier: z.string().trim().min(2).max(200),
    date: z.string().date(),
    currency: z.enum(["EUR", "PKR", "USD", "GBP"]),
    rateNumerator: positive,
    rateDenominator: positive,
    rateDate: z.string().date(),
    rateSource: z.string().trim().min(3).max(300),
    method: z.enum(["quantity", "value", "weight", "manual"]),
    units: z
      .array(z.object({ id: z.string().uuid(), purchase: positive, weight: positive }))
      .min(1)
      .max(1000),
    components: z
      .array(
        z.object({
          kind: z.enum([
            "purchase",
            "freight",
            "insurance",
            "duty",
            "import_vat",
            "clearance",
            "other",
          ]),
          document: z.string().uuid(),
          reference: z.string().trim().min(1).max(200),
          amount: amount,
        }),
      )
      .min(1)
      .max(30),
    confirmed: z.literal(true),
  })
  .superRefine((v, c) => {
    if (new Set(v.units.map((u) => u.id)).size !== v.units.length)
      c.addIssue({ code: "custom", message: "Unit selected twice" });
    if (v.components.filter((x) => x.kind === "purchase").length !== 1)
      c.addIssue({ code: "custom", message: "One purchase invoice component required" });
    if (new Set(v.components.map((x) => x.document + ":" + x.kind)).size !== v.components.length)
      c.addIssue({
        code: "custom",
        message: "Use each document/cost type combination once per shipment",
      });
    if (v.currency === "EUR" && v.rateNumerator !== v.rateDenominator)
      c.addIssue({ code: "custom", message: "EUR exchange rate must be 1:1" });
  });
export type ShipmentInput = z.infer<typeof ShipmentInput>;
/** Original purchase prices are in foreign minor units; rate converts minor units to EUR cents. */
export function costShipment(input: ShipmentInput) {
  const v = ShipmentInput.parse(input),
    units = [...v.units].sort((a, b) => a.id.localeCompare(b.id));
  const purchaseForeign = units.reduce((n, u) => n + BigInt(u.purchase), 0n);
  const numerator = BigInt(v.rateNumerator),
    denominator = BigInt(v.rateDenominator);
  const purchaseEuro = (purchaseForeign * numerator * 2n + denominator) / (2n * denominator);
  const purchase = v.components.find((c) => c.kind === "purchase")!;
  if (BigInt(purchase.amount) !== purchaseEuro)
    throw new Error(
      "Purchase component must equal the rounded foreign total converted to EUR cents",
    );
  const total = v.components.reduce((n, c) => n + BigInt(c.amount), 0n);
  if (total <= 0n || total > 9000000000000n) throw new Error("Invalid total cost");
  const base = allocate(
    purchaseEuro.toString(),
    units.map((u) => u.purchase),
  );
  const weights = units.map((u) =>
    v.method === "quantity" ? "1" : v.method === "value" ? u.purchase : u.weight,
  );
  const allocated = v.components.map((c) =>
    c.kind === "purchase" ? base : allocate(c.amount, weights),
  );
  return {
    ...v,
    units,
    allocations: units.map((u, i) => ({
      id: u.id,
      amount: allocated.reduce((n, a) => n + BigInt(a[i]), 0n).toString(),
      parts: allocated.map((a) => a[i]),
    })),
    total: total.toString(),
    purchaseForeign: purchaseForeign.toString(),
  };
}
