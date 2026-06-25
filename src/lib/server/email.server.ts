import { Resend } from "resend";

type OrderStatus =
  | "ordered"
  | "packaging"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

const BRAND_URL = "https://www.kaptangrp.com";
const LOGO_URL = "https://www.kaptangrp.com/kaptan-logo.png";

export async function sendOrderStatusEmail({
  to,
  customerName,
  orderNumber,
  status,
}: {
  to: string;
  customerName: string | null;
  orderNumber: string;
  status: OrderStatus;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "KAPTAN <contact@kaptangrp.com>";

  if (!resendApiKey) {
    console.warn("RESEND_API_KEY missing. Email not sent.");
    return;
  }

  const resend = new Resend(resendApiKey);
  const statusText = statusLabel(status);

  const { error } = await resend.emails.send({
    from: fromEmail,
    to,
    subject: `KAPTAN Order ${orderNumber}: ${statusText}`,
    html: buildOrderStatusEmail({
      customerName: customerName || "Customer",
      orderNumber,
      status,
    }),
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "Email failed to send",
    );
  }

  console.log("Order status email sent to:", to);
}

function buildOrderStatusEmail({
  customerName,
  orderNumber,
  status,
}: {
  customerName: string;
  orderNumber: string;
  status: OrderStatus;
}) {
  const statusText = statusLabel(status);
  const message = statusMessage(status);

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000000;font-family:Arial,sans-serif;color:#ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:32px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#0D0D0D;border:1px solid rgba(255,235,0,0.35);">
            <tr>
              <td align="center" style="padding:28px 24px 18px;">
                <img src="${LOGO_URL}" alt="KAPTAN" width="90" style="display:block;margin:0 auto 12px;" />
                <h1 style="margin:0;color:#FFEB00;font-size:24px;letter-spacing:4px;">KAPTAN</h1>
                <p style="margin:8px 0 0;color:#cfcfcf;font-size:13px;">Crafted Luxury • Premium Leather</p>
              </td>
            </tr>

            <tr>
              <td style="height:1px;background:linear-gradient(90deg,transparent,#FFEB00,transparent);"></td>
            </tr>

            <tr>
              <td style="padding:30px 28px;">
                <p style="margin:0 0 14px;font-size:16px;">Hello ${escapeHtml(customerName)},</p>

                <p style="margin:0 0 20px;color:#dddddd;line-height:1.6;">
                  Your KAPTAN order has been updated.
                </p>

                <div style="background:#000000;border:1px solid rgba(255,235,0,0.25);padding:18px;margin:22px 0;">
                  <p style="margin:0;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Number</p>
                  <p style="margin:6px 0 0;color:#FFEB00;font-size:20px;font-weight:bold;">${escapeHtml(orderNumber)}</p>
                </div>

                <div style="text-align:center;margin:28px 0;">
                  <p style="margin:0 0 10px;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Current Status</p>
                  <div style="display:inline-block;background:#FFEB00;color:#000000;padding:12px 22px;font-weight:bold;font-size:16px;letter-spacing:1px;">
                    ${escapeHtml(statusText)}
                  </div>
                </div>

                <p style="margin:0 0 26px;color:#dddddd;line-height:1.6;text-align:center;">
                  ${escapeHtml(message)}
                </p>

                ${timeline(status)}

                <div style="text-align:center;margin-top:30px;">
                  <a href="${BRAND_URL}/orders" style="display:inline-block;background:#FFEB00;color:#000000;text-decoration:none;padding:13px 26px;font-weight:bold;">
                    View My Order
                  </a>
                </div>
              </td>
            </tr>

            <tr>
              <td style="border-top:1px solid rgba(255,235,0,0.2);padding:22px 28px;text-align:center;">
                <p style="margin:0 0 8px;color:#bbbbbb;font-size:13px;">Need help?</p>
                <p style="margin:0;color:#FFEB00;font-size:13px;">contact@kaptangrp.com</p>
                <p style="margin:10px 0 0;color:#777;font-size:12px;">
                  © ${new Date().getFullYear()} KAPTAN. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

function timeline(status: OrderStatus) {
  const steps: { key: OrderStatus; label: string }[] = [
    { key: "ordered", label: "Ordered" },
    { key: "packaging", label: "Packaging" },
    { key: "out_for_delivery", label: "Out for Delivery" },
    { key: "delivered", label: "Delivered" },
  ];

  if (status === "cancelled") {
    return `
      <div style="background:#1A0000;border:1px solid rgba(239,68,68,0.45);padding:16px;text-align:center;color:#fecaca;">
        This order has been cancelled.
      </div>
    `;
  }

  const currentIndex = steps.findIndex((s) => s.key === status);

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      <tr>
        ${steps
          .map((step, index) => {
            const active = index <= currentIndex;
            return `
              <td align="center" style="width:25%;">
                <div style="width:28px;height:28px;border-radius:50%;margin:auto;background:${active ? "#FFEB00" : "#333"};color:${active ? "#000" : "#999"};line-height:28px;font-weight:bold;">
                  ${active ? "✓" : index + 1}
                </div>
                <p style="margin:8px 0 0;font-size:11px;color:${active ? "#FFEB00" : "#888"};">
                  ${step.label}
                </p>
              </td>
            `;
          })
          .join("")}
      </tr>
    </table>
  `;
}

function statusLabel(status: OrderStatus) {
  switch (status) {
    case "ordered":
      return "Ordered";
    case "packaging":
      return "Packaging";
    case "out_for_delivery":
      return "Out for Delivery";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
  }
}

function statusMessage(status: OrderStatus) {
  switch (status) {
    case "ordered":
      return "We have received your order and it is now in our system.";
    case "packaging":
      return "Your order is being prepared and packed carefully.";
    case "out_for_delivery":
      return "Your order is on the way and will be delivered soon.";
    case "delivered":
      return "Your order has been delivered. We hope you enjoy your purchase.";
    case "cancelled":
      return "Your order has been cancelled. If you have questions, please contact us.";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}