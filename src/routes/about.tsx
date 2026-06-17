import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — KAPTAN" },
      { name: "description", content: "The story behind KAPTAN — premium leather goods and authentic Himalayan salt lamps." },
      { property: "og:title", content: "About KAPTAN" },
      { property: "og:description", content: "Heritage craftsmanship from Pakistan, shipped worldwide." },
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

      <section className="border-y border-gold/10 bg-[#0D0D0D] py-16">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 text-center md:grid-cols-3">
          {[
            { v: "10,000+", l: t("about.statHappy") },
            { v: "300+", l: t("about.statYears") },
            { v: "100%", l: t("about.statAuthentic") },
          ].map((s) => (
            <div key={s.l}>
              <p className="font-serif text-4xl text-gold">{s.v}</p>
              <p className="mt-2 text-xs uppercase tracking-wider text-white/60">{s.l}</p>
            </div>
          ))}
        </div>
      </section>
    </PageLayout>
  );
}
