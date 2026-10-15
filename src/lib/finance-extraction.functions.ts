import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ExtractionSchema } from "./finance/extraction";
const uuid = z.string().uuid();
export const financeDocumentDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: uuid }).parse(x))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_document_details", {
      p_id: data.id,
    });
    if (r.error) throw new Error(r.error.message);
    return z
      .object({
        retention: z
          .object({
            record_class: z.string(),
            retain_until: z.string().nullable(),
            legal_hold: z.boolean(),
            reason: z.string(),
            revision: z.number(),
          })
          .nullable(),
        extractions: z.array(
          z.object({
            id: uuid,
            engine: z.string(),
            created_at: z.string(),
            result: ExtractionSchema,
            validation: z
              .object({
                state: z.enum(["queued", "processing", "finished", "error"]),
                accepted: z.boolean().nullable(),
                engine: z.string().nullable(),
                configuration: z.string().nullable(),
                report: z.string().nullable(),
                error: z.string().nullable(),
                attempts: z.number(),
              })
              .nullable()
              .optional(),
          }),
        ),
      })
      .parse(r.data);
  });
export const financeExtractInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: uuid }).parse(x))
  .handler(async ({ context, data }) => {
    const client = context.supabase as SupabaseClient;
    const role = await client.rpc("finance_role");
    if (role.error || !["owner", "accountant", "staff"].includes(role.data))
      throw new Error("Forbidden");
    const access = await client.rpc("finance_document_access", { p_id: data.id });
    if (access.error) throw new Error(access.error.message);
    const doc = z
      .object({ sha256: z.string(), mime: z.enum(["application/xml", "application/pdf"]) })
      .parse(access.data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const file = await supabaseAdmin.storage.from("finance-originals").download(doc.sha256);
    if (file.error || !file.data) throw new Error("Original unavailable");
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const { createHash } = await import("node:crypto");
    if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256)
      throw new Error("Original fingerprint mismatch");
    const { extractInvoice, EXTRACTION_ENGINE } = await import("./finance/extraction");
    const xml =
      doc.mime === "application/xml"
        ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        : await (await import("./finance/embedded-invoice.server")).embeddedInvoice(bytes);
    const result = extractInvoice(xml);
    const r = await (supabaseAdmin as SupabaseClient).rpc("finance_extraction_save", {
      p_actor: context.userId,
      p_document: data.id,
      p_engine: EXTRACTION_ENGINE,
      p_hash: doc.sha256,
      p_result: { ...result, xml, xmlHash: createHash("sha256").update(xml).digest("hex") },
    });
    if (r.error) throw new Error(r.error.message);
    return { id: uuid.parse(r.data), result };
  });

export const financeValidationRetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: uuid }).parse(x))
  .handler(async ({ context, data }) => {
    const r = await (context.supabase as SupabaseClient).rpc("finance_validation_retry", {
      p_id: data.id,
    });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });
