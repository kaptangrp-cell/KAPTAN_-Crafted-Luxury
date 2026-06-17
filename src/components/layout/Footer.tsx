import { Link } from "@tanstack/react-router";
import { Instagram, Facebook } from "lucide-react";
import { useTranslation } from "react-i18next";

function TikTokIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.5a8.16 8.16 0 0 0 4.77 1.52V6.5a4.85 4.85 0 0 1-1.84-.31z" />
    </svg>
  );
}

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-gold/20 bg-black">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <img
                src="/__l5e/assets-v1/a07138a0-0d59-4521-91be-2e8e2eb793fc/kaptan-logo.png"
                alt="KAPTAN"
                className="h-8 w-8 object-contain"
              />
              <span className="font-serif text-lg font-bold tracking-widest text-gold">
                KAPTAN
              </span>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-white/70">{t("footer.tagline")}</p>
            <div className="flex items-center gap-4">
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-gold transition-colors hover:text-gold-vivid">
                <Instagram size={20} />
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-gold transition-colors hover:text-gold-vivid">
                <Facebook size={20} />
              </a>
              <a href="https://www.tiktok.com/@kaptan" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="text-gold transition-colors hover:text-gold-vivid">
                <TikTokIcon size={20} />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h4 className="mb-4 font-serif text-sm font-semibold uppercase tracking-wider text-gold">
              {t("footer.shop")}
            </h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link to="/products" className="transition-colors hover:text-gold">{t("footer.allProducts")}</Link></li>
              <li><Link to="/products" search={{ category: "leather-wallets" }} className="transition-colors hover:text-gold">{t("footer.leatherWallets")}</Link></li>
              <li><Link to="/products" search={{ category: "leather-bags" }} className="transition-colors hover:text-gold">{t("footer.leatherBags")}</Link></li>
              <li><Link to="/products" search={{ category: "salt-lamp-natural" }} className="transition-colors hover:text-gold">{t("footer.saltLamps")}</Link></li>
              <li><Link to="/products" search={{ category: "gift-sets" }} className="transition-colors hover:text-gold">{t("footer.giftSets")}</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="mb-4 font-serif text-sm font-semibold uppercase tracking-wider text-gold">
              {t("footer.company")}
            </h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link to="/about" className="transition-colors hover:text-gold">{t("footer.aboutUs")}</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-gold">{t("footer.contact")}</Link></li>
              <li><Link to="/faq" className="transition-colors hover:text-gold">{t("footer.faq")}</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="mb-4 font-serif text-sm font-semibold uppercase tracking-wider text-gold">
              {t("footer.support")}
            </h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li><Link to="/shipping" className="transition-colors hover:text-gold">{t("footer.shipping")}</Link></li>
              <li><Link to="/returns" className="transition-colors hover:text-gold">{t("footer.returns")}</Link></li>
              <li><Link to="/privacy" className="transition-colors hover:text-gold">{t("footer.privacy")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gold/10 pt-6 text-center text-xs text-white/40">
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
