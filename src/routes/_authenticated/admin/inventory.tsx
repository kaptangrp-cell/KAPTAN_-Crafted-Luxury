import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InventoryAdmin } from "@/components/warehouse/InventoryAdmin";
import { OperationsDesk } from "@/components/warehouse/OperationsDesk";
export const Route = createFileRoute("/_authenticated/admin/inventory")({ component: StockPage });
function StockPage() {
  const { i18n } = useTranslation();
  const de = i18n.resolvedLanguage?.startsWith("de");
  const [view, setView] = useState("stock");
  const [setupRequest, setSetupRequest] = useState(0);
  return (
    <div className="warehouse-workspace mx-auto max-w-5xl">
      <p className="mb-4 text-sm text-muted-foreground">
        {de
          ? "Bestand prüfen, Lieferungen erfassen und Etiketten verwalten — an einem Ort."
          : "Check stock, record deliveries and manage labels in one place."}
      </p>
      <nav
        aria-label={de ? "Bestandsverwaltung" : "Stock management"}
        className="mb-6 flex flex-wrap gap-2"
      >
        {[
          ["stock", de ? "Bestand & Etiketten" : "Stock & labels"],
          ["add", de ? "Bestand hinzufügen" : "Add stock"],
          ["find", de ? "Artikel finden" : "Find an item"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={`rounded-xl border px-5 py-3 ${view === id ? "border-gold bg-gold text-black" : "border-gold/30 text-gold"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div hidden={view !== "stock"}>
        <InventoryAdmin setupRequest={setupRequest} />
      </div>
      <div hidden={view !== "add"}>
        <OperationsDesk
          admin
          canMove
          initialTab="purchase"
          hideNavigation
          onSetup={() => {
            setView("stock");
            setSetupRequest((value) => value + 1);
          }}
        />
      </div>
      {view === "find" && (
        <div>
          <OperationsDesk admin={false} canMove hideNavigation />
        </div>
      )}
    </div>
  );
}
