import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getJournalPostBySlug } from "@/lib/journal.functions";
import { PageLayout } from "@/components/layout/PageLayout";

function postQueryOptions(slug: string) {
  return queryOptions({
    queryKey: ["journal-post", slug],
    queryFn: () => getJournalPostBySlug({ data: { slug } }),
  });
}

export const Route = createFileRoute("/journal_/$slug")({
  loader: async ({ context, params }) => {
    const result = await context.queryClient.ensureQueryData(postQueryOptions(params.slug));
    if (!result?.post) throw notFound();
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — KAPTAN Journal` }],
  }),
  component: JournalPostPage,
});

function formatDate(value: string | null, language: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(language === "de" ? "de-DE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function JournalPostPage() {
  const { t, i18n } = useTranslation();
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(postQueryOptions(slug));
  const post = data.post!;

  const paragraphs = post.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <PageLayout>
      <article className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <Link
          to="/journal"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-gold/70 hover:text-gold"
        >
          <ArrowLeft size={14} />
          {t("journal.backToJournal")}
        </Link>

        {post.category && (
          <p className="mt-8 text-xs uppercase tracking-[0.2em] text-gold">{post.category}</p>
        )}
        <h1 className="mt-3 font-serif text-4xl font-semibold text-white md:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 text-sm text-white/40">
          {post.author_name} · {formatDate(post.published_at, i18n.language)}
        </p>

        {post.cover_image_url && (
          <div className="mt-10 aspect-[16/9] overflow-hidden bg-[#1A1A1A]">
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="mt-10 space-y-6">
          {paragraphs.map((p, i) => (
            <p key={i} className="leading-relaxed text-white/80">
              {p}
            </p>
          ))}
        </div>

        <div className="mt-16 border-t border-gold/10 pt-8">
          <Link
            to="/journal"
            className="inline-block border border-gold px-5 py-2.5 text-xs uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-black"
          >
            {t("journal.moreFromJournal")}
          </Link>
        </div>
      </article>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt ?? undefined,
            image: post.cover_image_url ?? undefined,
            datePublished: post.published_at ?? undefined,
            author: { "@type": "Organization", name: post.author_name },
            publisher: { "@type": "Organization", name: "KAPTAN" },
          }),
        }}
      />
    </PageLayout>
  );
}
