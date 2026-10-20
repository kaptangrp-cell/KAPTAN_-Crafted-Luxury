import { BrandStory } from "@/components/common/BrandStory";
import { PhotoCarousel } from "@/components/media/PhotoCarousel";
import { translateCatalogText } from "@/lib/catalog-translation";
import { COLLECTIONS, collectionLabel } from "@/lib/catalog-collections";
import { CatalogText } from "@/components/common/CatalogText";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ShieldCheck, Gem, ShoppingBag, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getHeroSlides,
  getFeaturedProducts,
  getProductsByIds,
  getRecommendedProducts,
} from "@/lib/products.functions";
import { getFeaturedReviews } from "@/lib/reviews.functions";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import { ProductCard } from "@/components/product/ProductCard";
import { PageLayout } from "@/components/layout/PageLayout";
import { Price } from "@/components/common/Price";
import { Reveal } from "@/components/motion/Reveal";

const heroQueryOptions = queryOptions({
  queryKey: ["home-product-slides"],
  queryFn: () => getHeroSlides(),
});

const featuredQueryOptions = queryOptions({
  queryKey: ["featured-products"],
  queryFn: () => getFeaturedProducts(),
});

const featuredReviewsQueryOptions = queryOptions({
  queryKey: ["featured-reviews"],
  queryFn: () => getFeaturedReviews(),
});

function recentlyViewedQueryOptions(ids: string[]) {
  return queryOptions({
    queryKey: ["home-recently-viewed", ids],
    queryFn: () => getProductsByIds({ data: { ids } }),
    enabled: ids.length > 0,
  });
}

function recommendedQueryOptions(categoryIds: string[], excludeIds: string[]) {
  return queryOptions({
    queryKey: ["home-recommended", categoryIds, excludeIds],
    queryFn: () => getRecommendedProducts({ data: { categoryIds, excludeIds, limit: 8 } }),
    enabled: categoryIds.length > 0,
  });
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KAPTAN — Made for the journey. Built to become yours." },
      {
        name: "description",
        content:
          "Leather essentials with everyday purpose, personal support and care. Discover KAPTAN leather and salt collections.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(featuredQueryOptions),
      context.queryClient.ensureQueryData(heroQueryOptions),
    ]),
  component: HomePage,
});

