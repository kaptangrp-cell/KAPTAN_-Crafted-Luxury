import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  getWarehouseDashboard,
  manageWarehouse,
  getQrActivationBlockers,
} from "@/lib/warehouse.functions";
import {
  warehousePermissions,
  type WarehousePermission,
  type UnitLabel,
  WarehouseAdminSchema,
} from "@/lib/warehouse";
import { LabelSheet } from "./LabelSheet";
import { useAuthStore } from "@/stores/authStore";
export function InventoryAdmin({ staffOnly = false }: { staffOnly?: boolean }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const load = useServerFn(getWarehouseDashboard);
  const manage = useServerFn(manageWarehouse);
  const query = useQuery({
    queryKey: ["warehouse-admin", user?.id],
    queryFn: () => load({ data: { admin: true } }),
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<WarehousePermission[]>([]);
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState("Main");
  const [ack, setAck] = useState(false);
  const [labels, setLabels] = useState<UnitLabel[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef<z.infer<typeof WarehouseAdminSchema> | null>(null);
  const running = useRef(false);
  const product = query.data?.products?.find((p) => p.id === productId);
  const blockersFn = useServerFn(getQrActivationBlockers);
  const blockers = useQuery({
    queryKey: ["qr-activation-blockers", user?.id, productId],
    queryFn: () => blockersFn({ data: { productId } }),
    enabled: Boolean(product && !product.managed),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const hasBlockers = Boolean(blockers.data?.orders.length || blockers.data?.holds.length);
  async function run(command: Omit<z.infer<typeof WarehouseAdminSchema>, "operation">) {
    if (running.current) return;
    setError("");
    setMessage("");
    running.current = true;
    setBusy(true);
    try {
      if (
        !pending.current ||
        JSON.stringify({ ...pending.current, operation: undefined }) !== JSON.stringify(command)
      )
        pending.current = WarehouseAdminSchema.parse({
          ...command,
          operation: crypto.randomUUID(),
        });
      const result = await manage({ data: pending.current });
      pending.current = null;
      if (Array.isArray(result)) setLabels(result);
      setMessage(t("warehouse.saved"));
      setAck(false);
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("warehouse.failed"));
      if (command.action === "enable") void blockers.refetch();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function reprint(batch: string) {
    setBusy(true);
    setError("");
    try {
      const data = await load({ data: { admin: true, batch } });
      setLabels(data.labels ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("warehouse.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="warehouse-workspace mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl text-gold">
          {t(staffOnly ? "warehouse.staffTitle" : "warehouse.inventoryTitle")}
        </h1>
        <Link to="/warehouse" className="warehouse-button">
          {t("warehouse.openScanner")}
        </Link>
      </div>
      {query.isPending && <p role="status">{t("warehouse.loading")}</p>}
      {query.error && (
        <p role="alert" className="rounded-xl border border-red-400/40 p-4">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <>
          {staffOnly ? (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({ action: "staff", data: { email, permissions } });
                }}
                className="space-y-4 rounded-2xl border border-gold/20 p-5"
              >
                <p className="text-sm text-white/60">{t("warehouse.staffHelp")}</p>
                <label className="block">
                  {t("warehouse.employeeEmail")}
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="warehouse-input"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {warehousePermissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex items-center gap-3 rounded-xl border border-white/10 p-4"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes(permission)}
                        onChange={(e) =>
                          setPermissions((old) =>
                            e.target.checked
                              ? [...old, permission]
                              : old.filter((p) => p !== permission),
                          )
                        }
                      />
                      {t(`warehouse.${permission}`)}
                    </label>
                  ))}
                </div>
                <button disabled={busy} className="warehouse-button">
                  {t("warehouse.savePermissions")}
                </button>
                <p className="text-xs text-white/50">{t("warehouse.revokeHelp")}</p>
              </form>
              <div className="space-y-3">
                {query.data.staff?.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setEmail(s.email);
                      setPermissions(s.permissions);
                    }}
                    className="block w-full rounded-xl border border-white/15 p-4 text-left"
                  >
                    <b>{s.name || s.email}</b>
                    <p className="text-sm text-white/60">
                      {s.email} ·{" "}
                      {s.permissions.map((p) => t(`warehouse.${p}`)).join(", ") ||
                        t("warehouse.revoked")}
                    </p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(query.data.counts ?? {}).map(([state, count]) => (
                  <div key={state} className="rounded-xl border border-gold/20 p-4">
                    <b className="block text-2xl text-gold">{count}</b>
                    <span className="text-sm">{t(`warehouse.state.${state}`)}</span>
                  </div>
                ))}
              </div>
              <section className="space-y-4 rounded-2xl border border-gold/20 p-5">
                <label className="block">
                  {t("warehouse.product")}
                  <select
                    value={productId}
                    onChange={(e) => {
                      setProductId(e.target.value);
                      setVariantId("");
                      setAck(false);
                      setLabels([]);
                    }}
                    className="warehouse-input"
                  >
                    <option value="">{t("warehouse.selectProduct")}</option>
                    {query.data.products?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.stock} · {p.managed ? "QR" : "—"}
                      </option>
                    ))}
                  </select>
                </label>
                {product && !product.managed && (
                  <>
                    <p className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">
                      {t("warehouse.activationWarning", { count: product.stock })}
                    </p>
                    <section
                      className="space-y-3 rounded-xl border border-white/15 p-4"
                      aria-label={t("warehouse.blockersTitle")}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-semibold">{t("warehouse.blockersTitle")}</h2>
                        <button
                          type="button"
                          disabled={blockers.isFetching}
                          onClick={() => void blockers.refetch()}
                          className="text-gold underline"
                        >
                          {t("warehouse.recheck")}
                        </button>
                      </div>
                      {blockers.isFetching && (
                        <p role="status">{t("warehouse.checkingBlockers")}</p>
                      )}
                      {blockers.error && (
                        <p role="alert" className="text-red-300">
                          {blockers.error.message}
                        </p>
                      )}
                      {blockers.data && (
                        <>
                          {!hasBlockers && (
                            <p className="text-green-300">{t("warehouse.noBlockers")}</p>
                          )}
                          {hasBlockers && (
                            <p className="text-sm text-white/70">{t("warehouse.blockersHelp")}</p>
                          )}
                          {blockers.data.orders.map((order) => (
                            <div
                              key={order.id}
                              className="rounded-lg border border-white/10 p-3 text-sm"
                            >
                              <Link
                                to="/admin/orders"
                                search={{ orderNumber: order.number }}
                                className="break-all font-semibold text-gold underline"
                              >
                                {order.number}
                              </Link>
                              <p>
                                {t("warehouse.orderStatus")}:{" "}
                                {t(`warehouse.orderStates.${order.status}`, {
                                  defaultValue: order.status,
                                })}{" "}
                                · {t("warehouse.paymentStatus")}:{" "}
                                {t(`warehouse.paymentStates.${order.payment}`, {
                                  defaultValue: order.payment,
                                })}
                              </p>
                              {order.payment === "pending" && (
                                <p className="mt-1 text-amber-200">
                                  {t("warehouse.pendingOrderHelp")}
                                </p>
                              )}
                            </div>
                          ))}
                          {blockers.data.holds.length > 0 && (
                            <p className="text-sm text-white/70">{t("warehouse.holdsHelp")}</p>
                          )}
                          {blockers.data.holds.map((hold) => (
                            <p
                              key={hold.id}
                              className="break-all rounded-lg border border-white/10 p-3 text-sm"
                            >
                              {t("warehouse.paymentHold")} · {hold.id} ·{" "}
                              {new Date(hold.createdAt).toLocaleString()}
                            </p>
                          ))}
                        </>
                      )}
                    </section>
                    <label className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      {t("warehouse.activationAck")}
                    </label>
                    <button
                      disabled={
                        busy ||
                        !ack ||
                        blockers.isFetching ||
                        !blockers.data ||
                        Boolean(blockers.error) ||
                        hasBlockers
                      }
                      onClick={() => void run({ action: "enable", data: { productId } })}
                      className="warehouse-button"
                    >
                      {t("warehouse.enable")}
                    </button>
                  </>
                )}
                {product?.managed && (
                  <>
                    <p className="text-sm text-white/60">{t("warehouse.labelsHelp")}</p>
                    <label className="block">
                      {t("warehouse.variant")}
                      <select
                        value={variantId}
                        onChange={(e) => setVariantId(e.target.value)}
                        className="warehouse-input"
                      >
                        <option value="">{t("warehouse.selectVariant")}</option>
                        {product.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} · {v.stock ?? 0}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label>
                        {t("warehouse.quantity")}
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={quantity}
                          onChange={(e) => setQuantity(Number(e.target.value))}
                          className="warehouse-input"
                        />
                      </label>
                      <label>
                        {t("warehouse.location")}
                        <input
                          maxLength={80}
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="warehouse-input"
                        />
                      </label>
                    </div>
                    <button
                      disabled={
                        busy || !variantId || quantity < 1 || quantity > 200 || !location.trim()
                      }
                      onClick={() =>
                        void run({ action: "labels", data: { variantId, quantity, location } })
                      }
                      className="warehouse-button"
                    >
                      {t("warehouse.createLabels")}
                    </button>
                  </>
                )}
              </section>
              <LabelSheet labels={labels} />
              <section>
                <h2 className="mb-3 font-serif text-xl">{t("warehouse.batches")}</h2>
                <div className="max-h-64 space-y-2 overflow-auto">
                  {query.data.batches?.map((b) => (
                    <button
                      disabled={busy}
                      key={b.batch_id}
                      onClick={() => void reprint(b.batch_id)}
                      className="block w-full rounded-xl border border-white/10 p-3 text-left text-sm"
                    >
                      {new Date(b.created_at).toLocaleString()} · {b.quantity} ·{" "}
                      {t("warehouse.reprint")}
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <h2 className="mb-3 font-serif text-xl">{t("warehouse.audit")}</h2>
                <div className="max-h-80 space-y-2 overflow-auto">
                  {query.data.events?.map((e) => (
                    <div key={e.id} className="rounded-xl border border-white/10 p-3 text-xs">
                      <span>
                        {new Date(e.created_at).toLocaleString()} ·{" "}
                        {e.old_state ? t(`warehouse.state.${e.old_state}`) : "—"} →{" "}
                        {t(`warehouse.state.${e.new_state}`)}
                      </span>
                      <p className="break-all text-white/50">
                        {e.unit_id} · {e.actor_id ?? t("warehouse.system")}
                      </p>
                      {e.reason && <p>{e.reason}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-300">
          {message}
        </p>
      )}
    </div>
  );
}
