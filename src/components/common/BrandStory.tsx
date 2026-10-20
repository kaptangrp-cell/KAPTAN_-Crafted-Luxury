import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function BrandStory({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="border-y border-gold/15 bg-[#0D0D0D] px-4 py-16 md:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">{t("brand.why")}</p>
        <h2 className="mt-3 font-serif text-3xl text-white">{t("brand.valuesIntro")}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {["crafted", "functional", "personal", "traceable", "lasting"].map((value) => (
            <div key={value} className="rounded-xl border border-gold/15 p-5">
              <h3 className="font-serif text-xl text-gold">{t(`brand.${value}Title`)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {t(`brand.${value}Body`)}
              </p>
            </div>
          ))}
        </div>
        {!compact && (
          <div className="mt-14 grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="font-serif text-3xl text-gold">{t("brand.ageTitle")}</h2>
              <p className="mt-4 leading-relaxed text-white/70">{t("brand.ageBody")}</p>
            </div>
            <ol className="space-y-5 border-l border-gold/30 pl-6">
              {["day", "year", "future"].map((key) => (
                <li key={key}>
                  <h3 className="text-white">{t(`brand.${key}`)}</h3>
                  <p className="mt-2 text-sm text-white/60">{t(`brand.${key}Body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            to={compact ? "/about" : "/products"}
            className="rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-black"
          >
            {t(compact ? "brand.story" : "home.heroShopNow")}
          </Link>
          <Link
            to="/contact"
            className="rounded-lg border border-gold/30 px-5 py-3 text-sm text-gold"
          >
            {t("brand.support")}
          </Link>
        </div>
      </div>
    </section>
  );
}
