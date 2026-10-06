import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { PageLayout } from "@/components/layout/PageLayout";
import { refreshCheckoutPayment } from "@/lib/payments.functions";
import { finishAttempt } from "@/lib/checkout-attempt";

export const Route = createFileRoute("/checkout_/complete")({
  validateSearch: (input) => z.object({ orderId: z.string().uuid() }).parse(input),
  head: () => ({
    meta: [{ title: "Order confirmation — KAPTAN" }, { name: "robots", content: "noindex" }],
  }),
  component: CheckoutComplete,
});

function CheckoutComplete() {
  const { t } = useTranslation();
  const { orderId } = Route.useSearch();
  const verify = useServerFn(refreshCheckoutPayment);
  const receipt = useQuery({
    queryKey: ["checkout-receipt", orderId],
    queryFn: () => verify({ data: { orderId } }),
    retry: 2,
    refetchInterval: (q) =>
      q.state.data?.paymentStatus === "pending" && q.state.dataUpdateCount < 12 ? 5000 : false,
  });
  const paid = receipt.data?.paymentStatus === "paid";
  useEffect(() => {
    if (paid) finishAttempt(orderId);
  }, [paid, orderId]);
  return (
    <PageLayout>
      <section className="mx-auto max-w-xl px-4 py-20 text-center" aria-live="polite">
        <h1 className="font-serif text-3xl text-white">
          {t(paid ? "checkout.confirmedTitle" : "checkout.confirmingTitle")}
        </h1>
        {receipt.data && (
          <p className="mt-4 text-gold">
            {receipt.data.orderNumber} · €{Number(receipt.data.total).toFixed(2)}
          </p>
        )}
        <p className="mt-4 text-white/80">
          {receipt.error
            ? receipt.error.message
            : t(paid ? "checkout.confirmedBody" : "checkout.confirmingBody")}
        </p>
        {!paid && (
          <button
            className="mt-6 border border-gold px-5 py-3 text-gold"
            onClick={() => receipt.refetch()}
          >
            {t("checkout.checkPayment")}
          </button>
        )}
        <div className="mt-8 flex justify-center gap-6">
          <Link to="/products" className="text-gold underline">
            {t("cart.continueShopping")}
          </Link>
          <Link to="/contact" className="text-gold underline">
            {t("footer.contact")}
          </Link>
        </div>
      </section>
    </PageLayout>
  );
}
