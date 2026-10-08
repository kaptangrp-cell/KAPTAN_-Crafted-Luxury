import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { supabase } from "@/integrations/supabase/client";
import { completeGoogleSignIn } from "@/lib/google-auth";

export const Route = createFileRoute("/auth_/callback")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Google Sign In — KAPTAN" }, { name: "robots", content: "noindex" }],
  }),
  component: GoogleCallbackPage,
});

function GoogleCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void completeGoogleSignIn(supabase.auth, window.location.href)
      .then(() => {
        if (active) void navigate({ to: "/", replace: true });
      })
      .catch(() => {
        if (!active) return;
        // Remove provider parameters without displaying tokens or raw errors.
        window.history.replaceState(window.history.state, "", "/auth/callback");
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <PageLayout>
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-3xl text-white">{t("auth.continueWithGoogle")}</h1>
        <p className="mt-6 text-white/70" role={failed ? "alert" : "status"}>
          {t(failed ? "auth.googleSignInFailedToast" : "auth.pleaseWait")}
        </p>
        {failed && (
          <Link to="/auth" className="mt-6 inline-block bg-gold px-6 py-3 font-semibold text-black">
            {t("auth.backToSignIn")}
          </Link>
        )}
      </div>
    </PageLayout>
  );
}
