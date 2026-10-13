import { z } from "zod";

const price = z.coerce.number().finite().min(0).max(100000);
const colors = z.preprocess(
  (value) => (typeof value === "string" ? [value] : value),
  z
    .array(z.string().trim().min(1).max(70))
    .max(20)
    .transform((values) => [...new Set(values.map((v) => v.toLowerCase()))]),
);
export const CatalogSearchSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).optional().catch(undefined),
    q: z.string().trim().max(200).optional().catch(undefined),
    category: z.string().max(200).optional().catch(undefined),
    colors: colors.optional().catch(undefined),
    sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).optional().catch(undefined),
    minPrice: price.optional().catch(undefined),
    maxPrice: price.optional().catch(undefined),
    inStock: z.preprocess(
      (value) => (value === "true" || value === true ? true : undefined),
      z.boolean().optional(),
    ),
  })
  .transform((value) =>
    value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice
      ? { ...value, minPrice: value.maxPrice, maxPrice: value.minPrice }
      : value,
  );

export const CatalogRequestSchema = z.object({
  categorySlug: z.string().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  colors: colors.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(240000).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).optional(),
  minPrice: price.optional(),
  maxPrice: price.optional(),
  inStockOnly: z.boolean().optional(),
});

// Quote PostgREST literals and escape LIKE wildcards: colour names are literal values.
export function literalPattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
function quoted(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
export function colorVariantFilter(selected: string[], inStockOnly = false) {
  const clauses = selected.flatMap((color) => [
    `and(variant_type.in.(Color,Colour,color,colour,Farbe,farbe),variant_value.ilike.${quoted(literalPattern(color))})`,
    `and(variant_type.eq."Color / Size",variant_value.ilike.${quoted(`${literalPattern(color)} / %`)})`,
  ]);
  return `and(or(is_available.eq.true,is_available.is.null),or(${clauses.join(",")})${inStockOnly ? ",or(stock_quantity.is.null,stock_quantity.gt.0)" : ""})`;
}
