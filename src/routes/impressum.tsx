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
  return (
    <PageLayout>
      <section lang="de" className="bg-black py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="font-serif text-4xl text-white md:text-5xl">Impressum</h1>
          <div className="mt-3 h-0.5 w-12 bg-gold" />
          <p className="mt-6 text-white/70">Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</p>

          <div className="mt-10 space-y-10 leading-relaxed text-white/80">
            <section>
              <h2 className="mb-3 font-serif text-2xl text-gold">Anbieter</h2>
              <address className="not-italic">
                <span className="font-semibold text-white">Kaptan</span>
                <br />
                Inhaber: Zoraiz Fazal
                <br />
                Einzelunternehmen
                <br />
                Bahnhofstraße 36
                <br />
                35037 Marburg
                <br />
                Deutschland
              </address>
            </section>

            <section>
              <h2 className="mb-3 font-serif text-2xl text-gold">Kontakt</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-white/60">E-Mail</dt>
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
                  <dt className="text-sm text-white/60">Telefon</dt>
                  <dd>
                    <a href="tel:+4915216164830" className="text-gold underline underline-offset-4">
                      +49 152 16164830
                    </a>
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="mb-3 font-serif text-2xl text-gold">
                Umsatzsteuer-Identifikationsnummer
              </h2>
              <p>
                Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:{" "}
                <span className="font-mono text-white">DE464080693</span>
              </p>
            </section>

            <section className="border-t border-gold/20 pt-8">
              <h2 className="mb-3 font-serif text-2xl text-gold">Datenschutz</h2>
              <p>
                Informationen zur Verarbeitung personenbezogener Daten und zu Ihren Rechten finden
                Sie in unserer{" "}
                <Link to="/privacy" className="text-gold underline underline-offset-4">
                  Datenschutzerklärung
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
