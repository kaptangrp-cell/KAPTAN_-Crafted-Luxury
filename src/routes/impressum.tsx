import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/impressum")({
  head: () => ({
    meta: [
      { title: "Impressum — KAPTAN" },
      {
        name: "description",
        content:
          "Anbieterkennzeichnung und Kontaktangaben von Kaptan, Inhaber Zoraiz Fazal, gemäß § 5 DDG.",
      },
    ],
  }),
  component: ImpressumPage,
});

function ImpressumPage() {
  const { t, i18n } = useTranslation();
  return (
    <PageLayout>
      <section lang={i18n.language} className="bg-black py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="font-serif text-4xl text-white md:text-5xl">{t("legalNotice.title")}</h1>
          <div className="mt-3 h-0.5 w-12 bg-gold" />
          <p className="mt-6 text-white/70">{t("legalNotice.intro")}</p>

          <div className="mt-10 space-y-10 leading-relaxed text-white/80">
            <section>
              <h2 className="mb-3 font-serif text-2xl text-gold">{t("legalNotice.provider")}</h2>
              <address className="not-italic">
                <span className="font-semibold text-white">Kaptan</span>
                <br />
                {t("legalNotice.owner")}
                <br />
                {t("legalNotice.business")}
                <br />
                Bahnhofstraße 36
                <br />
                35037 Marburg
                <br />
                {t("legalNotice.country")}
              </address>
            </section>

            <section>
              <h2 className="mb-3 font-serif text-2xl text-gold">{t("legalNotice.contact")}</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-white/60">{t("legalNotice.email")}</dt>
                  <dd>
                    <a
                      href="mailto:kaptangrp@gmail.com"
                      className="break-all text-gold underline underline-offset-4"
                    >
                      kaptangrp@gmail.com
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-white/60">{t("legalNotice.phone")}</dt>
                  <dd>
                    <a href="tel:+4915216164830" className="text-gold underline underline-offset-4">
                      +49 152 16164830
                    </a>
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="mb-3 font-serif text-2xl text-gold">{t("legalNotice.vatTitle")}</h2>
              <p>
                {t("legalNotice.vatText")} <span className="font-mono text-white">DE464080693</span>
              </p>
            </section>

            <section className="border-t border-gold/20 pt-8">
              <h2 className="mb-3 font-serif text-2xl text-gold">{t("legalNotice.privacy")}</h2>
              <p>
                {t("legalNotice.privacyText")}{" "}
                <Link to="/privacy" className="text-gold underline underline-offset-4">
                  {t("legalNotice.privacyLink")}
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
