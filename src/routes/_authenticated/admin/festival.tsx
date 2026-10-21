import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ScanLine, PackagePlus, History, Settings2 } from "lucide-react";
import { FestivalBasket } from "@/components/warehouse/FestivalBasket";
import { OperationsDesk } from "@/components/warehouse/OperationsDesk";

export const Route = createFileRoute("/_authenticated/admin/festival")({
  component: FestivalAdmin,
});
function FestivalAdmin() {
  const { i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  const [view, setView] = useState<"sell" | "purchases" | "trace" | "setup">("sell");
  const tabs = [
    { id: "sell", icon: ScanLine, label: de ? "Verkauf" : "Sell" },
    { id: "purchases", icon: PackagePlus, label: de ? "Einkäufe" : "Purchases" },
    { id: "trace", icon: History, label: de ? "Artikelverlauf" : "Unit history" },
    { id: "setup", icon: Settings2, label: de ? "Einrichtung" : "Setup" },
  ] as const;
  return (
    <main className="warehouse-workspace min-w-0">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-gold">
          KAPTAN · {de ? "Vor Ort" : "In person"}
        </p>
        <h1 className="mt-2 font-serif text-3xl">{de ? "Festivalverkauf" : "Festival sales"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {de
            ? "Scannen, Waren verwalten und Verkäufe vorbereiten – an einem Ort."
            : "Scan, manage goods and prepare sales in one place."}
        </p>
      </header>
      <div
        role="tablist"
        aria-label={de ? "Festivalbereiche" : "Festival sections"}
        className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            id={`festival-tab-${id}`}
            key={id}
            role="tab"
            aria-selected={view === id}
            aria-controls={`festival-panel-${id}`}
            onClick={() => setView(id)}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border p-3 text-sm ${view === id ? "border-gold bg-gold text-black" : "border-gold/20 bg-card text-gold"}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id={`festival-panel-${view}`}
        aria-labelledby={`festival-tab-${view}`}
      >
        {view === "sell" && <FestivalBasket expanded />}
        {view === "purchases" && (
          <OperationsDesk key="purchase" admin canMove initialTab="purchase" />
        )}
        {view === "trace" && <OperationsDesk key="history" admin canMove />}
        {view === "setup" && (
          <div className="space-y-5 rounded-2xl border border-gold/20 p-6">
            <h2 className="font-serif text-2xl">
              {de ? "Kassenabschluss noch nicht freigeschaltet" : "Live checkout not yet enabled"}
            </h2>
            <p>
              {de
                ? "Zahlungsarten: Bargeld, PayPal und Revolut-Banküberweisung. Verkäufer werden anhand ihres angemeldeten Kontos erfasst."
                : "Payment methods: cash, PayPal and Revolut bank transfer. Sellers are identified by their signed-in accounts."}
            </p>
            <p>
              {de
                ? "Für den produktiven Kassenabschluss fehlen die zertifizierte TSE-Anbindung, fiskalische Belege und Exporte sowie die geprüfte Verbindung zu Rechnungen und Finanzbuchungen. Ein gespeicherter Warenkorb ist noch kein Verkauf."
                : "Production checkout still requires the certified TSE connection, fiscal receipts and exports, and a verified connection to invoices and financial postings. A saved basket is not a sale."}
            </p>
            <p className="text-sm text-muted-foreground">
              {de
                ? "Keine Passwörter oder API-Schlüssel im Chat oder in Belegfeldern eingeben. Zugangsdaten werden ausschließlich in den Server-Einstellungen hinterlegt."
                : "Do not enter passwords or API keys in chat or receipt fields. Credentials belong only in server settings."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="warehouse-button" to="/admin/staff">
                {de ? "Mitarbeiterrechte" : "Staff permissions"}
              </Link>
              <Link className="warehouse-button" to="/warehouse">
                {de ? "Lager-Scanner" : "Warehouse scanner"}
              </Link>
              <a
                className="text-gold underline"
                href="https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html"
                target="_blank"
                rel="noreferrer"
              >
                {de ? "BMF: Kassenanforderungen" : "BMF: cash register requirements"}
              </a>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
