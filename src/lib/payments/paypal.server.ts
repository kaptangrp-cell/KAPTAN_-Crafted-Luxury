/**
 * Thin wrapper around PayPal's REST API v2 (Orders).
 *
 * We call the REST API directly with fetch instead of pulling in an SDK —
 * PayPal's own official Node SDKs are either deprecated or heavyweight, and
 * the Orders API surface we need (create + capture) is tiny.
 *
 * Docs: https://developer.paypal.com/docs/api/orders/v2/
 */

function getBaseUrl() {
  // Defaults to sandbox so nobody accidentally takes real payments before
  // they've explicitly opted into PAYPAL_ENV=live.
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function isPaypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal is not configured");
  }

  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface PaypalOrderItem {
  name: string;
  quantity: number;
  unitAmount: number;
}

/**
 * Creates a PayPal order (intent=CAPTURE) and returns the id + the
 * "approve" link the customer should be redirected to.
 */
export async function createPaypalOrder(params: {
  orderNumber: string;
  currency: string;
  itemTotal: number;
  shippingTotal: number;
  total: number;
  items: PaypalOrderItem[];
  returnUrl: string;
  cancelUrl: string;
}) {
  const accessToken = await getAccessToken();

  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.orderNumber,
          invoice_id: params.orderNumber,
          amount: {
            currency_code: params.currency,
            value: params.total.toFixed(2),
            breakdown: {
              item_total: { currency_code: params.currency, value: params.itemTotal.toFixed(2) },
              shipping: { currency_code: params.currency, value: params.shippingTotal.toFixed(2) },
            },
          },
          items: params.items.map((item) => ({
            name: item.name.slice(0, 127),
            quantity: String(item.quantity),
            unit_amount: { currency_code: params.currency, value: item.unitAmount.toFixed(2) },
          })),
        },
      ],
      application_context: {
        brand_name: "KAPTAN",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`PayPal order creation failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string; links: { rel: string; href: string }[] };
  const approveLink = data.links.find((l) => l.rel === "approve")?.href;

  if (!approveLink) throw new Error("PayPal did not return an approval link");

  return { paypalOrderId: data.id, approveUrl: approveLink };
}

/** Captures an approved PayPal order. Returns true when funds were captured. */
export async function capturePaypalOrder(paypalOrderId: string) {
  const accessToken = await getAccessToken();

  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await res.json()) as { status: string };

  if (!res.ok) {
    throw new Error(`PayPal capture failed: ${res.status} ${JSON.stringify(data)}`);
  }

  return { completed: data.status === "COMPLETED", raw: data };
}
