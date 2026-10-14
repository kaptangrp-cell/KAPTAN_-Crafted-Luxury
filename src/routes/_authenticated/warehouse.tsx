import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ScanLine, PackageCheck, Truck, RotateCcw, ClipboardCheck } from "lucide-react";
import { getWarehouseDashboard, scanWarehouseUnit } from "@/lib/warehouse.functions";
import {
  parseUnitCode,
  type ScanInput,
  type ScanResult,
  type WarehousePermission,
} from "@/lib/warehouse";
import { QrCamera } from "@/components/warehouse/QrCamera";
import { useAuthStore } from "@/stores/authStore";
export const Route = createFileRoute("/_authenticated/warehouse")({ component: WarehousePage });
function WarehousePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const dashboard = useServerFn(getWarehouseDashboard);
  const scan = useServerFn(scanWarehouseUnit);
  const access = useQuery({
    queryKey: ["warehouse", user?.id],
    queryFn: () => dashboard({ data: { admin: false } }),
    refetchInterval: 15000,
    retry: false,
  });
  const [mode, setMode] = useState<WarehousePermission>("receive");
  const [action, setAction] = useState<ScanInput["action"]>("receive");
  const [order, setOrder] = useState("");
  const [orderLookup, setOrderLookup] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const pending = useRef<ScanInput | null>(null);
  const running = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const orderInfo = useQuery({
    queryKey: ["warehouse-order", user?.id, orderLookup],
    queryFn: () => dashboard({ data: { admin: false, order: orderLookup } }),
    enabled: !!orderLookup,
    refetchInterval: 10000,
    retry: false,
  });
  async function submit(raw: string) {
    if (running.current) return;
    setCamera(false);
    setError("");
    setLastResult(null);
    try {
      const unit = parseUnitCode(raw);
      if (!navigator.onLine) throw new Error(t("warehouse.offline"));
      const body = { unit, action, order: order.trim(), reason: reason.trim() };
      if (
        !pending.current ||
        JSON.stringify({ ...pending.current, operation: undefined }) !== JSON.stringify(body)
      )
        pending.current = { ...body, operation: crypto.randomUUID() };
      running.current = true;
      setBusy(true);
      const result = await scan({ data: pending.current });
      pending.current = null;
      setLastResult(result);
      setResults((old) => [result, ...old].slice(0, 20));
      setCode("");
      void orderInfo.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("warehouse.failed"));
    } finally {
      running.current = false;
      setBusy(false);
      input.current?.focus();
    }
  }
  const modes = [
    { id: "receive", icon: PackageCheck },
    { id: "dispatch", icon: Truck },
    { id: "return", icon: RotateCcw },
    { id: "inspect", icon: ClipboardCheck },
    { id: "sell", icon: ScanLine },
  ] as const;
  const permitted = access.data?.permissions.includes(mode);
  return (
    <main className="warehouse-workspace mx-auto min-h-screen max-w-3xl px-4 py-8 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold">KAPTAN</p>
          <h1 className="font-serif text-3xl">{t("warehouse.title")}</h1>
        </div>
        <Link to="/" className="text-gold">
          {t("warehouse.store")}
        </Link>
      </div>
      {access.isPending ? (
        <p role="status">{t("warehouse.loading")}</p>
      ) : access.error ? (
        <p role="alert" className="rounded-xl border border-red-400/40 p-4">
          {access.error.message}
        </p>
      ) : (
        <>
          <p className="mb-5 text-sm text-white/60">{t("warehouse.intro")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {modes
              .filter((m) => access.data?.permissions.includes(m.id))
              .map((m) => (
                <button
                  key={m.id}
                  disabled={busy}
                  onClick={() => {
                    setMode(m.id);
                    setAction(m.id === "dispatch" ? "pack" : m.id === "inspect" ? "pass" : m.id);
                    setError("");
                    setLastResult(null);
                    setCamera(false);
                    setCode("");
                    pending.current = null;
                  }}
                  className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border ${mode === m.id ? "border-gold bg-gold/15 text-gold" : "border-white/15"}`}
                >
                  <m.icon size={25} />
                  {t(`warehouse.${m.id}`)}
                </button>
              ))}
          </div>
          {!permitted ? (
            <p className="mt-6">{t("warehouse.choose")}</p>
          ) : (
            <section className="mt-6 space-y-4 rounded-2xl border border-gold/20 bg-white/[0.03] p-5">
              <h2 className="font-serif text-xl text-gold">{t(`warehouse.${mode}`)}</h2>
              {mode === "dispatch" && (
                <>
                  <label className="block">
                    {t("warehouse.order")}
                    <input
                      value={order}
                      onChange={(e) => setOrder(e.target.value)}
                      className="warehouse-input"
                      placeholder="KPT-…"
                    />
                  </label>
                  <button
                    onClick={() => setOrderLookup(order.trim())}
                    className="text-gold underline"
                  >
                    {t("warehouse.loadOrder")}
                  </button>
                  {orderInfo.error && <p role="alert">{orderInfo.error.message}</p>}
                  {orderInfo.data &&
                    (orderInfo.data.order ? (
                      <div className="rounded-xl bg-black p-3 text-sm">
                        <b>{orderInfo.data.order.number}</b>
                        {orderInfo.data.order.units.map((u, i) => (
                          <p key={i}>
                            {u.name} · {u.variant} · {t(`warehouse.state.${u.state}`)} ·{" "}
                            {u.location}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p>{t("warehouse.noOrder")}</p>
                    ))}
                  <label className="block">
                    {t("warehouse.action")}
                    <select
                      className="warehouse-input"
                      value={action}
                      onChange={(e) => setAction(e.target.value as ScanInput["action"])}
                    >
                      <option value="pack">{t("warehouse.pack")}</option>
                      <option value="dispatch">{t("warehouse.handoff")}</option>
                    </select>
                  </label>
                </>
              )}
              {mode === "inspect" && (
                <label className="block">
                  {t("warehouse.action")}
                  <select
                    className="warehouse-input"
                    value={action}
                    onChange={(e) => setAction(e.target.value as ScanInput["action"])}
                  >
                    <option value="pass">{t("warehouse.pass")}</option>
                    <option value="reject">{t("warehouse.reject")}</option>
                    <option value="unpack">{t("warehouse.unpack")}</option>
                  </select>
                </label>
              )}
              {(mode === "inspect" || mode === "sell") && (
                <label className="block">
                  {t(mode === "sell" ? "warehouse.saleReference" : "warehouse.reason")}
                  <input
                    className="warehouse-input"
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              <p className="text-sm text-white/60">{t(`warehouse.help.${mode}`)}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(code);
                }}
                className="space-y-3"
              >
                <label className="block">
                  {t("warehouse.scanLabel")}
                  <input
                    ref={input}
                    autoComplete="off"
                    className="warehouse-input font-mono"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="KPT:UNIT:1:…"
                    disabled={busy}
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button disabled={busy || !code.trim()} className="warehouse-button">
                    {t(busy ? "warehouse.saving" : "warehouse.confirmScan")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCamera(!camera)}
                    className="flex items-center gap-2 rounded-xl border border-gold/30 px-4 py-3 text-gold"
                  >
                    <Camera size={18} />
                    {t("warehouse.camera")}
                  </button>
                </div>
              </form>
              {camera && (
                <QrCamera
                  onScan={(value) => {
                    setCode(value);
                    void submit(value);
                  }}
                  onClose={() => setCamera(false)}
                />
              )}
              {error && (
                <p role="alert" className="rounded-xl border border-red-400/40 p-3 text-red-300">
                  {error}
                </p>
              )}
              {lastResult && !error && !busy && (
                <div
                  role="status"
                  className="rounded-xl border border-green-400/30 bg-green-400/10 p-4"
                >
                  <b>{t("warehouse.confirmed")}</b>
                  <p>
                    {lastResult.name} · {lastResult.variant}
                  </p>
                  <p>
                    {t(`warehouse.state.${lastResult.state}`)} · {lastResult.location}
                  </p>
                </div>
              )}
            </section>
          )}
          <h2 className="mb-3 mt-8 font-serif text-xl">{t("warehouse.recent")}</h2>
          {results.map((r, i) => (
            <p key={`${r.id}-${i}`} className="border-b border-white/10 py-3 text-sm">
              {r.name} · {r.variant}{" "}
              <span className="text-gold">{t(`warehouse.state.${r.state}`)}</span>
            </p>
          ))}
        </>
      )}
    </main>
  );
}
