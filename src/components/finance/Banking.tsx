import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  financeBankList,
  financeBankPreview,
  financeBankImport,
  financeBankCommand,
  type BankCommand,
} from "@/lib/finance-bank.functions";
import { uploadFinanceDocument, readFinanceDocument } from "@/lib/finance-documents.functions";
import { bankPreset, BankMapping, bankAmount } from "@/lib/finance/bank-csv";
import { euros } from "@/lib/finance/money";
const field = "w-full rounded-lg border border-white/20 bg-neutral-950 p-3 text-white";
const button = "rounded-lg bg-[#FFD700] px-4 py-2 font-semibold text-black disabled:opacity-40";
const initial: BankMapping = {
  delimiter: ",",
  dateColumn: 0,
  amountColumn: 1,
  referenceColumn: 2,
  idColumn: null,
  currencyColumn: null,
  dateFormat: "iso",
  decimalFormat: "english",
  provider: "custom",
  feeColumn: null,
  grossColumn: null,
  statusColumn: null,
  typeColumn: null,
  impactColumn: null,
};
export function FinanceBanking({ role }: { role: string }) {
  const { i18n } = useTranslation(),
    de = i18n.language.startsWith("de"),
    say = (g: string, e: string) => (de ? g : e);
  const user = useAuthStore((s) => s.user?.id),
    qc = useQueryClient();
  const list = useServerFn(financeBankList),
    preview = useServerFn(financeBankPreview),
    upload = useServerFn(uploadFinanceDocument),
    importer = useServerFn(financeBankImport),
    command = useServerFn(financeBankCommand),
    original = useServerFn(readFinanceDocument);
  const [account, setAccount] = useState(""),
    [statement, setStatement] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [name, setName] = useState("");
  const [doc, setDoc] = useState(""),
    [filename, setFilename] = useState(""),
    [mapping, setMapping] = useState<BankMapping>(initial),
    [sample, setSample] = useState<Awaited<ReturnType<typeof preview>> | null>(null);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [opening, setOpening] = useState(""),
    [closing, setClosing] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const query = useQuery({
    queryKey: ["finance-bank", user, account, statement, page],
    queryFn: () => list({ data: { account: account || null, statement: statement || null, page } }),
    enabled: !!user,
    retry: false,
  });
  const post = ["owner", "accountant"].includes(role),
    write = post || role === "staff";
  async function refresh() {
    await Promise.all(
      ["finance-bank", "finance", "finance-documents", "finance-report"].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
  }
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(data: BankCommand) {
    await run(() => command({ data }));
  }
  async function download(id: string) {
    await run(async () => {
      const r = await original({ data: { id } });
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))], { type: "text/csv" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = r.document.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  const selected = query.data?.statements.find((s) => s.id === statement);
  const columns = [
    ["dateColumn", "Datum", "Date"],
    ["amountColumn", "Kontobewegung (Netto)", "Balance movement (net)"],
    ["referenceColumn", "Verwendungszweck / Name", "Reference / name"],
    ["idColumn", "Transaktions-ID", "Transaction ID"],
    ["currencyColumn", "Währung", "Currency"],
    ["feeColumn", "Gebühr (Originalvorzeichen)", "Fee (original sign)"],
    ["grossColumn", "Brutto", "Gross"],
    ["statusColumn", "Status", "Status"],
    ["typeColumn", "Typ", "Type"],
    ["impactColumn", "Auswirkung auf Guthaben", "Balance impact"],
  ] as const;
  return (
    <section className="space-y-6">
      <h2 className="text-2xl">{say("Bank & PayPal", "Bank & PayPal")}</h2>
      <p className="max-w-4xl text-neutral-400">
        {say(
          "EUR-Kontoauszüge als UTF-8-CSV importieren. Originale bleiben erhalten. Import erstellt keine Buchungen. Zuordnungen und neue Buchungen werden einzeln geprüft. PayPal: Aktivitätenbericht mit Brutto, Gebühr und Netto verwenden.",
          "Import EUR statements as UTF-8 CSV. Originals are retained. Importing creates no journals. Review each match or new posting. PayPal: use an Activity Download with Gross, Fee and Net.",
        )}
      </p>
      {query.error && <p role="alert">{query.error.message}</p>}
      <label className="block">
        {say("Konto", "Account")}
        <select
          className={field}
          value={account}
          disabled={busy}
          onChange={(e) => {
            setAccount(e.target.value);
            setStatement("");
            setPage(0);
            setConfirmed(false);
          }}
        >
          <option value="">{say("Konto wählen", "Choose account")}</option>
          {query.data?.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {role === "owner" && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "account", name });
          }}
        >
          <label className="grow">
            {say(
              "Neues Konto, z. B. Revolut EUR oder PayPal EUR",
              "New account, e.g. Revolut EUR or PayPal EUR",
            )}
            <input
              className={field}
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className={button} disabled={busy}>
            {say("Konto anlegen", "Create account")}
          </button>
        </form>
      )}
      {write && account && (
        <details className="rounded-xl border border-yellow-400/30 p-5">
          <summary className="cursor-pointer text-lg">
            {say("Kontoauszug importieren", "Import statement")}
          </summary>
          <div className="mt-5 space-y-4">
            <label className="block">
              {say(
                "CSV-Original (max. 3 MB, 1.000 Buchungszeilen)",
                "CSV original (max. 3 MB, 1,000 transactions)",
              )}
              <input
                className={field}
                disabled={busy}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setSample(null);
                  setDoc("");
                  setConfirmed(false);
                  void run(async () => {
                    if (f.size > 3 * 1024 * 1024) throw new Error("Maximum 3 MB");
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(String(reader.result).split(",")[1]);
                      reader.onerror = () => reject(new Error("File could not be read"));
                      reader.readAsDataURL(f);
                    });
                    const r = await upload({ data: { name: f.name, base64 } });
                    setDoc(r.id);
                    setFilename(f.name);
                    setSample(
                      await preview({ data: { document: r.id, delimiter: mapping.delimiter } }),
                    );
                  });
                }}
              />
            </label>
            {doc && (
              <>
                <p>{filename}</p>
                <label className="block">
                  {say("Trennzeichen", "Delimiter")}
                  <select
                    className={field}
                    value={mapping.delimiter}
                    disabled={busy}
                    onChange={(e) => {
                      const delimiter = e.target.value as BankMapping["delimiter"];
                      setMapping({ ...mapping, delimiter });
                      setSample(null);
                      setConfirmed(false);
                      void run(async () =>
                        setSample(await preview({ data: { document: doc, delimiter } })),
                      );
                    }}
                  >
                    <option value=",">Comma (,)</option>
                    <option value=";">Semicolon (;)</option>
                    <option value={"\t"}>Tab</option>
                  </select>
                </label>
              </>
            )}
            {sample && (
              <>
                <p>
                  {sample.count}{" "}
                  {say("Zeilen · Vorschau der ersten 5 Zeilen", "rows · first 5 rows preview")}
                </p>
                <div className="overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        {sample.headers.map((h) => (
                          <th className="border border-white/20 p-2" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sample.sample.map((r, i) => (
                        <tr key={i}>
                          {r.map((v, j) => (
                            <td key={j} className="max-w-64 border border-white/20 p-2">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-3">
                  {(["revolut", "paypal"] as const).map((provider) => (
                    <button
                      key={provider}
                      className={button}
                      disabled={busy}
                      onClick={() => {
                        try {
                          setMapping(bankPreset(sample.headers, provider, mapping.delimiter));
                          setConfirmed(false);
                        } catch (e) {
                          toast.error(String(e));
                        }
                      }}
                    >
                      {provider === "paypal" ? "PayPal" : "Revolut"} {say("Vorlage", "preset")}
                    </button>
                  ))}
                  <button
                    className={button}
                    onClick={() => {
                      setMapping({ ...initial, delimiter: mapping.delimiter });
                      setConfirmed(false);
                    }}
                  >
                    {say("Eigene Zuordnung", "Custom mapping")}
                  </button>
                </div>
                <p className="text-sm text-amber-200">
                  {say(
                    "Vorlagen bitte anhand des Originals prüfen. Nur abgeschlossene EUR-Bewegungen. Währungsumrechnungen, offene und Null-Buchungen erfordern manuelle Prüfung. Netto ist die tatsächliche Kontobewegung; Gebühren werden nicht automatisch zusätzlich gebucht.",
                    "Verify presets against the original. Completed EUR movements only. Currency conversions, pending and zero rows require manual review. Net is the actual balance movement; fees are not automatically posted again.",
                  )}
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  {columns.map(([key, g, en], i) => (
                    <label key={key}>
                      {say(g, en)}
                      <select
                        className={field}
                        value={mapping[key] ?? ""}
                        onChange={(e) => {
                          setMapping({
                            ...mapping,
                            [key]: e.target.value === "" ? null : Number(e.target.value),
                          });
                          setConfirmed(false);
                        }}
                      >
                        {i >= 3 && <option value="">—</option>}
                        {sample.headers.map((h, j) => (
                          <option key={h} value={j}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label>
                    {say("Datumsformat", "Date format")}
                    <select
                      className={field}
                      value={mapping.dateFormat}
                      onChange={(e) => {
                        setMapping({
                          ...mapping,
                          dateFormat: e.target.value as BankMapping["dateFormat"],
                        });
                        setConfirmed(false);
                      }}
                    >
                      <option value="iso">YYYY-MM-DD</option>
                      <option value="iso_timestamp">YYYY-MM-DD HH:mm:ss</option>
                      <option value="german">DD.MM.YYYY</option>
                      <option value="us">MM/DD/YYYY</option>
                    </select>
                  </label>
                  <label>
                    {say(
                      "Zahlenformat (auch Anfangs-/Endsaldo)",
                      "Number format (including balances)",
                    )}
                    <select
                      className={field}
                      value={mapping.decimalFormat}
                      onChange={(e) => {
                        setMapping({
                          ...mapping,
                          decimalFormat: e.target.value as BankMapping["decimalFormat"],
                        });
                        setConfirmed(false);
                      }}
                    >
                      <option value="english">1,234.56</option>
                      <option value="german">1.234,56</option>
                    </select>
                  </label>
                  {[
                    [say("Von", "From"), from, setFrom, "date"],
                    [say("Bis", "To"), to, setTo, "date"],
                    [say("Anfangssaldo EUR", "Opening balance EUR"), opening, setOpening, "text"],
                    [say("Endsaldo EUR", "Closing balance EUR"), closing, setClosing, "text"],
                  ].map(([label, value, set, type]) => (
                    <label key={String(label)}>
                      {String(label)}
                      <input
                        className={field}
                        type={String(type)}
                        value={String(value)}
                        onChange={(e) => {
                          (set as (s: string) => void)(e.target.value);
                          setConfirmed(false);
                        }}
                      />
                    </label>
                  ))}
                </div>
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {say(
                    "Ich habe Konto, Währung, Zeitraum, Spalten und Salden mit dem Original geprüft.",
                    "I checked the account, currency, period, columns and balances against the original.",
                  )}
                </label>
                <button
                  className={button}
                  disabled={busy || !confirmed || !from || !to || !opening || !closing}
                  onClick={() =>
                    void run(async () => {
                      const r = await importer({
                        data: {
                          document: doc,
                          account,
                          from,
                          to,
                          opening: bankAmount(opening, mapping.decimalFormat),
                          closing: bankAmount(closing, mapping.decimalFormat),
                          mapping,
                          confirmed: true,
                        },
                      });
                      setStatement(r.id);
                      setPage(0);
                      setConfirmed(false);
                      toast.success(say("Kontoauszug gespeichert", "Statement saved"));
                    })
                  }
                >
                  {say("Prüfen und importieren", "Validate and import")}
                </button>
              </>
            )}
          </div>
        </details>
      )}
      {account && (
        <label className="block">
          {say("Kontoauszüge (neueste 60)", "Statements (latest 60)")}
          <select
            className={field}
            value={statement}
            onChange={(e) => {
              setStatement(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{say("Kontoauszug wählen", "Choose statement")}</option>
            {query.data?.statements.map((s) => (
              <option value={s.id} key={s.id}>
                {s.start_date} – {s.end_date} · {s.matched_count}/{s.line_count}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <div className="space-y-2 rounded-xl border border-white/20 p-5">
          <p>
            {say("Anfang / Ende laut Auszug", "Statement opening / closing")}:{" "}
            {euros(selected.opening, de)} / {euros(selected.closing, de)}
          </p>
          <p>
            {say("Anfang / Ende laut Buchhaltung", "Ledger opening / closing")}:{" "}
            {euros(selected.book_opening, de)} / {euros(selected.book_closing, de)}
          </p>
          <p>
            {say("Zugeordnet", "Matched")}: {selected.matched_count}/{selected.line_count}
          </p>
          <p className="text-amber-200">
            {selected.continuity === null
              ? say(
                  "Erster Auszug: Anfangssaldo gesondert prüfen.",
                  "First statement: verify opening balance separately.",
                )
              : selected.continuity
                ? say(
                    "Anschluss an vorherigen Auszug stimmt.",
                    "Previous statement continuity agrees.",
                  )
                : say(
                    "Lücke oder Saldoabweichung zum vorherigen Auszug prüfen.",
                    "Review a gap or balance difference from the previous statement.",
                  )}
          </p>
          <p>
            {selected.opening === selected.book_opening &&
            selected.closing === selected.book_closing &&
            selected.matched_count === selected.line_count
              ? say(
                  "Alle Zeilen zugeordnet und Buchsalden stimmen. Vollständigkeit der Auszüge separat prüfen.",
                  "All lines matched and ledger balances agree. Check statement completeness separately.",
                )
              : say("Abstimmung noch offen.", "Reconciliation remains open.")}
          </p>
          <button
            className="underline"
            disabled={busy}
            onClick={() => download(selected.document_id)}
          >
            {say("Original herunterladen", "Download original")}
          </button>
        </div>
      )}
      {query.data?.lines.map((l) => (
        <BankLine key={l.id} line={l} post={post} busy={busy} act={act} de={de} />
      ))}
      {statement && (
        <div className="flex gap-4">
          <button disabled={!page || busy} onClick={() => setPage((p) => p - 1)}>
            {say("Zurück", "Previous")}
          </button>
          <span>{page + 1}</span>
          <button
            disabled={busy || (query.data?.lines.length ?? 0) < 30}
            onClick={() => setPage((p) => p + 1)}
          >
            {say("Weiter", "Next")}
          </button>
        </div>
      )}
    </section>
  );
}
function BankLine({
  line,
  post,
  busy,
  act,
  de,
}: {
  line: Awaited<ReturnType<typeof financeBankList>>["lines"][number];
  post: boolean;
  busy: boolean;
  act: (c: BankCommand) => Promise<void>;
  de: boolean;
}) {
  const [journal, setJournal] = useState(""),
    [reason, setReason] = useState(""),
    [kind, setKind] = useState<"contribution" | "withdrawal" | "payout" | "bank_fee">(
      "contribution",
    ),
    [confirm, setConfirm] = useState(false);
  const say = (g: string, e: string) => (de ? g : e);
  return (
    <article className="space-y-3 rounded-xl border border-white/15 p-5">
      <div className="flex justify-between gap-3">
        <p>
          {line.booking_date} · {line.reference}
        </p>
        <strong className="whitespace-nowrap">{euros(line.amount, de)}</strong>
      </div>
      {line.transaction_id && (
        <p className="break-all text-xs text-neutral-400">{line.transaction_id}</p>
      )}
      {(line.fee !== null || line.gross !== null) && (
        <p className="text-sm text-neutral-400">
          {say("Original: Brutto / Gebühr", "Original: gross / fee")}:{" "}
          {line.gross === null ? "—" : euros(line.gross, de)} /{" "}
          {line.fee === null ? "—" : euros(line.fee, de)}
        </p>
      )}
      {line.journal_id && (
        <p className="break-all text-sm">
          {say("Zugeordnet", "Matched")}: {line.journal_id}
        </p>
      )}
      {post && (
        <>
          <label className="block">
            {say("Prüfvermerk / Begründung", "Review note / reason")}
            <input
              className={field}
              value={reason}
              minLength={5}
              maxLength={1000}
              onChange={(e) => {
                setReason(e.target.value);
                setConfirm(false);
              }}
            />
          </label>
          {line.match_id ? (
            <button
              className={button}
              disabled={busy || reason.trim().length < 5}
              onClick={() => act({ action: "release", id: line.match_id!, reason })}
            >
              {say("Zuordnung aufheben", "Release match")}
            </button>
          ) : (
            <>
              <label className="block">
                {say(
                  "Vorschläge (gleicher Betrag, ±3 Tage) – Inhalt prüfen",
                  "Suggestions (same amount, ±3 days) – verify content",
                )}
                <select
                  className={field}
                  value={journal}
                  onChange={(e) => setJournal(e.target.value)}
                >
                  <option value="">—</option>
                  {line.candidates.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.booking_date} · {c.memo} · {c.id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                {say("Oder Buchungs-ID eingeben", "Or enter journal ID")}
                <input
                  className={field}
                  value={journal}
                  onChange={(e) => setJournal(e.target.value)}
                />
              </label>
              <button
                className={button}
                disabled={busy || reason.trim().length < 5 || !journal}
                onClick={() => act({ action: "match", line: line.id, journal, reason })}
              >
                {say("Vorhandene Buchung zuordnen", "Match existing journal")}
              </button>
              <details>
                <summary className="cursor-pointer">
                  {say(
                    "Neue Buchung (nur wenn noch nicht verbucht)",
                    "New posting (only if not already recorded)",
                  )}
                </summary>
                <div className="mt-3 space-y-3">
                  <label className="block">
                    {say("Buchungsart", "Posting type")}
                    <select
                      className={field}
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value as typeof kind);
                        setConfirm(false);
                      }}
                    >
                      <option value="contribution">
                        {say("Privateinlage (+)", "Owner contribution (+)")}
                      </option>
                      <option value="withdrawal">
                        {say("Privatentnahme (−)", "Owner withdrawal (−)")}
                      </option>
                      <option value="payout">
                        {say(
                          "Zahlungsanbieter → Bank (+), gegen Verrechnungskonto",
                          "Provider → bank (+), against clearing",
                        )}
                      </option>
                      <option value="bank_fee">
                        {say("Separate Bankgebühr (−)", "Separate bank fee (−)")}
                      </option>
                    </select>
                  </label>
                  <p className="text-sm text-amber-200">
                    {say(
                      "PayPal-Zahlung mit einbehaltener Gebühr: Brutto, Gebühr und Netto in einer geprüften Buchung erfassen und dann zuordnen. Transfers zwischen Revolut und PayPal über beide Konten buchen; keine Einnahme erzeugen.",
                      "PayPal receipt with withheld fee: record gross, fee and net in one reviewed journal, then match it. Record transfers between Revolut and PayPal using both accounts; do not create revenue.",
                    )}
                  </p>
                  <label className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    {say(
                      "Original geprüft; noch nicht verbucht. Neue Buchung bestätigen.",
                      "Original checked; not already recorded. Confirm new posting.",
                    )}
                  </label>
                  <button
                    className={button}
                    disabled={busy || !confirm || reason.trim().length < 5}
                    onClick={() =>
                      act({ action: "classify", line: line.id, kind, reason, confirmed: true })
                    }
                  >
                    {say("Buchen und zuordnen", "Post and match")}
                  </button>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </article>
  );
}
