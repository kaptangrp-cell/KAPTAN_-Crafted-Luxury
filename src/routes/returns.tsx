import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/returns")({
  head: () => ({ meta: [{ title: "Returns — KAPTAN" }, { name: "description", content: "30-day return policy for KAPTAN leather goods and salt lamps." }] }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const { t } = useTranslation();
  return (
    <PageLayout>
      <section className="bg-black py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="font-serif text-4xl text-white md:text-5xl">{t("returns.title")}</h1>
          <div className="mt-3 h-0.5 w-12 bg-gold" />
          <div className="mt-8 space-y-4 leading-relaxed text-white/70">
            <p>{t("returns.p1")}</p>
            <p>{t("returns.p2")}</p>
            <p>{t("returns.p3")}</p>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
