import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inspectDocument } from "./documents.server";
export async function bankOriginal(client: SupabaseClient, id: string) {
  const r = await client.rpc("finance_document_access", { p_id: id });
  if (r.error) throw new Error(r.error.message);
  const doc = z.object({ sha256: z.string(), mime: z.literal("text/csv") }).parse(r.data);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await supabaseAdmin.storage.from("finance-originals").download(doc.sha256);
  if (result.error || !result.data) throw new Error("Bank original unavailable");
  const file = inspectDocument(
    Buffer.from(await result.data.arrayBuffer()).toString("base64"),
    true,
  );
  if (file.hash !== doc.sha256) throw new Error("Original fingerprint mismatch");
  return new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
}
