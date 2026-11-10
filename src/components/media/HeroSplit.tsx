import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { collectionLabel, type Collection } from "@/lib/catalog-collections";
import { HeroVideo } from "@/components/media/HeroVideo";

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const PANELS: {
  collection: Collection;
  video: string;
  position: string;
  line: string;
  cta: string;
}[] = [
  {
    collection: "leather",
    video: "kaptan-hero-leather",
    position: "50% 60%",
    line: "home.splitLeatherLine",
    cta: "home.splitLeatherCta",
  },
  {
    collection: "salt",
    video: "kaptan-hero-salt",
    position: "50% 45%",
    line: "home.splitSaltLine",
    cta: "home.splitSaltCta",
  },
];

/**
 * "Two worlds" home hero: KAPTAN Leather and KAPTAN Salt Lamps side by side.
 * Desktop: full-bleed split behind the headline; hovering a side widens it.
 * Mobile: headline first, then the two worlds stacked.
 */
export function HeroSplit({ children }: { children?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const animate = !useReducedMotion();
  const de = i18n.language?.startsWith("de");

  return (
    <section className="media-hero relative isolate overflow-hidden border-b border-gold/15 bg-[#0D0D0D]">
      <div className="relative flex flex-col md:min-h-[88svh]">
        {/* The two worlds */}
        <div className="order-2 flex flex-col md:absolute md:inset-0 md:order-none md:flex-row">
          {PANELS.map((p, i) => (
            <Link
              key={p.collection}
              to="/products"
              search={{ collection: p.collection }}
              className={`group relative isolate flex min-h-[46svh] items-end overflow-hidden md:min-h-0 md:flex-1 md:transition-[flex-grow] md:duration-700 md:ease-[cubic-bezier(0.22,1,0.36,1)] md:hover:flex-grow-[1.6] motion-reduce:transition-none ${
                i === 1 ? "border-t border-gold/25 md:border-t-0 md:border-l" : ""
              }`}
            >
              <HeroVideo
                name={p.video}
                position={p.position}
                className="transition-transform duration-1000 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-[#0D0D0D]/35 to-[#0D0D0D]/10 transition-opacity duration-700 group-hover:opacity-80"
              />
              <div className="relative w-full p-6 md:px-10 md:pb-14 xl:px-14">
                <p className="text-xs font-semibold uppercase tracking-[0.34em] text-gold">
                  {collectionLabel(p.collection, de)}
                </p>
                <p className="mt-3 max-w-sm font-serif text-2xl leading-snug text-white md:text-3xl">
                  {t(p.line)}
                </p>
                <span className="mt-5 inline-flex items-center gap-3 border border-gold/60 px-5 py-2.5 text-sm font-medium text-gold transition-colors group-hover:bg-gold group-hover:text-black">
                  {t(p.cta)}
                  <ArrowUpRight
                    size={16}
                    className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Top scrim so the headline stays legible over both worlds */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 hidden h-[62%] bg-gradient-to-b from-[#0D0D0D] via-[#0D0D0D]/60 to-transparent md:block"
        />

        {/* Headline + primary action */}
        <motion.div
          initial={animate ? "hidden" : false}
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }}
          className="pointer-events-none relative order-1 mx-auto w-full max-w-7xl px-4 pt-12 pb-10 md:order-none md:px-6 md:pt-16 md:pb-[19rem] lg:pt-20"
        >
          <div className="pointer-events-auto max-w-3xl">
            <motion.p
              variants={item}
              className="text-xs font-semibold uppercase tracking-[0.34em] text-gold"
            >
              {t("home.collectionEyebrow")}
            </motion.p>
            <motion.h1
              variants={item}
              className="mt-5 font-serif text-5xl leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl"
            >
              {t("home.heroLine1")} <span className="text-gold">{t("home.heroLine2")}</span>
            </motion.h1>
            <motion.p
              variants={item}
              className="mt-6 max-w-lg text-base leading-relaxed text-white/75 md:text-lg"
            >
              {t("home.heroSubtitle")}
            </motion.p>
            <motion.div variants={item}>
              <Link
                to="/products"
                className="group mt-8 inline-flex items-center gap-4 bg-gold px-8 py-4 font-semibold text-black transition-colors hover:bg-gold-vivid"
              >
                {t("home.heroShopNow")}
                <ArrowUpRight
                  size={18}
                  className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
      {children}
    </section>
  );
}
