import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Heart, ShoppingBag, Menu, X, User, Sun, Moon, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useCartStore } from "@/stores/cartStore";
import { usePreferencesStore } from "@/stores/preferencesStore";

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile } = useAuthStore();
  const { openCart } = useUIStore();
  const totalItems = useCartStore((s) => s.totalItems());
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme, toggleTheme, language, setLanguage } = usePreferencesStore();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const nextLang = language === "en" ? "de" : "en";

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
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img
            src="/__l5e/assets-v1/a07138a0-0d59-4521-91be-2e8e2eb793fc/kaptan-logo.png"
            alt="KAPTAN"
            className="h-10 w-10 object-contain"
          />
          <span className="hidden font-serif text-xl font-bold tracking-[0.15em] text-gold sm:inline-block">
            KAPTAN
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {[
            { label: t("nav.home"), to: "/" },
            { label: t("nav.products"), to: "/products" },
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

        {/* Right Actions */}
        <div className="flex items-center gap-2 md:gap-3">
          {searchOpen && (
            <input
              autoFocus
              type="text"
              placeholder={t("nav.search")}
              className="hidden w-40 border-b border-gold bg-transparent py-1 text-sm text-white outline-none placeholder:text-gold/40 md:block"
              onBlur={() => setSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const q = (e.target as HTMLInputElement).value;
                  setSearchOpen(false);
                  navigate({ to: "/products", search: { q } });
                }
              }}
            />
          )}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="p-1 text-gold/80 transition-colors hover:text-gold md:hidden"
            aria-label={t("nav.search")}
          >
            <Search size={20} />
          </button>

          {/* Language toggle */}
          <button
            onClick={() => setLanguage(nextLang)}
            className="hidden items-center gap-1 p-1 text-xs font-semibold uppercase text-gold/80 transition-colors hover:text-gold sm:flex"
            aria-label={t("language.switch")}
            title={t("language.switch")}
          >
            <Globe size={16} />
            <span>{language.toUpperCase()}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1 text-gold/80 transition-colors hover:text-gold"
            aria-label={theme === "dark" ? t("theme.light") : t("theme.dark")}
            title={theme === "dark" ? t("theme.light") : t("theme.dark")}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <Link
            to="/wishlist"
            className="hidden p-1 text-gold/80 transition-colors hover:text-gold md:block"
            aria-label={t("nav.wishlist")}
          >
            <Heart size={20} />
          </Link>
          <button
            onClick={openCart}
            className="relative p-1 text-gold/80 transition-colors hover:text-gold"
            aria-label={t("nav.cart")}
          >
            <ShoppingBag size={20} />
            {totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-black">
                {totalItems}
              </span>
            )}
          </button>

          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              {profile?.role === "admin" && (
                <Link to="/admin" className="text-xs font-medium uppercase tracking-wider text-gold/90 hover:text-gold">
                  {t("nav.admin")}
                </Link>
              )}
              <Link
                to="/profile"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 text-gold"
                aria-label={t("nav.account")}
              >
                <User size={16} />
              </Link>
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-gold/80 hover:text-gold"
              >
                {t("nav.logout")}
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="hidden rounded-none border border-gold px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-gold hover:text-black md:inline-block"
            >
              {t("nav.signIn")}
            </Link>
          )}

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1 text-gold md:hidden"
            aria-label={t("nav.menu")}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="border-t border-gold/20 bg-black px-4 pb-6 pt-4 md:hidden">
          <nav className="flex flex-col gap-4">
            {[
              { label: t("nav.home"), to: "/" },
              { label: t("nav.products"), to: "/products" },
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
            <button
              onClick={() => setLanguage(nextLang)}
              className="flex items-center gap-2 text-sm font-medium text-gold/80 hover:text-gold"
            >
              <Globe size={16} /> {language === "en" ? t("language.de") : t("language.en")}
            </button>
            {!user && (
              <Link
                to="/auth"
                onClick={() => setMobileOpen(false)}
                className="mt-2 inline-block w-fit border border-gold px-4 py-2 text-sm font-semibold text-gold"
              >
                {t("nav.signInRegister")}
              </Link>
            )}
            {user && (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  handleLogout();
                }}
                className="text-left text-sm font-medium text-gold/80 hover:text-gold"
              >
                {t("nav.logout")}
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
