import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ShieldCheck, Hand, Truck, Leaf } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFeaturedProducts, getCategories } from "@/lib/products.functions";
import { subscribeNewsletter } from "@/lib/newsletter.functions";
import { ProductCard } from "@/components/product/ProductCard";
import { PageLayout } from "@/components/layout/PageLayout";

const featuredQueryOptions = queryOptions({
  queryKey: ["featured-products"],
  queryFn: () => getFeaturedProducts(),
});

const categoriesQueryOptions = queryOptions({
  queryKey: ["categories"],
  queryFn: () => getCategories(),
});

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

  const subscribeFn = useServerFn(subscribeNewsletter);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  const featuredProducts = featuredData?.products ?? [];

  const productImages = featuredProducts
    .flatMap((p: any) => p.product_images ?? [])
    .filter((img: any) => img?.url && img?.media_type !== "video")
    .map((img: any) => img.url);

  const fallbackImages = [
    "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
    "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80",
    "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=800&q=80",
    "https://images.unsplash.com/photo-1600721391776-b5cd0e0048f9?w=800&q=80",
    "https://images.unsplash.com/photo-1616627451515-cbc80e362745?w=800&q=80",
    "https://images.unsplash.com/photo-1590736969955-71cc94901144?w=800&q=80",
  ];

  const sliderImages = productImages.length >= 3 ? productImages : fallbackImages;

  async function handleNewsletterSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSubscribing(true);

      const result = await subscribeFn({
        data: { email: newsletterEmail },
      });

      toast.success(result.message);
      setNewsletterEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <PageLayout>
      <section className="relative flex min-h-[80vh] items-center justify-center bg-black px-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,oklch(0.86_0.18_95/0.08),transparent_70%)]" />

        <div className="relative z-10 max-w-4xl text-center">
          <h1 className="font-serif text-4xl font-bold leading-tight text-white md:text-6xl lg:text-7xl">
            {t("home.heroLine1")}
            <br />
            {t("home.heroLine2")}
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gold-dark md:text-lg">
            {t("home.heroSubtitle")}
          </p>

          <div className="mx-auto mt-6 h-px w-24 bg-gold/40" />

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/products"
              search={{ category: "leather-wallets" }}
              className="bg-gold px-8 py-3 font-semibold text-black transition-colors hover:bg-gold-vivid"
            >
              {t("home.shopLeather")}
            </Link>

            <Link
              to="/products"
              search={{ category: "salt-lamp-natural" }}
              className="border border-gold px-8 py-3 font-semibold text-gold transition-colors hover:bg-gold hover:text-black"
            >
              {t("home.discoverSaltLamps")}
            </Link>
          </div>

          <div className="mt-12 animate-bounce text-gold">
            <ChevronDown size={24} className="mx-auto" />
          </div>
        </div>
      </section>

      <ProductMovingStrip images={sliderImages} />

      <section className="border-b border-gold/10 bg-[#1A1A1A]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4 md:px-6">
          {[
            { icon: ShieldCheck, label: t("home.secureCheckout"), desc: t("home.secureCheckoutDesc") },
            { icon: Hand, label: t("home.handcrafted"), desc: t("home.handcraftedDesc") },
            { icon: Truck, label: t("home.fastDelivery"), desc: t("home.fastDeliveryDesc") },
            { icon: Leaf, label: t("home.sustainable"), desc: t("home.sustainableDesc") },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center text-center">
              <b.icon size={28} className="text-gold" strokeWidth={1.5} />
              <span className="mt-2 text-sm font-semibold text-white">{b.label}</span>
              <span className="text-xs text-gold/60">{b.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-black px-4 py-16 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
              {t("home.collectionsTitle")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Link
              to="/products"
              search={{ category: "leather-wallets" }}
              className="group relative flex h-64 items-center justify-center overflow-hidden border border-gold/10 bg-[#1A1A1A] transition-all hover:border-gold/30 hover:gold-glow md:h-80"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="relative z-10 text-center">
                <h3 className="font-serif text-2xl font-bold text-white">
                  {t("home.leatherProducts")}
                </h3>
                <span className="mt-2 inline-block text-sm text-gold transition-transform group-hover:translate-x-1">
                  {t("home.shopNow")}
                </span>
              </div>
            </Link>

            <Link
              to="/products"
              search={{ category: "salt-lamp-natural" }}
              className="group relative flex h-64 items-center justify-center overflow-hidden border border-gold/10 bg-[#1A1A1A] transition-all hover:border-gold/30 hover:gold-glow md:h-80"
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="relative z-10 text-center">
                <h3 className="font-serif text-2xl font-bold text-white">
                  {t("home.himalayanSaltLamps")}
                </h3>
                <span className="mt-2 inline-block text-sm text-gold transition-transform group-hover:translate-x-1">
                  {t("home.shopNow")}
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#0D0D0D] px-4 py-16 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
              {t("home.bestSellers")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black px-4 py-16 md:px-6">
        <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-2">
          <div className="relative aspect-video overflow-hidden border border-gold/20 bg-[#1A1A1A] shadow-lg md:aspect-square">
            <iframe
              className="h-full w-full"
              src="https://www.youtube.com/embed/PS78866qStM"
              title="KAPTAN leather craft demo video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <div className="pointer-events-none absolute inset-0 border border-gold/10" />
          </div>

          <div>
            <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
              {t("home.storyTitle")}
            </h2>
            <div className="mt-3 h-0.5 w-12 bg-gold" />
            <p className="mt-6 leading-relaxed text-white/70">{t("home.storyP1")}</p>
            <p className="mt-4 leading-relaxed text-white/70">{t("home.storyP2")}</p>
            <p className="mt-4 leading-relaxed text-white/70">{t("home.storyP3")}</p>

            <Link
              to="/about"
              className="mt-6 inline-block text-sm font-semibold text-gold hover:underline"
            >
              {t("home.learnMore")}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#0D0D0D] px-4 py-16 md:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 text-center">
            <h2 className="font-serif text-3xl font-bold text-white md:text-4xl">
              {t("home.testimonialsTitle")}
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { quote: t("home.t1Quote"), name: "Omar H.", location: "Dubai, UAE", product: t("home.t1Product") },
              { quote: t("home.t2Quote"), name: "Sarah M.", location: "London, UK", product: t("home.t2Product") },
              { quote: t("home.t3Quote"), name: "Ali R.", location: "Karachi, Pakistan", product: t("home.t3Product") },
            ].map((tm, i) => (
              <div key={i} className="border border-gold/10 bg-[#1A1A1A] p-6">
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <span key={j} className="text-gold">★</span>
                  ))}
                </div>

                <p className="font-serif italic leading-relaxed text-white/80">
                  "{tm.quote}"
                </p>

                <div className="mt-4 border-t border-gold/10 pt-4">
                  <p className="text-sm font-semibold text-white">{tm.name}</p>
                  <p className="text-xs text-gold/60">
                    {tm.location} — {tm.product}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-gold/20 bg-black px-4 py-16 md:px-6">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-serif text-3xl font-bold text-white">
            {t("home.newsletterTitle")}
          </h2>
          <p className="mt-3 text-white/60">{t("home.newsletterSubtitle")}</p>

          <form
            onSubmit={handleNewsletterSubmit}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
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
              {subscribing ? "Subscribing..." : t("home.subscribe")}
            </button>
          </form>
        </div>
      </section>
    </PageLayout>
  );
}

function ProductMovingStrip({ images }: { images: string[] }) {
  const loopImages = [...images, ...images];

  return (
    <section className="overflow-hidden border-y border-gold/10 bg-[#0D0D0D] py-5">
      <style>
        {`
          @keyframes kaptan-safe-marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }

          .kaptan-safe-marquee {
            display: flex;
            width: max-content;
            gap: 16px;
            animation: kaptan-safe-marquee 38s linear infinite;
          }

          .kaptan-safe-marquee:hover {
            animation-play-state: paused;
          }
        `}
      </style>

      <div className="mb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/70">
          Featured Craftsmanship
        </p>
      </div>

      <div className="kaptan-safe-marquee">
        {loopImages.map((src, index) => (
          <div
            key={`${src}-${index}`}
            className="h-32 w-44 flex-shrink-0 overflow-hidden border border-gold/20 bg-black sm:h-40 sm:w-60"
          >
            <img
              src={src}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
            />
          </div>
        ))}
      </div>
    </section>
  );
}