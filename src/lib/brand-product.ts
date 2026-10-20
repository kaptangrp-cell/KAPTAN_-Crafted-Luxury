/** Editorial headlines only: never infer a leather grade, origin or service availability. */
export function productBenefitKey(name: string): string {
  if (/salt|salz|himalaya/i.test(name)) return "brand.salt";
  if (/wallet|portemonnaie|geldbörse/i.test(name)) return "brand.wallet";
  if (/belt|gürtel/i.test(name)) return "brand.belt";
  if (/bag|tasche|rucksack/i.test(name)) return "brand.bag";
  return "brand.generic";
}
