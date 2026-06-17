import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — KAPTAN" }, { name: "description", content: "How KAPTAN collects, uses, and protects your personal data." }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <PageLayout>
      <section className="bg-black py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="font-serif text-4xl text-white md:text-5xl">{t("privacy.title")}</h1>
          <div className="mt-3 h-0.5 w-12 bg-gold" />
          <div className="mt-8 space-y-4 leading-relaxed text-white/70">
            <p>{t("privacy.p1")}</p>
            <p>{t("privacy.p2")}</p>
            <p>{t("privacy.p3")}</p>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
