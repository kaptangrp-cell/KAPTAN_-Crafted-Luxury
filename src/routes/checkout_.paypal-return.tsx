import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { capturePaypalCheckoutOrder } from "@/lib/payments.functions";

const searchSchema = z.object({
  orderId: z.string().uuid(),
  token: z.string().optional(),
});

export const Route = createFileRoute("/checkout_/paypal-return")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Confirming Payment — KAPTAN" }] }),
  component: PaypalReturnPage,
});

// This page is intentionally public (not under /_authenticated) — KAPTAN
// supports guest checkout, so the customer returning from PayPal may not be
// signed in. It captures the approved PayPal order and shows a
// self-contained confirmation instead of redirecting into the account-only
// /orders/$id page.
function PaypalReturnPage() {
  const { t } = useTranslation();
  const { orderId, token } = Route.useSearch();
  const captureFn = useServerFn(capturePaypalCheckoutOrder);
  const attempted = useRef(false);

  const [state, setState] = useState<
    | { status: "confirming" }
    | { status: "success"; orderNumber: string }
    | { status: "error"; message: string }
  >({ status: "confirming" });

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState({ status: "error", message: t("paypalReturn.missingToken") });
      return;
    }

    captureFn({ data: { orderId, paypalOrderId: token } })
      .then((res) => setState({ status: "success", orderNumber: res.orderNumber }))
      .catch((err) =>
        setState({
          status: "error",
          message: err instanceof Error ? err.message : t("paypalReturn.confirmFailed"),
        }),
      );
  }, [orderId, token, captureFn, t]);

  return (
    <PageLayout>
      <section className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        {state.status === "confirming" && (
          <>
            <Loader2 size={40} className="animate-spin text-gold" />
            <h1 className="mt-6 font-serif text-2xl text-white">{t("paypalReturn.confirmingTitle")}</h1>
            <p className="mt-2 text-sm text-white/60">
              {t("paypalReturn.confirmingBody")}
            </p>
          </>
        )}

        {state.status === "success" && (
          <>
            <CheckCircle2 size={48} className="text-gold" />
            <h1 className="mt-6 font-serif text-3xl text-white">{t("paypalReturn.successTitle")}</h1>
            <p className="mt-2 text-sm text-white/60">
              {t("paypalReturn.successBodyPrefix")}{" "}
              <span className="text-gold">{state.orderNumber}</span>{" "}
              {t("paypalReturn.successBodySuffix")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/products"
                className="border border-gold px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold hover:text-black"
              >
                {t("cart.continueShopping")}
              </Link>
              <Link
                to="/orders"
                className="bg-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-gold-vivid"
              >
                {t("paypalReturn.viewMyOrders")}
              </Link>
            </div>
          </>
        )}

        {state.status === "error" && (
          <>
            <XCircle size={48} className="text-red-400" />
            <h1 className="mt-6 font-serif text-2xl text-white">{t("paypalReturn.errorTitle")}</h1>
            <p className="mt-2 text-sm text-white/60">{state.message}</p>
            <p className="mt-1 text-xs text-white/40">
              {t("paypalReturn.errorHint")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                to="/checkout"
                className="border border-gold px-5 py-2.5 text-sm font-semibold text-gold hover:bg-gold hover:text-black"
              >
                {t("paypalReturn.backToCheckout")}
              </Link>
              <Link
                to="/contact"
                className="bg-gold px-5 py-2.5 text-sm font-bold text-black hover:bg-gold-vivid"
              >
                {t("paypalReturn.contactSupport")}
              </Link>
            </div>
          </>
        )}
      </section>
    </PageLayout>
  );
}
