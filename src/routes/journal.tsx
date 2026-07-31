import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getJournalPosts } from "@/lib/journal.functions";
import { PageLayout } from "@/components/layout/PageLayout";
import { Reveal } from "@/components/motion/Reveal";

const journalListQueryOptions = queryOptions({
  queryKey: ["journal-posts"],
  queryFn: () => getJournalPosts({ data: {} }),
});

export const Route = createFileRoute("/journal")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(journalListQueryOptions);
  },
  head: () => ({
    meta: [
      { title: "Journal — KAPTAN" },
      {
        name: "description",
        content: "Craftsmanship notes, origin stories, and care guides from the KAPTAN atelier.",
      },
    ],
  }),
  component: JournalIndexPage,
});

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function JournalIndexPage() {
  const { data } = useSuspenseQuery(journalListQueryOptions);
  const posts = data?.posts ?? [];

  return (
    <PageLayout>
      <section className="border-b border-gold/10 bg-black py-20">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">The Atelier</p>
          <h1 className="mt-4 font-serif text-5xl font-semibold text-white md:text-6xl">
            The <span className="text-gold">Journal</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70">
            Notes on craftsmanship, origin, and care — from the people who make what you carry.
          </p>
        </div>
      </section>

      {posts.length === 0 ? (
        <section className="mx-auto max-w-2xl px-4 py-24 text-center md:px-6">
          <p className="text-white/60">New stories are on their way. Check back soon.</p>
        </section>
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => (
              <Reveal key={post.id} delay={Math.min(i, 4) * 0.06}>
                <Link
                  to="/journal/$slug"
                  params={{ slug: post.slug }}
                  className="group block"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[#1A1A1A]">
                    {post.cover_image_url ? (
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gold/20">
                        <span className="font-serif text-2xl">KAPTAN</span>
                      </div>
                    )}
                  </div>
                  {post.category && (
                    <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-gold">
                      {post.category}
                    </p>
                  )}
                  <h2 className="mt-2 font-serif text-xl text-white transition-colors group-hover:text-gold">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/60">
                      {post.excerpt}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-white/40">
                    {post.author_name} · {formatDate(post.published_at)}
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </PageLayout>
  );
}
