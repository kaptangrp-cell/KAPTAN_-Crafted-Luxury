import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(sb: any, userId: string) {
  const { data } = await sb.from("profiles").select("role").eq("id", userId).single();
  if (!data || data.role !== "admin") throw new Error("Forbidden");
}

const JOURNAL_LIST_FIELDS =
  "id, slug, title, excerpt, cover_image_url, category, author_name, published_at, created_at";

/**
 * Public: published journal posts only, newest first. Used by the /journal
 * index page.
 */
export const getJournalPosts = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number; category?: string } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    let query = supabase
      .from("journal_posts")
      .select(JOURNAL_LIST_FIELDS)
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (data.category) query = query.eq("category", data.category);
    if (data.limit) query = query.limit(data.limit);

    const { data: posts, error } = await query;
    if (error) throw new Error(error.message);

    return { posts: posts ?? [] };
  });

/**
 * Public: a single published post by slug, for the /journal/$slug page.
 * Returns null (not an error) when the slug doesn't exist or isn't
 * published, so the route can render a proper 404 instead of a crash.
 */
export const getJournalPostBySlug = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { data: post, error } = await supabase
      .from("journal_posts")
      .select("id, slug, title, excerpt, body, cover_image_url, category, author_name, published_at")
      .eq("slug", data.slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return { post: post ?? null };
  });

/**
 * Admin: every post regardless of published state, for the admin journal
 * manager list view.
 */
export const adminListJournalPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("journal_posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { posts: data ?? [] };
  });

const JournalPostSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500).nullable(),
  body: z.string().max(20000),
  cover_image_url: z.string().url().max(2000).nullable(),
  category: z.string().max(100).nullable(),
  author_name: z.string().min(1).max(200),
  is_published: z.boolean(),
});

/**
 * Admin: create or update a journal post. When flipping is_published from
 * false to true for the first time, stamps published_at so the post gets
 * a stable publish date instead of shifting every time it's re-saved.
 */
export const adminUpsertJournalPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => JournalPostSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { id, ...payload } = data;

    if (id) {
      const { data: existing } = await supabaseAdmin
        .from("journal_posts")
        .select("is_published, published_at")
        .eq("id", id)
        .single();

      const shouldStampPublishedAt = payload.is_published && !existing?.published_at;

      const { error } = await supabaseAdmin
        .from("journal_posts")
        .update({
          ...payload,
          ...(shouldStampPublishedAt ? { published_at: new Date().toISOString() } : {}),
        })
        .eq("id", id);

      if (error) throw new Error(error.message);
      return { id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("journal_posts")
      .insert({
        ...payload,
        published_at: payload.is_published ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminDeleteJournalPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("journal_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
