import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "FAQ — KAPTAN" }, { name: "description", content: "Frequently asked questions about KAPTAN orders, shipping, and care." }] }),
  component: FAQPage,
});

function FAQPage() {
  const { t } = useTranslation();
  const items = t("faq.items", { returnObjects: true }) as { q: string; a: string }[];
  return (
    <PageLayout>
      <section className="bg-black py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="font-serif text-4xl text-white md:text-5xl">{t("faq.title")}</h1>
          <div className="mt-3 h-0.5 w-12 bg-gold" />
          <div className="mt-10 space-y-6">
            {items.map((it, i) => (
              <div key={i} className="border border-gold/10 bg-[#1A1A1A] p-6">
                <h2 className="font-serif text-lg text-gold">{it.q}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{it.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
