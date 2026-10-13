import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Search,
  Heart,
  ShoppingBag,
  Menu,
  X,
  User,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  Package,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useCartStore } from "@/stores/cartStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

const INACTIVITY_LIMIT = 15 * 60 * 1000;

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoutTimer = useRef<number | null>(null);

  const { user, profile } = useAuthStore();
  const { openCart } = useUIStore();
  const totalItems = useCartStore((s) => s.items.reduce((total, item) => total + item.quantity, 0));

  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage } = usePreferencesStore();

  const userName =
    profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account";

  async function handleLogout() {
    if (logoutTimer.current) {
      window.clearTimeout(logoutTimer.current);
    }

    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  useEffect(() => {
    if (!user) return;

    const logoutAfterInactivity = async () => {
      await supabase.auth.signOut();
      navigate({ to: "/" });
    };

    const resetTimer = () => {
      if (logoutTimer.current) {
        window.clearTimeout(logoutTimer.current);
      }

      logoutTimer.current = window.setTimeout(logoutAfterInactivity, INACTIVITY_LIMIT);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];

    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      if (logoutTimer.current) {
        window.clearTimeout(logoutTimer.current);
      }

      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, navigate]);

  return (
    <header className="sticky top-0 z-50 border-b border-gold/30 bg-black">
      <div className="border-b border-gold/20 bg-black">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 md:px-6">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
            {t("header.craftedTag")}
          </p>
        </div>
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <img src="/kaptan-logo.png" alt="KAPTAN" className="h-12 w-12 object-contain" />
          <span className="hidden font-serif text-xl font-bold tracking-[0.15em] text-gold sm:inline-block">
            KAPTAN
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {[
            { label: t("nav.home"), to: "/" },
            { label: t("nav.products"), to: "/products" },
            { label: t("nav.journal"), to: "/journal" },
            { label: t("nav.about"), to: "/about" },
            { label: t("nav.contact"), to: "/contact" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-xs font-medium uppercase tracking-[0.1em] text-gold/80 transition-colors hover:text-gold"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gold/80 transition-colors hover:bg-gold/10 hover:text-gold"
            aria-label={t("nav.search")}
            aria-expanded={searchOpen}
            aria-controls="header-search"
          >
            <Search size={20} />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("accountStyle.preferences")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gold/80 transition-colors hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                <SlidersHorizontal size={18} strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={12}
              className="w-56 rounded-2xl border-gold/20 bg-black p-2 text-white shadow-xl"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-gold/70">
                {t("language.switch")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={language}
                onValueChange={(value) => {
                  if (value === "en" || value === "de") setLanguage(value);
                }}
              >
                <DropdownMenuRadioItem
                  className="rounded-lg py-2.5 focus:bg-gold/10 focus:text-gold"
                  value="en"
                >
                  English
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  className="rounded-lg py-2.5 focus:bg-gold/10 focus:text-gold"
                  value="de"
                >
                  Deutsch
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator className="bg-gold/15" />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-gold/70">
                {t("accountStyle.appearance")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => {
                  if (value === "light" || value === "dark") setTheme(value);
                }}
              >
                <DropdownMenuRadioItem
                  className="gap-2 rounded-lg py-2.5 focus:bg-gold/10 focus:text-gold"
                  value="light"
                >
                  <Sun size={15} />
                  {t("theme.light")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  className="gap-2 rounded-lg py-2.5 focus:bg-gold/10 focus:text-gold"
                  value="dark"
                >
                  <Moon size={15} />
                  {t("theme.dark")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={openCart}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-gold/80 transition-colors hover:text-gold"
            aria-label={t("nav.cart")}
          >
            <ShoppingBag size={20} />
            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-black">
                {totalItems}
              </span>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("nav.account")}
                className="flex h-10 items-center gap-2 rounded-full border border-gold/25 px-3 text-gold transition-colors hover:border-gold/60 hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                <User size={17} strokeWidth={1.5} />
                <span className="hidden text-xs font-medium lg:inline">{t("nav.account")}</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={12}
              className="w-64 rounded-2xl border-gold/20 bg-black p-2 text-white shadow-xl"
            >
              <DropdownMenuLabel className="px-3 py-3">
                <span className="block text-[10px] uppercase tracking-[0.2em] text-gold/70">
                  {t("accountStyle.welcome")}
                </span>
                <span className="mt-1 block truncate font-serif text-lg font-medium">
                  {user ? userName : "KAPTAN"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gold/15" />
              {[
                { to: "/profile", label: t("account.navProfile"), icon: User },
                { to: "/orders", label: t("account.navOrders"), icon: Package },
                { to: "/wishlist", label: t("account.navWishlist"), icon: Heart },
                ...(profile?.role === "admin"
                  ? [{ to: "/admin", label: t("nav.admin"), icon: ShieldCheck }]
                  : []),
              ].map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={to}
                  asChild
                  className="cursor-pointer rounded-lg px-3 py-3 text-white/80 focus:bg-gold/10 focus:text-gold"
                >
                  <Link to={to}>
                    <Icon size={16} strokeWidth={1.5} />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-gold/15" />
              {user ? (
                <DropdownMenuItem
                  onSelect={() => void handleLogout()}
                  className="cursor-pointer rounded-lg px-3 py-3 text-white/60 focus:bg-gold/10 focus:text-gold"
                >
                  <LogOut size={16} />
                  {t("nav.logout")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  asChild
                  className="rounded-lg px-3 py-3 text-gold focus:bg-gold/10 focus:text-gold"
                >
                  <Link to="/auth">
                    <User size={16} />
                    {t("nav.signInRegister")}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1 text-gold lg:hidden"
            aria-label={t("nav.menu")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <form
          id="header-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const q = String(new FormData(event.currentTarget).get("q") ?? "");
            setSearchOpen(false);
            navigate({ to: "/products", search: { q } });
          }}
          className="mx-auto flex max-w-7xl gap-3 border-t border-gold/15 px-4 py-3 md:px-6"
        >
          <input
            autoFocus
            name="q"
            aria-label={t("nav.search")}
            placeholder={t("nav.search")}
            className="min-w-0 flex-1 rounded-lg border border-gold/20 bg-[#1A1A1A] px-4 py-2 text-sm text-white outline-none focus:border-gold"
          />
          <button
            type="submit"
            aria-label={t("nav.search")}
            className="rounded-lg bg-gold px-4 text-black"
          >
            <Search size={18} />
          </button>
        </form>
      )}
      {mobileOpen && (
        <div className="border-t border-gold/20 bg-black px-4 pb-6 pt-4 lg:hidden">
          <nav id="mobile-navigation" className="flex flex-col gap-4">
            {[
              { label: t("nav.home"), to: "/" },
              { label: t("nav.products"), to: "/products" },
              { label: t("nav.journal"), to: "/journal" },
              { label: t("nav.about"), to: "/about" },
              { label: t("nav.contact"), to: "/contact" },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium tracking-wider text-gold/80 transition-colors hover:text-gold"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
