import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ShieldCheck, Hand, Truck, Leaf, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getFeaturedProducts,
  getCategories,
  getProductsByIds,
  getRecommendedProducts,
} from "@/lib/products.functions";
import { getFeaturedReviews } from "@/lib/reviews.functions";
import { subscribeNewsletter } from "@/lib/newsletter.functions";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import { ProductCard } from "@/components/product/ProductCard";
import { PageLayout } from "@/components/layout/PageLayout";
import { Reveal } from "@/components/motion/Reveal";

const heroSlides = [
  {
    image: "/banners/leather-bags.jpg",
    imageWebp: "/banners/leather-bags.webp",
    titleKey: "home.heroSlide1Title",
    subtitleKey: "home.heroSlide1Subtitle",
  },
  {
    image: "/banners/leather-belts.jpg",
    imageWebp: "/banners/leather-belts.webp",
    titleKey: "home.heroSlide2Title",
    subtitleKey: "home.heroSlide2Subtitle",
  },
  {
    image: "/banners/leather-footwear.jpg",
    imageWebp: "/banners/leather-footwear.webp",
    titleKey: "home.heroSlide3Title",
    subtitleKey: "home.heroSlide3Subtitle",
  },
  {
    image: "/banners/leather-jackets.jpg",
    imageWebp: "/banners/leather-jackets.webp",
    titleKey: "home.heroSlide4Title",
    subtitleKey: "home.heroSlide4Subtitle",
  },
];

const YOUTUBE_ID = "E_rwyu6cdmc";

const featuredQueryOptions = queryOptions({
  queryKey: ["featured-products"],
  queryFn: () => getFeaturedProducts(),
});

