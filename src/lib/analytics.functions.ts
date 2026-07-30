import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const LogVisitSchema = z.object({
  sessionId: z.string().min(1).max(100),
  path: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
});

/**
 * Records one row per browser session (not per pageview) so the admin
 * dashboard can compute a conversion rate = orders / visits for a period.
 * Public/unauthenticated by design — every shopper needs to be able to log
 * a visit, including guests who never sign in.
 */
export const logVisit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LogVisitSchema.parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabase.from("site_visits").insert({
      session_id: data.sessionId,
      path: data.path ?? null,
      referrer: data.referrer ?? null,
    });

    // Never let analytics failures surface to the shopper — swallow errors.
    if (error) {
      console.error("logVisit failed:", error.message);
    }

    return { ok: true };
  });
