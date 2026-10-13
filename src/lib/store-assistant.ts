export type AssistantIntent =
  | "returns"
  | "shipping"
  | "tracking"
  | "payment"
  | "care"
  | "authenticity"
  | "faq"
  | "support"
  | "products";
export function assistantIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  if (
    /\b(return|returns|refund|refunds|exchange|rückgabe|rücksendung|rücksendungen|erstattung|umtausch|retoure)\b/.test(
      q,
    )
  )
    return "returns";
  if (
    /\b(track|tracking|where.*order|order status|bestellung verfolgen|sendungsverfolgung|bestellstatus|wo.*bestellung)\b/.test(
      q,
    )
  )
    return "tracking";
  if (/\b(shipping|delivery|deliver|versand|lieferung|lieferzeit|zoll|customs|postage)\b/.test(q))
    return "shipping";
  if (/\b(payment|pay|paypal|zahlung|bezahlen|bezahlung)\b/.test(q)) return "payment";
  if (/\b(care|clean|pflege|pflegen|reinigen)\b/.test(q)) return "care";
  if (/\b(authentic|authenticity|echt|authentisch)\b/.test(q)) return "authenticity";
  if (/\b(faq|faqs|frequently asked|häufige fragen)\b/.test(q)) return "faq";
  if (/\b(human|contact|support|whatsapp|person|hilfe|kontakt|mitarbeiter)\b/.test(q))
    return "support";
  return "products";
}
const aliases: Record<string, string> = {
  braune: "brown",
  braunen: "brown",
  schwarze: "black",
  schwarzen: "black",
  blaue: "blue",
  blauen: "blue",
  grüne: "green",
  grünen: "green",
  wallets: "wallet",
  geldbörse: "wallet",
  geldbörsen: "wallet",
  brieftasche: "wallet",
  brieftaschen: "wallet",
  bags: "bag",
  tasche: "bag",
  taschen: "bag",
  belts: "belt",
  gürtel: "belt",
  leder: "leather",
  lamps: "lamp",
  lampe: "lamp",
  lampen: "lamp",
  salzlampe: "lamp",
  salzlampen: "lamp",
  jackets: "jacket",
  jacke: "jacket",
  jacken: "jacket",
  schwarz: "black",
  braun: "brown",
  blau: "blue",
  grün: "green",
  rot: "red",
  weiß: "white",
  grau: "grey",
  gray: "grey",
};
const stop = new Set(
  "a an the me my i you your we is are do does can could would please show find want need looking for have available in with of on to this that product products about tell more information details what which how it its price cost colour color colours colors size sizes stock between and over above at least über ab mindestens zwischen catalogue catalog collection shop kollektion sortiment under below less than up bis unter und oder der die das ein eine einen mir mich ich sie du bitte zeigen zeige suche möchte haben gibt es für mit aus von zu dieses diesen diese produkt produkte informationen details welche welcher wie was farbe farben größe größen preis kostet auf lager max maximum euro eur kaptan recommend recommendation recommendations empfehlen empfehlung".split(
    " ",
  ),
);
export function assistantTokens(text: string) {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((word) => !stop.has(word) && !/^\d+$/.test(word))
    .map((word) => aliases[word] ?? word);
}
export function assistantBudget(question: string) {
  const q = question.toLowerCase();
  const between = q.match(
    /(?:between|zwischen)\s*€?\s*(\d+(?:[.,]\d+)?)\s*(?:€|eur|euro)?\s*(?:and|und|to|bis|-)\s*€?\s*(\d+(?:[.,]\d+)?)/,
  );
  const max = q.match(
    /(?:under|below|up to|less than|unter|bis|max(?:imum)?)\s*€?\s*(\d+(?:[.,]\d+)?)/,
  );
  const min = q.match(/(?:over|above|at least|über|ab|mindestens)\s*€?\s*(\d+(?:[.,]\d+)?)/);
  const num = (s: string) => Number(s.replace(",", "."));
  return between
    ? {
        min: Math.min(num(between[1]), num(between[2])),
        max: Math.max(num(between[1]), num(between[2])),
      }
    : { min: min ? num(min[1]) : undefined, max: max ? num(max[1]) : undefined };
}
export interface SearchableProduct {
  name: string;
  short_description: string | null;
  full_description: string | null;
  price: number;
  specifications: unknown;
  categories: { name: string } | null;
  product_variants: { variant_type: string; variant_value: string; is_available: boolean | null }[];
}
export function matchAssistantProducts<T extends SearchableProduct>(
  products: T[],
  question: string,
) {
  const tokens = assistantTokens(question);
  const { min, max } = assistantBudget(question);
  const generic =
    /\b(products?|catalogue|catalog|collection|shop|produkte|kollektion|sortiment)\b/i.test(
      question,
    ) && tokens.length === 0;
  return products
    .map((product) => {
      const name = assistantTokens(`${product.name} ${product.categories?.name ?? ""}`);
      const specs =
        product.specifications && typeof product.specifications === "object"
          ? Object.entries(product.specifications)
              .filter(([key, value]) => !key.startsWith("_") && typeof value === "string")
              .map(([, value]) => value)
              .join(" ")
          : "";
      const variants = product.product_variants
        .filter((v) => v.is_available !== false)
        .map((v) => v.variant_value)
        .join(" ");
      const corpus = assistantTokens(
        `${product.name} ${product.short_description ?? ""} ${product.full_description ?? ""} ${specs} ${product.categories?.name ?? ""} ${variants}`,
      );
      const matches = tokens.filter((token) => corpus.includes(token));
      const score = matches.reduce((sum, token) => sum + (name.includes(token) ? 4 : 1), 0);
      const fits =
        (min === undefined || product.price >= min) && (max === undefined || product.price <= max);
      return {
        product,
        score,
        eligible:
          fits &&
          (tokens.length
            ? matches.length === tokens.length
            : generic || min !== undefined || max !== undefined),
      };
    })
    .filter((row) => row.eligible)
    .sort((a, b) => b.score - a.score || a.product.price - b.product.price)
    .map((row) => row.product);
}
