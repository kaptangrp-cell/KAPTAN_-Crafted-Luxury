export function moveMedia<T extends { sort_order: number }>(
  items: T[],
  from: number,
  to: number,
): T[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  )
    return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((item, index) => ({ ...item, sort_order: index }));
}
