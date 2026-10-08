/** Store prices and payments are always EUR; language only changes number formatting. */
export function formatEuro(amount: number, language = "en"): string {
  return new Intl.NumberFormat(language.startsWith("de") ? "de-DE" : "en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