function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: heroData } = useSuspenseQuery(heroQueryOptions);
  const { data: featuredData } = useSuspenseQuery(featuredQueryOptions);
  const { data: featuredReviewsData } = useQuery(featuredReviewsQueryOptions);

  const featuredProducts = featuredData?.products ?? [];
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentIds(getRecentlyViewedIds(undefined, 8));
  }, []);

  const { data: recentlyViewedData } = useQuery(recentlyViewedQueryOptions(recentIds));
  const recentlyViewedProducts = recentlyViewedData?.products ?? [];

  const recommendedCategoryIds = [
    ...new Set(
      recentlyViewedProducts
        .map((p) => (p as { category_id?: string | null }).category_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ].slice(0, 3);

  const recommendedExcludeIds = [
    ...new Set([...recentlyViewedProducts.map((p) => p.id), ...featuredProducts.map((p) => p.id)]),
  ];

  const { data: recommendedData } = useQuery(
    recommendedQueryOptions(recommendedCategoryIds, recommendedExcludeIds),
  );
  const recommendedProducts = (recommendedData?.products ?? []).slice(0, 4);

  const realTestimonials = (featuredReviewsData?.reviews ?? [])
    .filter((r) => r.body)
    .slice(0, 3)
    .map((r) => ({
      quote: r.body as string,
      name: r.reviewerName,
      subtitle: r.productName ?? "KAPTAN Customer",
      rating: r.rating,
      verified: r.isVerified,
    }));

  const testimonials = realTestimonials;

  return (
    <PageLayout>
      <section className="border-b border-gold/15 bg-[#0D0D0D]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 md:grid-cols-2 md:px-6 md:py-14">
          <div className="max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
              {t("home.collectionEyebrow")}
            </p>
            <h1 className="mt-4 font-serif text-4xl leading-tight text-white md:text-6xl">
              {t("home.heroLine1")} <span className="text-gold">{t("home.heroLine2")}</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
              {t("home.heroSubtitle")}
            </p>
            <Link
              to="/products"
              className="mt-7 inline-flex items-center gap-4 bg-gold px-7 py-3.5 font-semibold text-black transition-colors hover:bg-gold-vivid"
            >
              {t("home.heroShopNow")}
              <ArrowUpRight size={18} />
            </Link>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
              <span>{t("home.qualityLabel")}</span>
              <span>{t("home.styleLabel")}</span>
              <span>{t("home.durabilityLabel")}</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-gold/15 bg-[#1A1A1A]">
            <PhotoCarousel
              slides={heroData.slides.map((s) => ({
                url: s.url,
                alt: translateCatalogText(s.name, i18n.language),
                slug: s.slug,
              }))}
              className="aspect-[4/3]"
              priority
              footer={(index) => {
                const slide = heroData.slides[index];
                return slide ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <Link
                      to="/products/$slug"
                      params={{ slug: slide.slug }}
                      className="font-serif text-lg text-white hover:text-gold"
                    >
                      <CatalogText text={slide.name} />
                    </Link>
                    <Price amount={slide.price} className="font-semibold text-gold" />
                    {!slide.available && (
                      <span className="text-xs text-white/65">{t("products.outOfStock")}</span>
                    )}
                  </div>
                ) : null;
              }}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-serif text-3xl text-white">{t("home.bestSellers")}</h2>
          <Link to="/products" className="inline-flex items-center gap-2 text-sm text-gold">
            {t("products.viewAllProducts")}
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <nav aria-label={t("home.collectionsTitle")} className="mb-8 flex flex-wrap gap-2">
          <Link
            to="/products"
            className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-black"
          >
            {t("footer.allProducts")}
          </Link>
          {COLLECTIONS.map((collection) => (
            <Link
              key={collection}
              to="/products"
              search={{ collection }}
              className="rounded-full border border-gold/30 px-4 py-2 text-sm text-gold"
            >
              {collectionLabel(collection, i18n.language.startsWith("de"))}
            </Link>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
          {featuredProducts.map((product, index) => (
            <Reveal key={product.id} delay={Math.min(index, 3) * 0.06}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
        {!featuredProducts.length && (
          <Link
            to="/products"
            className="block rounded-xl border border-gold/20 p-8 text-center text-gold"
          >
            {t("home.exploreCollection")} →
          </Link>
        )}
      </section>

      <section className="border-y border-gold/10 bg-[#0D0D0D]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-7 md:grid-cols-4 md:px-6">
          {[
            { icon: Gem, label: "qualityLabel" },
            { icon: Sparkles, label: "styleLabel" },
            { icon: ShoppingBag, label: "durabilityLabel" },
            { icon: ShieldCheck, label: "secureCheckout" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center justify-center gap-3 text-sm text-white/70"
            >
              <Icon size={20} className="shrink-0 text-gold" strokeWidth={1.5} />
              {t(`home.${label}`)}
            </div>
          ))}
        </div>
      </section>

      <BrandStory compact />

      {recommendedProducts.length > 0 && (
        <section className="bg-black px-4 py-20 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-10 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold/70">
                  {t("home.justForYou")}
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-white md:text-4xl">
                  {t("home.recommendedForYou")}
                </h2>
              </div>
            </Reveal>

            <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
              {recommendedProducts.map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 3) * 0.08}>
                  <ProductCard product={p as never} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {recentlyViewedProducts.length > 1 && (
        <section className="bg-[#0D0D0D] px-4 py-20 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-10 text-center">
              <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
                {t("pdp.recentlyViewed")}
              </h2>
              <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
            </Reveal>

            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
              {recentlyViewedProducts.slice(0, 4).map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 3) * 0.08}>
                  <ProductCard product={p as never} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {testimonials.length > 0 && (
        <section className="bg-[#0D0D0D] px-4 py-20 md:px-6">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-10 text-center">
              <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
                {t("home.testimonialsTitle")}
              </h2>
              <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
            </Reveal>

            <div className="grid gap-6 md:grid-cols-3">
              {testimonials.map((tm, i) => (
                <Reveal key={i} delay={i * 0.1} className="border border-gold/10 bg-[#1A1A1A] p-6">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <span key={j} className={j < tm.rating ? "text-gold" : "text-gold/20"}>
                          ★
                        </span>
                      ))}
                    </div>
                    {tm.verified && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gold/70">
                        {t("pdp.verifiedPurchase")}
                      </span>
                    )}
                  </div>
                  <p className="font-serif italic leading-relaxed text-white/80">"{tm.quote}"</p>
                  <div className="mt-4 border-t border-gold/10 pt-4">
                    <p className="text-sm font-semibold text-white">{tm.name}</p>
                    <p className="text-xs text-gold/60">{tm.subtitle}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-y border-gold/20 bg-black px-4 py-20 md:px-6">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="font-serif text-3xl font-bold text-white">{t("home.newsletterTitle")}</h2>
          <p className="mt-3 text-white/60">{t("home.newsletterSubtitle")}</p>

          <Link
            to="/contact"
            className="mt-6 inline-flex rounded-lg bg-gold px-6 py-3 font-semibold text-black"
          >
            {t("brand.support")}
          </Link>
        </Reveal>
      </section>
    </PageLayout>
  );
}