const categoriesQueryOptions = queryOptions({
  queryKey: ["categories"],
  queryFn: () => getCategories(),
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
    queryFn: () =>
      getRecommendedProducts({ data: { categoryIds, excludeIds, limit: 8 } }),
    enabled: categoryIds.length > 0,
  });
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KAPTAN — Crafted to Last. Lit to Inspire." },
      {
        name: "description",
        content: "Premium handcrafted leather products and authentic Himalayan salt lamps.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(featuredQueryOptions),
      context.queryClient.ensureQueryData(categoriesQueryOptions),
    ]),
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const { data: featuredData } = useSuspenseQuery(featuredQueryOptions);
  useSuspenseQuery(categoriesQueryOptions);
  const { data: featuredReviewsData } = useQuery(featuredReviewsQueryOptions);

  const subscribeFn = useServerFn(subscribeNewsletter);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);

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
    ...new Set([
      ...recentlyViewedProducts.map((p) => p.id),
      ...featuredProducts.map((p) => p.id),
    ]),
  ];

  const { data: recommendedData } = useQuery(
    recommendedQueryOptions(recommendedCategoryIds, recommendedExcludeIds),
  );
  const recommendedProducts = (recommendedData?.products ?? []).slice(0, 4);

  const fallbackTestimonials = [
    { quote: t("home.t1Quote"), name: "Omar H.", subtitle: `Dubai, UAE — ${t("home.t1Product")}`, rating: 5, verified: false },
    { quote: t("home.t2Quote"), name: "Sarah M.", subtitle: `London, UK — ${t("home.t2Product")}`, rating: 5, verified: false },
    { quote: t("home.t3Quote"), name: "Ali R.", subtitle: `Karachi, Pakistan — ${t("home.t3Product")}`, rating: 5, verified: false },
  ];

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

  const testimonials = realTestimonials.length >= 3 ? realTestimonials : fallbackTestimonials;

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion || heroPaused) return;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [heroPaused]);

  async function handleNewsletterSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSubscribing(true);
      const result = await subscribeFn({ data: { email: newsletterEmail } });
      toast.success(result.message);
      setNewsletterEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("home.subscriptionFailedToast"));
    } finally {
      setSubscribing(false);
    }
  }

  const slide = heroSlides[activeSlide];

  return (
    <PageLayout>
      <section
        className="relative min-h-[80vh] overflow-hidden bg-black"
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocus={() => setHeroPaused(true)}
        onBlur={() => setHeroPaused(false)}
      >
        <Link to="/products" className="absolute inset-0 block">
          {heroSlides.map((s, index) => (
            <picture key={s.image}>
              <source srcSet={s.imageWebp} type="image/webp" />
              <img
                src={s.image}
                alt={t(s.titleKey)}
                width={2200}
                height={1467}
                fetchPriority={index === 0 ? "high" : "low"}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                  index === activeSlide ? "opacity-70" : "opacity-0"
                }`}
              />
            </picture>
          ))}
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.86_0.18_95/0.12),transparent_70%)]" />
        </Link>

        <div className="relative z-10 flex min-h-[80vh] items-center justify-center px-4 text-center">
          <div className="max-w-4xl">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.4em] text-gold">
              KAPTAN
            </p>

            <h1 className="font-serif text-4xl font-bold leading-tight text-white md:text-6xl lg:text-7xl">
              {t(slide.titleKey)}
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gold-dark md:text-lg">
              {t(slide.subtitleKey)}
            </p>

            <div className="mx-auto mt-6 h-px w-24 bg-gold/40" />

            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/products"
                className="bg-gold px-8 py-3 font-semibold text-black transition-colors hover:bg-gold-vivid"
              >
                {t("home.heroShopNow")}
              </Link>
              <Link
                to="/products"
                search={{ category: "salt-lamp-natural" }}
                className="border border-gold px-8 py-3 font-semibold text-gold transition-colors hover:bg-gold hover:text-black"
              >
                {t("home.discoverSaltLamps")}
              </Link>
            </div>

            <div className="mt-8 flex justify-center gap-2">
              {heroSlides.map((s, index) => (
                <button
                  key={s.image}
                  onClick={() => setActiveSlide(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === activeSlide ? "w-8 bg-gold" : "w-2 bg-white/40"
                  }`}
                  aria-label={t("home.goToSlideAriaLabel", { number: index + 1 })}
                />
              ))}
            </div>

            <div className="mt-10 animate-bounce text-gold">
              <ChevronDown size={24} className="mx-auto" />
            </div>
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-24 md:px-6">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
            {t("home.manifestoEyebrow")}
          </p>
          <p className="mt-6 font-serif text-2xl font-medium leading-snug text-white/90 md:text-3xl lg:text-4xl">
            {t("home.manifestoLine")}
          </p>
          <div className="mx-auto mt-8 h-px w-16 bg-gold/40" />
        </Reveal>
      </section>

      <section className="border-y border-gold/10 bg-[#1A1A1A]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4 md:divide-x md:divide-gold/10 md:px-6">
          {[
            { icon: ShieldCheck, label: t("home.secureCheckout"), desc: t("home.secureCheckoutDesc") },
            { icon: Hand, label: t("home.handcrafted"), desc: t("home.handcraftedDesc") },
            { icon: Truck, label: t("home.fastDelivery"), desc: t("home.fastDeliveryDesc") },
            { icon: Leaf, label: t("home.sustainable"), desc: t("home.sustainableDesc") },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-1 text-center md:py-2">
              <b.icon size={24} className="text-gold" strokeWidth={1.5} />
              <span className="mt-1 text-sm font-semibold text-white">{b.label}</span>
              <span className="text-xs text-gold/60">{b.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-black">
        <Reveal className="grid md:grid-cols-2">
          <Link
            to="/products"
            search={{ category: "leather-wallets" }}
            className="group relative flex h-[420px] items-center justify-center overflow-hidden md:h-[560px]"
          >
            <picture>
              <source srcSet="/banners/leather-bags.webp" type="image/webp" />
              <img
                src="/banners/leather-bags.jpg"
                alt={t("home.leatherProducts")}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full scale-105 object-cover opacity-60 transition-all duration-700 ease-out group-hover:scale-110 group-hover:opacity-75"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
            <div className="relative z-10 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold/70">
                {t("home.fullGrainLeather")}
              </p>
              <h3 className="mt-3 font-serif text-3xl font-bold text-white md:text-4xl">
                {t("home.leatherProducts")}
              </h3>
              <span className="mt-4 inline-flex items-center gap-1 border-b border-gold pb-0.5 text-sm text-gold transition-all group-hover:gap-2">
                {t("home.shopNow")}
              </span>
            </div>
          </Link>

          <Link
            to="/products"
            search={{ category: "salt-lamp-natural" }}
            className="group relative flex h-[420px] items-center justify-center overflow-hidden bg-[#1A1A1A] md:h-[560px]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.7_0.15_70/0.25),transparent_70%)] transition-opacity duration-700 group-hover:opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="relative z-10 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold/70">
                {t("home.handCarvedKhewraSalt")}
              </p>
              <h3 className="mt-3 font-serif text-3xl font-bold text-white md:text-4xl">
                {t("home.himalayanSaltLamps")}
              </h3>
              <span className="mt-4 inline-flex items-center gap-1 border-b border-gold pb-0.5 text-sm text-gold transition-all group-hover:gap-2">
                {t("home.shopNow")}
              </span>
            </div>
          </Link>
        </Reveal>
      </section>

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

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {recommendedProducts.map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 3) * 0.08}>
                  <ProductCard product={p as never} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-[#0D0D0D] px-4 py-20 md:px-6">
        <div className="mx-auto max-w-7xl">
          <Reveal className="mb-10 text-center">
            <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
              {t("home.bestSellers")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
          </Reveal>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 3) * 0.08}>
                <ProductCard product={p as never} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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

      <section className="bg-black px-4 py-24 md:px-6">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.4em] text-gold">
              {t("home.journeyEyebrow")}
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-white md:text-4xl">
              {t("home.storyTitle")}
            </h2>
          </Reveal>

          <Reveal delay={0.1} className="relative mx-auto mt-10 aspect-video max-w-4xl overflow-hidden border border-gold/20 bg-[#1A1A1A] shadow-2xl">
            {videoPlaying ? (
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${YOUTUBE_ID}?rel=0&modestbranding=1&autoplay=1`}
                title={t("home.videoTitle")}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setVideoPlaying(true)}
                className="group relative h-full w-full"
                aria-label={t("home.playVideoAriaLabel")}
              >
                <img
                  src={`https://img.youtube.com/vi/${YOUTUBE_ID}/hqdefault.jpg`}
                  alt={t("home.videoThumbnailAlt")}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold bg-black/70 text-gold transition-transform group-hover:scale-110">
                    <Play size={26} className="ml-1" fill="currentColor" />
                  </span>
                </span>
              </button>
            )}
            <div className="pointer-events-none absolute inset-0 border border-gold/10" />
          </Reveal>

          <div className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              { label: t("home.step1Label"), copy: t("home.storyP1") },
              { label: t("home.step2Label"), copy: t("home.storyP2") },
              { label: t("home.step3Label"), copy: t("home.storyP3") },
            ].map((step, i) => (
              <Reveal key={step.label} delay={0.15 + i * 0.1}>
                <div className="border-t border-gold/20 pt-6 md:border-t-0 md:border-l md:pl-8">
                  <span className="font-serif text-4xl font-bold text-gold/30">
                    0{i + 1}
                  </span>
                  <h3 className="mt-2 font-serif text-lg font-semibold text-white">
                    {step.label}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{step.copy}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.4} className="mt-12 text-center">
            <Link
              to="/about"
              className="inline-block border border-gold px-8 py-3 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-black"
            >
              {t("home.learnMore")}
            </Link>
          </Reveal>
        </div>
      </section>

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

      <section className="border-y border-gold/20 bg-black px-4 py-20 md:px-6">
        <Reveal className="mx-auto max-w-xl text-center">
          <h2 className="font-serif text-3xl font-bold text-white">
            {t("home.newsletterTitle")}
          </h2>
          <p className="mt-3 text-white/60">{t("home.newsletterSubtitle")}</p>

          <form onSubmit={handleNewsletterSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder={t("home.emailPlaceholder")}
              className="flex-1 border border-gold/40 bg-[#1A1A1A] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
            />

            <button
              type="submit"
              disabled={subscribing}
              className="bg-gold px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
            >
              {subscribing ? t("home.subscribing") : t("home.subscribe")}
            </button>
          </form>
        </Reveal>
      </section>
    </PageLayout>
  );
}