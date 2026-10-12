import type { z } from "zod";
import type { ProductOptionSchema } from "@/lib/product-options";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminSaveProductOption } from "@/lib/admin.functions";
import { optionParts, type ProductOption } from "@/lib/product-options";

export function ProductOptionsEditor({
  productId,
  options,
}: {
  productId: string;
  options: ProductOption[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const save = useServerFn(adminSaveProductOption);
  const blank = {
    id: undefined as string | undefined,
    type: "Color / Size",
    color: "",
    size: "",
    value: "",
    stock: "",
    price: "0",
    active: true,
  };
  const [form, setForm] = useState(blank);
  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof ProductOptionSchema>) => save({ data }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-products"] });
      await qc.invalidateQueries({
        predicate: (query) => !String(query.queryKey[0]).startsWith("admin"),
      });
      setForm(blank);
      toast.success(t("options.saved"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function edit(option: ProductOption) {
    const parts = optionParts(option);
    setForm({
      id: option.id,
      type:
        parts.color && parts.size
          ? "Color / Size"
          : parts.color
            ? "Color"
            : parts.size
              ? "Size"
              : option.variant_type,
      color: parts.color ?? "",
      size: parts.size ?? "",
      value: option.variant_value,
      stock: option.stock_quantity?.toString() ?? "",
      price: String(option.price_modifier ?? 0),
      active: option.is_available !== false,
    });
  }
  const input =
    "mt-1 w-full rounded-lg border border-gold/25 bg-black px-3 py-2 text-sm text-white";
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-white/65">{t("options.help")}</p>
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => edit(option)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left ${form.id === option.id ? "border-gold bg-gold/10" : "border-gold/15"}`}
          >
            <span className="text-sm text-white">
              {option.variant_value}
              <span className="mt-1 block text-xs text-white/50">
                {option.stock_quantity === null
                  ? t("options.sharedStock")
                  : t("options.stockCount", { count: option.stock_quantity })}
              </span>
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs ${option.is_available !== false ? "bg-green-500/15 text-green-300" : "bg-white/10 text-white/50"}`}
            >
              {t(option.is_available !== false ? "options.active" : "options.inactive")}
            </span>
          </button>
        ))}
      </div>
      <form
        className="grid gap-4 rounded-xl border border-gold/20 p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value =
            form.type === "Color / Size"
              ? `${form.color.trim()} / ${form.size.trim()}`
              : form.type === "Color"
                ? form.color.trim()
                : form.type === "Size"
                  ? form.size.trim()
                  : form.value.trim();
          mutation.mutate({
            id: form.id,
            product_id: productId,
            variant_type: form.type,
            variant_value: value,
            stock_quantity: form.stock === "" ? null : Number(form.stock),
            price_modifier: Number(form.price),
            is_available: form.active,
          });
        }}
      >
        <div className="flex items-center justify-between sm:col-span-2">
          <h3 className="font-serif text-xl text-gold">
            {t(form.id ? "options.edit" : "options.add")}
          </h3>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(blank)}
              className="text-sm text-gold underline"
            >
              {t("options.add")}
            </button>
          )}
        </div>
        <label className="text-sm text-white/70 sm:col-span-2">
          {t("options.type")}
          <select
            className={input}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="Color / Size">{t("options.colorSize")}</option>
            <option value="Color">{t("options.color")}</option>
            <option value="Size">{t("options.size")}</option>
            {!["Color / Size", "Color", "Size"].includes(form.type) && (
              <option value={form.type}>{form.type}</option>
            )}
          </select>
        </label>
        {(form.type === "Color" || form.type === "Color / Size") && (
          <label className="text-sm text-white/70">
            {t("options.color")}
            <input
              className={input}
              required
              maxLength={70}
              pattern="[^/]+"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              placeholder={t("options.colorExample")}
            />
          </label>
        )}
        {(form.type === "Size" || form.type === "Color / Size") && (
          <label className="text-sm text-white/70">
            {t("options.size")}
            <input
              className={input}
              required
              maxLength={70}
              pattern="[^/]+"
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
              placeholder={t("options.sizeExample")}
            />
          </label>
        )}
        {!["Color", "Size", "Color / Size"].includes(form.type) && (
          <label className="text-sm text-white/70">
            {t("options.value")}
            <input
              className={input}
              required
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </label>
        )}
        <label className="text-sm text-white/70">
          {t("options.stock")}
          <input
            className={input}
            type="number"
            min="0"
            step="1"
            max="1000000"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder={t("options.sharedStock")}
          />
        </label>
        <label className="text-sm text-white/70">
          {t("options.price")}
          <input
            className={input}
            type="number"
            min="0"
            step="0.01"
            max="100000"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-3 text-sm text-white sm:col-span-2">
          <input
            className="h-4 w-4 accent-gold"
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          {t("options.activeLabel")}
        </label>
        <button
          disabled={mutation.isPending}
          className="rounded-lg bg-gold px-4 py-3 text-sm font-bold text-black disabled:opacity-50 sm:col-span-2"
        >
          {t(mutation.isPending ? "adminProducts.saving" : "options.save")}
        </button>
      </form>
    </div>
  );
}
