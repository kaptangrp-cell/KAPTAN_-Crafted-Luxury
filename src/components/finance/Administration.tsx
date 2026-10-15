import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  financeAdministration,
  financeAdministrationSave,
  type Supplier,
} from "@/lib/finance-administration.functions";
import { useAuthStore } from "@/stores/authStore";
const field = "w-full rounded-lg border border-white/20 bg-neutral-950 p-3 text-white",
  button = "rounded-lg bg-yellow-400 px-4 py-2 text-black disabled:opacity-40";
export function FinanceAdministration({ role }: { role: string }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e),
    user = useAuthStore((s) => s.user?.id),
    read = useServerFn(financeAdministration),
    save = useServerFn(financeAdministrationSave),
    qc = useQueryClient();
  const [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Supplier | null | undefined>(),
    [year, setYear] = useState("2027"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["finance-admin", user, search],
    queryFn: () => read({ data: { search } }),
    enabled: !!user,
    retry: false,
  });
  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["finance-admin"] });
    await qc.invalidateQueries({ queryKey: ["finance"] });
    setSelected(undefined);
  }
  return (
    <section className="space-y-5">
      <h2 className="text-2xl">
        {say("Lieferanten & Geschäftsjahre", "Suppliers & financial years")}
      </h2>
      {q.error && <p role="alert">{q.error.message}</p>}
      <label className="block">
        {say("Lieferant / Steuer-ID suchen", "Find supplier / tax ID")}
        <input className={field} value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {role !== "auditor" && (
        <button className={button} onClick={() => setSelected(null)}>
          {say("Lieferant anlegen", "New supplier")}
        </button>
      )}
      {selected !== undefined && (
        <SupplierForm
          key={selected?.id ?? "new"}
          supplier={selected}
          role={role}
          de={de}
          done={refresh}
        />
      )}
      {q.data?.suppliers.map((s) => (
        <article
          key={s.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 p-4"
        >
          <div>
            <h3>
              {s.name} · {s.country} {!s.active && say("(archiviert)", "(archived)")}
            </h3>
            <p className="text-sm text-neutral-400">
              {s.tax_id} · {s.email}
            </p>
            <p className="whitespace-pre-wrap text-sm">{s.address}</p>
          </div>
          {role !== "auditor" && (
            <button className={button} onClick={() => setSelected(s)}>
              {say("Bearbeiten", "Edit")}
            </button>
          )}
        </article>
      ))}
      <h3 className="text-xl">{say("Kalendergeschäftsjahre", "Calendar financial years")}</h3>
      {q.data?.years.map((y) => (
        <p key={y.year}>
          {y.year} · {y.months} {say("Monate", "months")} · {y.closed}{" "}
          {say("geschlossen", "closed")}
        </p>
      ))}
      {role === "owner" && (
        <form
          className="space-y-3 rounded-xl border border-yellow-400/30 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await save({ data: { action: "year", year: Number(year), reason } });
              await refresh();
              setReason("");
            } catch (err) {
              toast.error(String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {say(
              "Legt zwölf Buchungsperioden an. Steuerregeln und Eröffnungswerte müssen separat geprüft werden.",
              "Creates twelve ledger periods. Tax rules and opening balances require separate review.",
            )}
          </p>
          <label className="block">
            {say("Jahr", "Year")}
            <input
              className={field}
              type="number"
              required
              min={2026}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
          <label className="block">
            {say("Begründung", "Reason")}
            <input
              className={field}
              required
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className={button} disabled={busy}>
            {say("Geschäftsjahr anlegen", "Create financial year")}
          </button>
        </form>
      )}
    </section>
  );
}
function SupplierForm({
  supplier,
  role,
  de,
  done,
}: {
  supplier: Supplier | null;
  role: string;
  de: boolean;
  done: () => Promise<void>;
}) {
  const say = (g: string, e: string) => (de ? g : e),
    save = useServerFn(financeAdministrationSave);
  const [id] = useState(supplier?.id ?? crypto.randomUUID()),
    [name, setName] = useState(supplier?.name ?? ""),
    [country, setCountry] = useState(supplier?.country ?? "DE"),
    [taxId, setTaxId] = useState(supplier?.tax_id ?? ""),
    [email, setEmail] = useState(supplier?.email ?? ""),
    [address, setAddress] = useState(supplier?.address ?? ""),
    [active, setActive] = useState(supplier?.active ?? true),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3 rounded-xl border border-yellow-400/30 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await save({
            data: {
              action: "supplier",
              id,
              revision: supplier?.revision ?? 0,
              name,
              country,
              taxId,
              email,
              address,
              active,
            },
          });
          await done();
        } catch (err) {
          toast.error(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {[
        [say("Rechtlicher Name", "Legal name"), name, setName],
        [say("Land (ISO, z. B. DE/PK)", "Country (ISO, e.g. DE/PK)"), country, setCountry],
        [say("Steuer-ID / USt-ID", "Tax / VAT ID"), taxId, setTaxId],
        ["E-Mail", email, setEmail],
        [say("Anschrift", "Address"), address, setAddress],
      ].map(([label, value, set]) => (
        <label className="block" key={String(label)}>
          {String(label)}
          <input
            className={field}
            value={String(value)}
            onChange={(e) => (set as (v: string) => void)(e.target.value)}
          />
        </label>
      ))}
      {role !== "staff" && (
        <label className="flex gap-3">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {say("Aktiv", "Active")}
        </label>
      )}
      <p className="text-sm text-neutral-400">
        {say(
          "Änderungen überschreiben keine Namen oder Beträge in bereits gebuchten Belegen.",
          "Changes do not overwrite names or amounts in previously posted documents.",
        )}
      </p>
      <button className={button} disabled={busy}>
        {say("Speichern", "Save")}
      </button>
    </form>
  );
}
