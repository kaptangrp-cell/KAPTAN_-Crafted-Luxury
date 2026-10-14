// Dedicated free worker, run on your own trusted Node + Java host. Never in the browser.
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { buildInvoice } from "../../src/lib/invoices/model.ts";
import { invoiceXml, xmlEscape } from "../../src/lib/invoices/xml.ts";
import { invoicePdf } from "../../src/lib/invoices/pdf.ts";
import { validateXml } from "./validate.mjs";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
const sha = (data) => createHash("sha256").update(data).digest("hex");
const assets = {
  inter: await readFile(
    new URL(
      "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
      import.meta.url,
    ),
  ),
  serif: await readFile(
    new URL(
      "../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff",
      import.meta.url,
    ),
  ),
  logo: await readFile(new URL("../../public/kaptan-logo.png", import.meta.url)),
};
for (let n = 0; n < 20; n++) {
  const row = check(await db.rpc("claim_invoice"));
  if (!row) break;
  try {
    const { order, items, paidDate, supplyDate, reference, reason } = row.source;
    if (![0, 19].includes(order.tax_data?.rate) || Number(order.discount) !== 0)
      throw new Error("Unsupported tax or discount snapshot; requires review");
    if (order.tax_data.rate === 19 && process.env.INVOICE_ALLOW_REGULAR_VAT !== "true")
      throw new Error(
        "Regular-VAT order requires review: Kaptan currently declares §19 exemption. Do not issue a 19% invoice automatically.",
      );
    if (order.tax_data.rate === 0 && order.tax_data.mode !== "kleinunternehmer")
      throw new Error("Missing §19 tax exemption snapshot");
    const model = buildInvoice({
      taxMode: order.tax_data.rate === 0 ? "kleinunternehmer" : "regular",
      number: row.number,
      kind: row.kind,
      issueDate: row.issue_date,
      supplyDate: supplyDate ?? null,
      paidDate,
      orderId: row.order_id,
      orderNumber: order.order_number,
      buyer: order.billing_data,
      items,
      shipping: Number(order.shipping_cost),
      total: Number(order.total),
      reference,
      reason,
    });
    const xml = invoiceXml(model),
      validation = await validateXml(xml);
    if (!validation.accepted) {
      check(
        await db
          .from("invoices")
          .update({
            state: "error",
            error: "KoSIT rejected the invoice. Review the validation report.",
            validation,
            lease: null,
            lease_until: null,
          })
          .eq("id", row.id)
          .eq("lease", row.lease),
      );
      continue;
    }
    const pdf = await invoicePdf(model, assets);
    check(
      await db.rpc("finish_invoice", {
        p_id: row.id,
        p_lease: row.lease,
        p_model: model,
        p_xml: xml,
        p_pdf: Buffer.from(pdf).toString("base64"),
        p_xml_hash: sha(xml),
        p_pdf_hash: sha(pdf),
        p_validation: validation,
      }),
    );
  } catch (e) {
    check(
      await db
        .from("invoices")
        .update({
          state: "error",
          error: String(e.message).slice(0, 500),
          lease: null,
          lease_until: null,
        })
        .eq("id", row.id)
        .eq("lease", row.lease),
    );
  }
}
// Atomically claim each email; stale leases can be retried within the provider's idempotency window.
const candidates = check(
  await db
    .from("invoice_delivery")
    .select("*")
    .or(`state.eq.pending,and(state.eq.sending,lease_until.lt.${new Date().toISOString()})`)
    .limit(20),
);
for (const candidate of candidates) {
  const lease = randomUUID();
  let query = db
    .from("invoice_delivery")
    .update({
      state: "sending",
      lease,
      lease_until: new Date(Date.now() + 120000).toISOString(),
      first_attempt_at: candidate.first_attempt_at ?? new Date().toISOString(),
    })
    .eq("invoice_id", candidate.invoice_id)
    .eq("state", candidate.state);
  if (candidate.lease) query = query.eq("lease", candidate.lease);
  const claimed = check(await query.select("*"));
  if (!claimed.length) continue;
  const update = async (data) =>
    check(
      await db
        .from("invoice_delivery")
        .update({ ...data, lease: null, lease_until: null })
        .eq("invoice_id", candidate.invoice_id)
        .eq("lease", lease),
    );
  if (
    candidate.first_attempt_at &&
    Date.now() - Date.parse(candidate.first_attempt_at) > 23 * 3600000
  ) {
    await update({
      state: "uncertain",
      error:
        "Provider idempotency window expired. Check email provider delivery before any manual resend.",
    });
    continue;
  }
  try {
    if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL)
      throw new Error("Configure RESEND_API_KEY and a verified FROM_EMAIL; email not sent");
    const invoice = check(
      await db
        .from("invoices")
        .select("*")
        .eq("id", candidate.invoice_id)
        .eq("state", "issued")
        .single(),
    );
    const i = invoice.model;
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.FROM_EMAIL,
        to: i.buyer.email,
        replyTo: i.seller.email,
        subject: `KAPTAN Rechnung ${i.number}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:640px;border-top:6px solid #c9a227;padding:28px"><h1 style="color:#9c7d20">KAPTAN</h1><p>Guten Tag ${xmlEscape(i.buyer.legalName)},</p><p>anbei erhalten Sie Ihre Rechnung <strong>${xmlEscape(i.number)}</strong> zu Bestellung ${xmlEscape(i.orderNumber)} als PDF und XRechnung.</p>${i.buyer.deliveryChannel === "portal" ? "<p>Dies ist Ihre E-Mail-Kopie. Die gesonderte Portal-Einreichung wird durch unser Team bearbeitet.</p>" : ""}<p>Vielen Dank!<br>${xmlEscape(i.seller.name)}</p></div>`,
        attachments: [
          {
            filename: i.number + ".xml",
            content: Buffer.from(invoice.xml).toString("base64"),
            contentType: "application/xml",
          },
          {
            filename: i.number + ".pdf",
            content: invoice.pdf_base64,
            contentType: "application/pdf",
          },
        ],
      },
      { idempotencyKey: `invoice/${invoice.id}` },
    );
    if (error) throw new Error(error.message);
    await update({
      state: "sent",
      sent_at: new Date().toISOString(),
      provider_id: data.id,
      error: null,
    });
    check(
      await db.from("invoice_audit").insert({
        invoice_id: invoice.id,
        event: "email_accepted_by_provider",
        details: { providerId: data.id },
      }),
    );
  } catch (e) {
    await update({ state: "error", error: String(e.message).slice(0, 500) });
  }
}
console.log("Invoice worker completed. Review invoice and delivery statuses in the admin portal.");
