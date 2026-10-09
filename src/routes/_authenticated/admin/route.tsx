import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingCart,
  Users,
  Newspaper,
  ArrowUpRight,
  Sun,
  Moon,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (!profile || profile.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({ meta: [{ title: "Admin — KAPTAN" }] }),
  component: AdminLayout,
});

const nav: { to: string; labelKey: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/admin", labelKey: "admin.navDashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/products", labelKey: "admin.navProducts", icon: Package },
  { to: "/admin/categories", labelKey: "admin.navCategories", icon: FolderTree },
  { to: "/admin/journal", labelKey: "admin.navJournal", icon: Newspaper },
  { to: "/admin/orders", labelKey: "admin.navOrders", icon: ShoppingCart },
  { to: "/admin/customers", labelKey: "admin.navCustomers", icon: Users },
];

function AdminLayout() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = usePreferencesStore();
  const { isAdmin } = useAuthStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // SSR-safe hydration check
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className="admin-workspace min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-gold/15 bg-black px-4 md:px-8">
        <div className="mx-auto flex h-20 max-w-[1600px] items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-3 text-gold">
            <img src="/kaptan-logo.png" alt="" className="h-10 w-10 object-contain" />
            <span className="font-serif text-xl tracking-[0.15em]">KAPTAN</span>
            <span className="hidden border-l border-gold/20 pl-3 text-xs uppercase tracking-widest sm:block">
              {t("adminWorkspace.workspace")}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gold"
              aria-label={t(theme === "dark" ? "theme.light" : "theme.dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg border border-gold/25 px-3 py-2 text-xs text-gold"
            >
              {t("adminWorkspace.viewStore")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto grid grid-cols-1 max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="min-w-0 h-fit rounded-2xl border border-gold/15 bg-[#0D0D0D] p-3 lg:sticky lg:top-26">
          <p className="mb-4 font-serif text-xs uppercase tracking-[0.2em] text-gold">
            {t("admin.navSectionLabel")}
          </p>
          <nav
            aria-label={t("adminWorkspace.navigation")}
            className="flex gap-1 overflow-x-auto lg:flex-col"
          >
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to as "/admin"}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
                    active
                      ? "bg-gold/10 text-gold"
                      : "text-white/70 hover:bg-white/5 hover:text-gold"
                  }`}
                >
                  <item.icon size={16} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 hidden border-t border-gold/10 px-3 pt-4 lg:block">
            <ShieldCheck size={18} className="text-gold" />
            <p className="mt-2 text-xs text-white/50">{t("adminWorkspace.secureArea")}</p>
          </div>
        </aside>
        <section className="min-w-0">
          {ready && !isAdmin ? <p className="text-white/60">{t("admin.notAdmin")}</p> : <Outlet />}
        </section>
      </div>
    </div>
  );
}
