import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PlanSchema, ActionSchema, berlinDay, type Sale, type Stock } from "@/lib/growth/model";

async function admin(client: SupabaseClient, id: string) {
  const { data, error } = await client.from("profiles").select("role").eq("id", id).single();
  if (error || data?.role !== "admin") throw new Error("Forbidden");
}
function failure(error: { code?: string; message: string } | null) {
  if (error)
    throw new Error(
      ["42P01", "PGRST205"].includes(error.code ?? "")
        ? "Growth Planner migration must be applied before use."
        : error.message,
    );
}
export const growthLoad = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await admin(context.supabase, context.userId);
    const client = context.supabase as SupabaseClient;
    const [plans, actions] = await Promise.all([
      client.from("growth_plans").select("id,period,data,revision").order("period"),
      client.from("growth_actions").select("id,plan_id,data,revision").order("id"),
    ]);
    failure(plans.error);
    failure(actions.error);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    async function all<T>(
      fetch: (
        from: number,
        to: number,
      ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    ) {
      const rows: T[] = [];
      for (let from = 0; ; from += 500) {
        const result = await fetch(from, from + 499);
        failure(result.error);
        rows.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < 500) return rows;
      }
    }
    const [orders, products] = await Promise.all([
      all((from, to) =>
        supabaseAdmin
          .from("orders")
          .select(
            "id,user_id,customer_email,created_at,total,discount,status,payment_status,order_items(product_id,product_name,quantity,line_total,products(cost_price))",
          )
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
      all((from, to) =>
        supabaseAdmin
          .from("products")
          .select("id,name,price,stock_quantity,is_available,categories(name)")
          .order("id")
          .range(from, to),
      ),
    ]);
    const seen = new Set<string>();
    const sales: Sale[] = orders
      .filter((o) => o.created_at)
      .map((o) => {
        const key = o.customer_email?.trim().toLowerCase() || o.user_id || o.id;
        const wasPaid = ["paid", "refunded", "partially_refunded"].includes(o.payment_status ?? "");
        const isNew = wasPaid && !seen.has(key) && o.status !== "cancelled";
        if (wasPaid && o.status !== "cancelled") seen.add(key);
        return {
          id: o.id,
          day: berlinDay(new Date(o.created_at!)),
          total: Number(o.total),
          discount: Number(o.discount ?? 0),
          payment: o.payment_status ?? "pending",
          status: o.status ?? "pending",
          newCustomer: isNew,
          items: o.order_items.map((i) => ({
            productId: i.product_id,
            name: i.product_name,
            quantity: i.quantity,
            total: Number(i.line_total),
            cost: i.products?.cost_price == null ? null : Number(i.products.cost_price),
          })),
        };
      });
    const stock: Stock[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      category: p.categories?.name ?? "",
      stock: p.stock_quantity,
      active: p.is_available === true,
    }));
    return {
      plans: (plans.data ?? []).map((p) => ({
        id: String(p.id),
        revision: Number(p.revision),
        data: PlanSchema.parse(p.data),
      })),
      actions: (actions.data ?? []).map((a) => ({
        id: String(a.id),
        plan_id: String(a.plan_id),
        revision: Number(a.revision),
        data: ActionSchema.parse(a.data),
      })),
      sales,
      stock,
      today: berlinDay(),
    };
  });
export const growthSavePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        revision: z.number().int().nonnegative(),
        plan: PlanSchema,
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await admin(context.supabase, context.userId);
    const c = context.supabase as SupabaseClient;
    const query = data.id
      ? c
          .from("growth_plans")
          .update({ data: data.plan, period: data.plan.period })
          .eq("id", data.id)
          .eq("revision", data.revision)
      : c.from("growth_plans").insert({ data: data.plan, period: data.plan.period });
    const r = await query.select("id,revision").maybeSingle();
    failure(r.error);
    if (!r.data) throw new Error("This plan changed in another session. Reload before saving.");
    return { id: String(r.data.id), revision: Number(r.data.revision) };
  });
export const growthSaveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        planId: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        action: ActionSchema,
      })
      .parse(v),
  )
  .handler(async ({ context, data }) => {
    await admin(context.supabase, context.userId);
    const c = context.supabase as SupabaseClient;
    const parent = await c.from("growth_plans").select("data").eq("id", data.planId).single();
    failure(parent.error);
    const plan = PlanSchema.parse(parent.data?.data);
    if (data.action.deadline < plan.start || data.action.deadline >= plan.buckets.at(-1)!.end)
      throw new Error("Action deadline must be within the planning period.");
    const q = data.id
      ? c
          .from("growth_actions")
          .update({ data: data.action })
          .eq("id", data.id)
          .eq("plan_id", data.planId)
          .eq("revision", data.revision)
      : c.from("growth_actions").insert({ plan_id: data.planId, data: data.action });
    const r = await q.select("id").maybeSingle();
    failure(r.error);
    if (!r.data) throw new Error("This action changed in another session. Reload before saving.");
    return { ok: true };
  });
export const growthDeleteAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).parse(v),
  )
  .handler(async ({ context, data }) => {
    await admin(context.supabase, context.userId);
    const r = await (context.supabase as SupabaseClient)
      .from("growth_actions")
      .delete()
      .eq("id", data.id)
      .eq("revision", data.revision)
      .select("id");
    failure(r.error);
    if (!r.data?.length) throw new Error("This action changed. Reload before deleting.");
    return { ok: true };
  });
