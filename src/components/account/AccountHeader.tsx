import { Link } from "@tanstack/react-router";
import { UserRound, Heart, Package, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";

export function AccountHeader({ active }: { active: "profile" | "orders" | "wishlist" }) {
  const { t } = useTranslation();
  const { user, profile } = useAuthStore();
  const name = profile?.full_name || user?.user_metadata?.full_name || t("nav.account");
  const tabs = [
    {
      key: "profile",
      to: "/profile",
      icon: UserRound,
      label: t("account.navProfile"),
      description: t("accountStyle.profileHint"),
    },
    {
      key: "orders",
      to: "/orders",
      icon: Package,
      label: t("account.navOrders"),
      description: t("accountStyle.ordersHint"),
    },
    {
      key: "wishlist",
      to: "/wishlist",
      icon: Heart,
      label: t("account.navWishlist"),
      description: t("accountStyle.wishlistHint"),
    },
  ] as const;
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-6 pb-8">
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-gold">
            KAPTAN · {t("nav.account")}
          </p>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-white sm:text-4xl">
            {tabs.find((tab) => tab.key === active)?.label}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/60">
            {t(`accountStyle.${active}Intro`)}
          </p>
        </div>
        <div className="hidden items-center gap-3 rounded-full border border-gold/15 bg-[#1A1A1A] py-2 pl-2 pr-5 sm:flex">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/10 font-serif text-lg text-gold">
            {String(name).slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-40 truncate text-sm text-white/80">{name}</span>
        </div>
      </div>
      <nav
        aria-label={t("nav.account")}
        className="grid grid-cols-3 gap-2 rounded-2xl border border-gold/15 bg-[#0D0D0D] p-2"
      >
        {tabs.map(({ key, to, icon: Icon, label, description }) => (
          <Link
            key={key}
            to={to}
            aria-current={active === key ? "page" : undefined}
            className={`group flex min-w-0 items-center gap-3 rounded-xl px-2 py-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold sm:px-5 ${active === key ? "bg-gold/10 text-gold ring-1 ring-inset ring-gold/30" : "text-white/60 hover:bg-gold/5 hover:text-gold"}`}
          >
            <Icon size={19} strokeWidth={1.5} className="hidden shrink-0 sm:block" />
            <span className="min-w-0 flex-1 text-center sm:text-left">
              <span className="block text-xs font-medium sm:text-sm">{label}</span>
              <span className="mt-1 hidden text-xs text-white/50 lg:block">{description}</span>
            </span>
            {active === key && <ArrowUpRight size={14} className="hidden sm:block" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
