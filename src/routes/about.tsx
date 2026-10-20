import { BrandStory } from "@/components/common/BrandStory";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — KAPTAN" },
      {
        name: "description",
        content:
          "Why KAPTAN: everyday purpose, personal service and an ambition to make fewer, better things.",
      },
      { property: "og:title", content: "About KAPTAN" },
      {
        property: "og:description",
        content: "Made for the journey. Built to become yours. Discover the values guiding KAPTAN.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useTranslation();
  return (
    <PageLayout>
      <section className="relative isolate overflow-hidden bg-black py-24">
        <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-gold">{t("about.kicker")}</p>
          <h1 className="mt-4 font-serif text-5xl font-semibold text-white md:text-6xl">
            {t("about.titlePart1")} <span className="text-gold">{t("about.titlePart2")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/70">
            {t("about.intro")}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <img
          src="/banners/leather-bags.webp"
          alt={t("home.leatherProducts")}
          className="max-h-[400px] w-full rounded-2xl object-cover"
          loading="lazy"
        />
      </div>
      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-2 md:px-6">
        <div>
          <h2 className="font-serif text-3xl text-white">{t("about.leatherTitle")}</h2>
          <p className="mt-4 leading-relaxed text-white/70">{t("about.leatherBody")}</p>
        </div>
        <div>
          <h2 className="font-serif text-3xl text-white">{t("about.saltTitle")}</h2>
          <p className="mt-4 leading-relaxed text-white/70">{t("about.saltBody")}</p>
        </div>
      </section>

      <BrandStory />
      <div className="py-12 text-center">
        <Link to="/products" className="inline-block bg-gold px-8 py-3 font-semibold text-black">
          {t("home.heroShopNow")}
        </Link>
      </div>
    </PageLayout>
  );
}
