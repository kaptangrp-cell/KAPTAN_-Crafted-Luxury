import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FestivalBasket } from "@/components/warehouse/FestivalBasket";
export const Route = createFileRoute("/_authenticated/admin/festival")({
  component: FestivalAdmin,
});
function FestivalAdmin() {
  const { i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  return (
    <main className="warehouse-workspace min-w-0">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">
            KAPTAN · {de ? "Vor Ort" : "In person"}
          </p>
          <h1 className="mt-2 font-serif text-3xl">{de ? "Festivalverkauf" : "Festival sales"}</h1>
          <p className="mt-2 text-muted-foreground">
            {de
              ? "1. Scannen · 2. Zahlung erhalten · 3. Verkauf abschließen"
              : "1. Scan · 2. Receive payment · 3. Complete sale"}
          </p>
        </div>
        <nav className="flex flex-wrap gap-3">
          <Link className="warehouse-button" to="/admin/inventory">
            {de ? "Bestand & Etiketten" : "Stock & labels"}
          </Link>
          <Link className="warehouse-button" to="/admin/staff">
            {de ? "Mitarbeiterrechte" : "Staff permissions"}
          </Link>
        </nav>
      </header>
      <FestivalBasket expanded />
    </main>
  );
}
