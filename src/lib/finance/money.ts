/** Financial values cross the API as decimal strings, never JS floating point. */
export function cents(value: string): string {
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with at most two decimals");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}
export function euros(value: string, german = true): string {
  const n = BigInt(value),
    abs = n < 0n ? -n : n;
  const integer = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, german ? "." : ",");
  return `${n < 0n ? "−" : ""}${integer}${german ? "," : "."}${(abs % 100n).toString().padStart(2, "0")} €`;
}
/** Stable largest remainder; exact conservation of every cent. */
export function allocate(total: string, weights: string[]): string[] {
  const amount = BigInt(total),
    ws = weights.map(BigInt),
    sum = ws.reduce((a, b) => a + b, 0n);
  if (amount < 0n || !ws.length || ws.some((w) => w < 0n) || sum <= 0n)
    throw new Error("Invalid allocation");
  const rows = ws.map((w, i) => ({ i, amount: (amount * w) / sum, remainder: (amount * w) % sum }));
  let left = amount - rows.reduce((a, b) => a + b.amount, 0n);
  for (const row of [...rows].sort((a, b) =>
    a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (left === 0n) break;
    row.amount++;
    left--;
  }
  return rows.map((r) => r.amount.toString());
}
