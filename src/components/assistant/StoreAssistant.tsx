import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, ArrowUpRight, RotateCcw } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { searchAssistantProducts } from "@/lib/assistant.functions";
import { assistantIntent } from "@/lib/store-assistant";
import { ProfileAvatar } from "@/components/account/ProfileAvatar";
import { CatalogText } from "@/components/common/CatalogText";
import { Price } from "@/components/common/Price";
import { ProductFacts } from "@/components/product/ProductFacts";
import { useAuthStore } from "@/stores/authStore";

type ProductResult = Awaited<ReturnType<typeof searchAssistantProducts>>["products"][number];
type Answer = {
  id: number;
  question: string;
  text: string[];
  products?: ProductResult[];
  link?: "/returns" | "/shipping" | "/faq" | "/orders" | "/contact" | "/products";
  label?: string;
};
export function StoreAssistant() {
  const { t, i18n } = useTranslation();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { user, profile } = useAuthStore();
  const searchProducts = useServerFn(searchAssistantProducts);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  useEffect(() => {
    generation.current++;
    working.current = false;
    setAnswers([]);
    setBusy(false);
    setError(false);
    setQuestion("");
  }, [user?.id, i18n.language]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "instant" });
  }, [answers, busy, open]);
  const slug = path.startsWith("/products/")
    ? decodeURIComponent(path.slice("/products/".length))
    : undefined;

  async function ask(value: string) {
    const query = value.trim().slice(0, 300);
    if (!query || working.current) return;
    working.current = true;
    setBusy(true);
    setError(false);
    setQuestion("");
    const revision = generation.current;
    const answer: Answer = { id: Date.now(), question: query, text: [] };
    const intent = assistantIntent(query);
    try {
      const faq = t("faq.items", { returnObjects: true }) as { q: string; a: string }[];
      if (intent === "returns") {
        answer.text = [t("returns.p1"), t("returns.p2"), t("returns.p3")];
        answer.link = "/returns";
        answer.label = t("returns.title");
      } else if (intent === "shipping") {
        answer.text = [t("shipping.p1"), t("assistant.shippingCosts"), t("shipping.p3")];
        answer.link = "/shipping";
        answer.label = t("shipping.title");
      } else if (intent === "tracking") {
        answer.text = [t("assistant.tracking")];
        answer.link = "/orders";
        answer.label = t("account.navOrders");
      } else if (intent === "payment") {
        answer.text = [t("pdp.paymentMethodsBody"), t("assistant.payment")];
        answer.link = "/faq";
        answer.label = t("faq.title");
      } else if (intent === "support") {
        answer.text = [t("assistant.support")];
        answer.link = "/contact";
        answer.label = t("nav.contact");
      } else if (intent === "faq" || intent === "care" || intent === "authenticity") {
        const selected =
          intent === "care"
            ? faq.filter((item) => /care|pflege/i.test(item.q))
            : intent === "authenticity"
              ? faq.filter((item) => /authentic|echt/i.test(item.q))
              : faq;
        answer.text = (selected.length ? selected : faq).map((item) => `${item.q}\n${item.a}`);
        answer.link = "/faq";
        answer.label = t("faq.title");
      } else {
        const result = await searchProducts({ data: { question: query, slug } });
        answer.products = result.products;
        answer.text = [
          result.total ? t("assistant.matches", { count: result.total }) : t("assistant.noMatch"),
        ];
        answer.link = "/products";
        answer.label = t("products.viewAllProducts");
      }
      if (revision === generation.current)
        setAnswers((previous) => [...previous.slice(-11), answer]);
    } catch {
      if (revision === generation.current) {
        setError(true);
        setQuestion(query);
      }
    } finally {
      if (revision === generation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  }
  if (path.startsWith("/warehouse") || path.startsWith("/admin") || path.startsWith("/checkout"))
    return null;
  const suggestions = [
    ...(slug ? [t("assistant.thisProduct")] : [t("assistant.findExample")]),
    t("assistant.returnsQuestion"),
    t("assistant.shippingQuestion"),
    t("assistant.trackingQuestion"),
    t("assistant.faqQuestion"),
  ];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className={`fixed right-5 z-40 flex min-h-12 items-center gap-2 rounded-full border border-gold/30 bg-gold px-4 text-sm font-semibold text-black shadow-lg transition-transform motion-safe:hover:-translate-y-1 ${slug ? "bottom-36" : "bottom-5"}`}
          aria-label={t("assistant.title")}
        >
          <MessageCircle size={21} />
          <span>{t("assistant.title")}</span>
        </button>
      </SheetTrigger>
      <SheetContent className="flex h-[100dvh] w-full flex-col gap-0 border-gold/20 bg-[#0D0D0D] p-0 text-white sm:max-w-md">
        <div className="border-b border-gold/15 px-5 pb-4 pt-6 pr-12">
          <SheetTitle className="flex items-center gap-2 font-serif text-2xl text-gold">
            <MessageCircle size={23} />
            {t("assistant.title")}
          </SheetTitle>
          <SheetDescription className="mt-2 text-xs leading-relaxed text-white/60">
            {t("assistant.description")}
          </SheetDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 rounded-2xl border border-gold/15 bg-gold/5 p-4">
            <p className="font-serif text-lg text-white">{t("assistant.welcome")}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{t("assistant.intro")}</p>
          </div>
          <div
            role="log"
            aria-live="polite"
            aria-label={t("assistant.conversation")}
            className="space-y-5"
          >
            {answers.map((answer) => (
              <div key={answer.id} className="kaptan-enter space-y-3">
                <div className="ml-8 flex items-start justify-end gap-2">
                  <p className="rounded-2xl rounded-tr-sm bg-gold/15 px-4 py-3 text-sm text-white">
                    {answer.question}
                  </p>
                  <ProfileAvatar url={profile?.avatar_url} className="h-8 w-8" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-gold/15 bg-black p-4">
                  {answer.text.map((text, index) => (
                    <p
                      key={index}
                      className="mb-3 whitespace-pre-line text-sm leading-relaxed text-white/80"
                    >
                      {text}
                    </p>
                  ))}
                  {answer.products?.map((product) => {
                    const image =
                      [...product.product_images]
                        .filter((image) => image.media_type !== "video")
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.url ??
                      "/product-placeholder.svg";
                    return (
                      <article
                        key={product.id}
                        className="mb-3 rounded-xl border border-gold/15 p-3"
                      >
                        <Link
                          to="/products/$slug"
                          params={{ slug: product.slug }}
                          onClick={() => setOpen(false)}
                          className="flex gap-3"
                        >
                          <img
                            src={image}
                            alt=""
                            className="h-16 w-16 rounded-lg bg-[#f3f0eb] object-contain"
                          />
                          <div className="min-w-0">
                            <p className="font-serif text-sm text-gold">
                              <CatalogText text={product.name} />
                            </p>
                            <Price
                              amount={product.price}
                              className="mt-1 block text-sm text-white"
                            />
                            <p className="mt-1 text-xs text-white/60">
                              {t(product.stock_quantity > 0 ? "pdp.inStock" : "pdp.outOfStock")}
                            </p>
                          </div>
                        </Link>
                        <p className="mt-3 text-xs leading-relaxed text-white/70">
                          <CatalogText text={product.short_description} />
                        </p>
                        <ProductFacts
                          specifications={product.specifications}
                          variants={product.product_variants}
                        />
                        <details className="mt-3 text-xs">
                          <summary className="cursor-pointer text-gold">
                            {t("assistant.allDetails")}
                          </summary>
                          <p className="mt-2 whitespace-pre-line leading-relaxed text-white/70">
                            <CatalogText
                              text={product.full_description || t("assistant.noDetails")}
                            />
                          </p>
                          <ul className="mt-3 space-y-2">
                            {product.product_variants
                              .filter((v) => v.is_available !== false)
                              .map((variant, index) => (
                                <li
                                  key={index}
                                  className="border-t border-gold/10 pt-2 text-white/70"
                                >
                                  {variant.variant_value} ·{" "}
                                  <Price
                                    amount={
                                      Number(product.price) + Number(variant.price_modifier ?? 0)
                                    }
                                  />{" "}
                                  ·{" "}
                                  {t(
                                    product.stock_quantity > 0 && variant.stock_quantity !== 0
                                      ? "pdp.inStock"
                                      : "pdp.outOfStock",
                                  )}
                                </li>
                              ))}
                          </ul>
                        </details>
                      </article>
                    );
                  })}
                  {answer.link && (
                    <Link
                      to={answer.link}
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-gold underline underline-offset-4"
                    >
                      {answer.label}
                      <ArrowUpRight size={13} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
          {busy && (
            <div role="status" className="mt-4 rounded-xl border border-gold/15 p-4">
              <p className="text-sm text-white/60">{t("assistant.searching")}</p>
              <div className="kaptan-skeleton mt-3 h-3 rounded bg-gold/10" />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {t("assistant.error")}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {suggestions.map((text) => (
              <button
                key={text}
                disabled={busy}
                onClick={() => void ask(text)}
                className="rounded-full border border-gold/25 px-3 py-2 text-xs text-gold hover:bg-gold/10 disabled:opacity-40"
              >
                {text}
              </button>
            ))}
          </div>
          <div ref={bottom} />
        </div>
        <div className="border-t border-gold/15 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
          >
            <input
              value={question}
              maxLength={300}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("assistant.placeholder")}
              aria-label={t("assistant.placeholder")}
              className="min-w-0 flex-1 rounded-xl border border-gold/25 bg-black px-3 py-3 text-sm text-white outline-none focus:border-gold"
            />
            <button
              disabled={!question.trim() || busy}
              type="submit"
              aria-label={t("assistant.send")}
              className="rounded-xl bg-gold px-4 text-black disabled:opacity-40"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <a
              href="https://wa.me/491757134333"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold underline underline-offset-4"
            >
              {t("assistant.human")}
            </a>
            <button
              disabled={busy || !answers.length}
              onClick={() => {
                generation.current++;
                setAnswers([]);
                setError(false);
              }}
              className="flex items-center gap-1 text-white/50 disabled:opacity-40"
            >
              <RotateCcw size={12} />
              {t("assistant.clear")}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
