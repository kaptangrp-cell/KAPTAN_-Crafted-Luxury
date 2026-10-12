import { z } from "zod";

export interface ProductOption {
  id: string;
  variant_type: string;
  variant_value: string;
  is_available?: boolean | null;
  stock_quantity?: number | null;
  price_modifier?: number | null;
}

// A combined choice remains one inventory variant and one cart/order line.
export function optionParts(option: Pick<ProductOption, "variant_type" | "variant_value">) {
  const type = option.variant_type.toLowerCase().trim();
  if (type === "color / size") {
    const [color, size] = option.variant_value.split(" / ");
    return { color, size };
  }
  if (["color", "colour", "farbe"].includes(type)) return { color: option.variant_value };
  if (["size", "größe"].includes(type)) return { size: option.variant_value };
  return {};
}

export const ProductOptionSchema = z
  .object({
    id: z.string().uuid().optional(),
    product_id: z.string().uuid(),
    variant_type: z.string().trim().min(1).max(80),
    variant_value: z.string().trim().min(1).max(160),
    is_available: z.boolean(),
    stock_quantity: z.number().int().min(0).max(1000000).nullable(),
    price_modifier: z.number().min(0).max(100000),
  })
  .superRefine((value, ctx) => {
    if (
      value.variant_type === "Color / Size" &&
      (value.variant_value.split(" / ").length !== 2 ||
        value.variant_value.split(" / ").some((v) => !v.trim()))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Enter both color and size",
        path: ["variant_value"],
      });
    }
  });

export function activeOptions<T extends ProductOption>(options: T[]) {
  return options.filter((option) => option.is_available !== false);
}
