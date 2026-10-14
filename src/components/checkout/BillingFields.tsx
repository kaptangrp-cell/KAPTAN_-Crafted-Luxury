import { useTranslation } from "react-i18next";
import type { BillingInput } from "@/lib/billing";
export function BillingFields({
  value,
  onChange,
  error,
}: {
  value: BillingInput;
  onChange: (value: BillingInput) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof BillingInput>(key: K, next: BillingInput[K]) =>
    onChange({ ...value, [key]: next });
  const input = (
    key:
      | "legalName"
      | "vatId"
      | "buyerReference"
      | "purchaseOrder"
      | "line1"
      | "line2"
      | "city"
      | "postalCode",
    required = false,
  ) => (
    <label className="block text-sm text-white/80">
      {t(`billing.${key}`)}
      {required ? " *" : ""}
      <input
        className="warehouse-input"
        value={value[key]}
        onChange={(e) => set(key, e.target.value)}
        maxLength={key === "line1" || key === "line2" ? 200 : 160}
        required={required}
      />
    </label>
  );
  return (
    <section className="space-y-4 rounded-2xl border border-gold/20 p-5">
      <h2 className="font-serif text-xl text-gold">{t("billing.title")}</h2>
      <p className="text-sm text-white/60">{t("billing.intro")}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["private", "business", "public_authority"] as const).map((kind) => (
          <label
            key={kind}
            className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${value.customerType === kind ? "border-gold text-gold" : "border-white/20 text-white"}`}
          >
            <input
              type="radio"
              name="customerType"
              checked={value.customerType === kind}
              onChange={() => set("customerType", kind)}
            />
            {t(`billing.${kind}`)}
          </label>
        ))}
      </div>
      {value.customerType !== "private" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {input("legalName", true)}
          {input("vatId")}
          {input("buyerReference", value.customerType === "public_authority")}
          {input("purchaseOrder")}
        </div>
      )}
      {value.customerType === "public_authority" && (
        <>
          <p className="text-sm text-white/60">{t("billing.authorityHelp")}</p>
          <label className="block text-sm text-white/80">
            {t("billing.deliveryChannel")}
            <select
              className="warehouse-input"
              value={value.deliveryChannel}
              onChange={(e) =>
                set("deliveryChannel", e.target.value as BillingInput["deliveryChannel"])
              }
            >
              <option value="email">{t("billing.email")}</option>
              <option value="portal">{t("billing.portal")}</option>
            </select>
          </label>
          {value.deliveryChannel === "portal" && (
            <label className="block text-sm text-white/80">
              {t("billing.portalInstructions")}
              <textarea
                required
                maxLength={500}
                className="warehouse-input"
                value={value.portalInstructions}
                onChange={(e) => set("portalInstructions", e.target.value)}
              />
            </label>
          )}
        </>
      )}
      <label className="flex gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={value.sameAsShipping}
          onChange={(e) => set("sameAsShipping", e.target.checked)}
        />
        {t("billing.sameAsShipping")}
      </label>
      {!value.sameAsShipping && (
        <div className="grid gap-3 sm:grid-cols-2">
          {input("line1", true)}
          {input("line2")}
          {input("postalCode", true)}
          {input("city", true)}
          <p className="text-sm text-white/60">{t("billing.germany")}</p>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm text-white/80">
        <input
          type="checkbox"
          checked={value.emailConsent}
          onChange={(e) => set("emailConsent", e.target.checked)}
        />
        {t("billing.consent")}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
