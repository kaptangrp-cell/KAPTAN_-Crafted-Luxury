/** Fulfilment queue ends at dispatch, not when packing starts. */
export const preparationStatuses = ["ordered", "pending", "packaging", "processing"];
export function needsPreparation(order: { payment_status: string | null; status: string | null }) {
  return order.payment_status === "paid" && preparationStatuses.includes(order.status ?? "ordered");
}
