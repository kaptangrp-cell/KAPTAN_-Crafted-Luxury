import { createClient } from "@supabase/supabase-js";
import { validateXml } from "../invoices/validate.mjs";
import { batchSize } from "../invoices/batch.mjs";
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
for (let n = 0; n < batchSize(process.env.INCOMING_BATCH_SIZE, 10); n++) {
  const claim = await db.rpc("finance_validation_claim");
  if (claim.error) throw new Error(claim.error.message);
  const job = claim.data;
  if (!job) break;
  let result = null,
    error = null;
  try {
    if (typeof job.xml !== "string" || !job.xml) throw new Error("Preserved extracted XML missing");
    result = await validateXml(job.xml);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const finished = await db.rpc("finance_validation_finish", {
    p_id: job.id,
    p_lease: job.lease,
    p_result: result,
    p_error: error,
  });
  if (finished.error) throw new Error(finished.error.message);
}
