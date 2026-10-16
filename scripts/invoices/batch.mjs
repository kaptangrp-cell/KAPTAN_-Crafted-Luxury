export function batchSize(value, fallback, maximum = 20) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > maximum) throw new Error("Invalid worker batch size");
  return n;
}
