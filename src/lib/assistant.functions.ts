import { consumerProduct } from "./tax";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { matchAssistantProducts, assistantTokens } from "@/lib/store-assistant";

// Public catalogue fields only: no costs, customers, orders, or privileged client.
const selection =
  "id, name, slug, short_description, full_description, price, stock_quantity, specifications, categories(name), product_images(url, media_type, sort_order), product_variants(variant_type, variant_value, is_available, stock_quantity, price_modifier)" as const;
export const searchAssistantProducts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ question: z.string().trim().min(1).max(300), slug: z.string().max(200).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const contextual =
      data.slug &&
      (/\b(this|it|its|dieses|diese|dieser|diesem)\b/i.test(data.question) ||
        assistantTokens(data.question).length === 0);
    if (contextual) {
      const { data: product, error } = await supabase
        .from("products")
        .select(selection)
        .eq("is_available", true)
        .eq("slug", data.slug!)
        .maybeSingle();
      if (error) throw new Error("Catalogue unavailable");
      if (product) return { products: [consumerProduct(product)], total: 1 };
    }
    const matches = [];
    for (let offset = 0; ; offset += 500) {
      const { data: products, error } = await supabase
        .from("products")
        .select(selection)
        .eq("is_available", true)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error("Catalogue unavailable");
      matches.push(...matchAssistantProducts((products ?? []).map(consumerProduct), data.question));
      if ((products?.length ?? 0) < 500) break;
    }
    const ranked = matchAssistantProducts(matches, data.question);
    return { products: ranked.slice(0, 6), total: ranked.length };
  });
