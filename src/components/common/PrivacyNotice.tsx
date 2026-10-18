import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/** Information about necessary processing, not bundled consent to marketing. */
export function PrivacyNotice({ purpose }: { purpose: "account" | "checkout" | "rights" }) {
  const { t } = useTranslation();
  return (
    <aside className="my-5 w-full rounded-xl border border-gold/20 bg-gold/5 p-4 text-sm leading-relaxed text-white/80">
      <p className="mb-1 font-semibold text-gold">{t("dataProtection.title")}</p>
      <p>{t(`dataProtection.${purpose}`)}</p>
      <Link
        to="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-gold underline underline-offset-4"
      >
        {t("dataProtection.details")}
      </Link>
      {purpose === "rights" && (
        <a
          className="ml-4 inline-block text-gold underline underline-offset-4"
          href="mailto:kaptangrp@gmail.com?subject=Datenschutzanfrage"
        >
          {t("dataProtection.request")}
        </a>
      )}
    </aside>
  );
}
