import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PrivacyNotice } from "@/components/common/PrivacyNotice";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — KAPTAN" },
      {
        name: "description",
        content: "How KAPTAN collects, uses, and protects your personal data.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();
  const sections = t("dataProtection.sections", { returnObjects: true }) as [string, string][];
  return (
    <PageLayout>
      <section className="bg-black py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="font-serif text-4xl text-white md:text-5xl">{t("privacy.title")}</h1>
          <div className="mt-3 h-0.5 w-12 bg-gold" />
          <div className="mt-8 space-y-4 leading-relaxed text-white/70">
            {sections.map(([title, body]) => (
              <section key={title} className="pt-4">
                <h2 className="mb-2 text-xl font-semibold text-white">{title}</h2>
                <p>{body}</p>
              </section>
            ))}
            <a
              className="inline-block text-gold underline"
              href="https://datenschutz.hessen.de/service/beschwerde-uebermitteln"
              target="_blank"
              rel="noopener noreferrer"
            >
              Hessischer Beauftragter für Datenschutz und Informationsfreiheit
            </a>
            <PrivacyNotice purpose="rights" />
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
