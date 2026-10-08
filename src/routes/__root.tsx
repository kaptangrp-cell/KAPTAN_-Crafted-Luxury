import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useCartStore } from "@/stores/cartStore";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import i18n from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { logVisit } from "@/lib/analytics.functions";

import appCss from "../styles.css?url";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "KAPTAN",
  url: "https://kaptangrp.com",
  logo: "https://kaptangrp.com/kaptan-logo.png",
  description: "Quality leather accessories and home lighting. Everyday elegance, lasting style.",
  email: "contact@kaptangrp.com",
  telephone: "+491757134333",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Marburg",
    addressCountry: "DE",
  },
  sameAs: [
    import.meta.env.VITE_INSTAGRAM_URL,
    import.meta.env.VITE_FACEBOOK_URL,
    import.meta.env.VITE_TIKTOK_URL,
  ].filter(Boolean),
};
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 font-serif text-xl font-semibold text-foreground">
          {t("common.notFound")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.notFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  console.error(error);
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("common.loadFailed")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.loadFailedBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("common.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center border border-input bg-background px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            {t("common.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "KAPTAN — Everyday Elegance. Lasting Style." },
      {
        name: "description",
        content: "Quality leather accessories and home lighting. Everyday elegance, lasting style.",
      },
      { property: "og:title", content: "KAPTAN — Everyday Elegance. Lasting Style." },
      {
        property: "og:description",
        content: "Quality leather accessories and home lighting. Everyday elegance, lasting style.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@kaptan.store" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Scripts />
      </body>
    </html>
  );
}

function AuthLifecycle() {
  useAuth();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const logVisitFn = useServerFn(logVisit);

  useEffect(() => {
    void useCartStore.persist.rehydrate();
    usePreferencesStore.persist.rehydrate()?.then(() => {
      const { theme, language } = usePreferencesStore.getState();
      document.documentElement.classList.toggle("light", theme === "light");
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.lang = language;
      if (i18n.language !== language) i18n.changeLanguage(language);
      usePreferencesStore.setState({ hasHydrated: true });
    });
  }, []);

  // Log one visit per browser session (not per pageview) so the admin
  // dashboard can compute conversion rate = orders / visits. Fire-and-forget;
  // never blocks rendering and never surfaces errors to the shopper.
  useEffect(() => {
    const FLAG = "kaptan_visit_logged";

    if (sessionStorage.getItem(FLAG)) return;

    let sessionId = localStorage.getItem("kaptan_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("kaptan_session_id", sessionId);
    }

    sessionStorage.setItem(FLAG, "1");

    logVisitFn({
      data: {
        sessionId,
        path: window.location.pathname,
        referrer: document.referrer || undefined,
      },
    }).catch(() => {
      // Analytics is best-effort — silently ignore failures.
    });
  }, [logVisitFn]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthLifecycle />
      <Outlet />

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1A1A1A",
            color: "#FFFFFF",
            border: "1px solid #C9A22740",
          },
        }}
      />

      <Analytics />
      <SpeedInsights />
      <WhatsAppButton />
    </QueryClientProvider>
  );
}
