export function cents(value: number | string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid payment amount");
  return Math.round(amount * 100);
}

export function verifyPayment(
  actual: { orderId?: string; providerId: string; amount: number; currency: string; paid: boolean },
  expected: { orderId: string; providerId: string; total: number },
) {
  if (
    !actual.paid ||
    actual.orderId !== expected.orderId ||
    actual.providerId !== expected.providerId ||
    actual.amount !== cents(expected.total) ||
    actual.currency.toUpperCase() !== "EUR"
  ) {
    throw new Error("Payment could not be verified for this order");
  }
}

export interface PaypalOrder {
  id: string;
  status: string;
  purchase_units?: Array<{
    reference_id?: string;
    invoice_id?: string;
    amount?: { value: string; currency_code: string };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: { value: string; currency_code: string };
      }>;
    };
  }>;
  links?: Array<{ rel: string; href: string }>;
}

export function verifyPaypalOrder(
  payment: PaypalOrder,
  expected: { providerId: string; orderNumber: string; total: number },
  captured = false,
) {
  const units = payment.purchase_units ?? [];
  if (
    payment.id !== expected.providerId ||
    units.length !== 1 ||
    units[0].reference_id !== expected.orderNumber ||
    units[0].invoice_id !== expected.orderNumber
  ) {
    throw new Error("PayPal order does not match this purchase");
  }
  const unit = units[0];
  if (captured) {
    const captures = unit.payments?.captures ?? [];
    if (
      payment.status !== "COMPLETED" ||
      captures.length !== 1 ||
      captures[0].status !== "COMPLETED" ||
      captures[0].amount.currency_code !== "EUR" ||
      cents(captures[0].amount.value) !== cents(expected.total)
    ) {
      throw new Error("PayPal capture could not be verified");
    }
  } else if (
    !unit.amount ||
    unit.amount.currency_code !== "EUR" ||
    cents(unit.amount.value) !== cents(expected.total)
  ) {
    throw new Error("PayPal amount does not match this purchase");
  }
}
