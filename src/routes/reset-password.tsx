import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { PageLayout } from "@/components/layout/PageLayout";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — KAPTAN" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function prepareRecoverySession() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;

          window.history.replaceState({}, document.title, "/reset-password");
        }

        const { data } = await supabase.auth.getSession();

        if (data.session) {
          setReady(true);
        } else {
          toast.error(t("resetPassword.invalidExpiredToast"));
          setReady(false);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("resetPassword.couldNotOpenToast"));
        setReady(false);
      } finally {
        setChecking(false);
      }
    }

    prepareRecoverySession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 6) {
      toast.error(t("resetPassword.tooShortToast"));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("resetPassword.mismatchToast"));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast.success(t("resetPassword.updatedToast"));
      await supabase.auth.signOut();
      navigate({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("resetPassword.resetFailedToast"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageLayout>
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16">
        <h1 className="font-serif text-3xl font-semibold text-white">{t("resetPassword.title")}</h1>

        {checking ? (
          <p className="mt-6 text-sm text-white/60">{t("resetPassword.checkingLink")}</p>
        ) : !ready ? (
          <div className="mt-8 w-full text-center">
            <p className="text-sm text-white/60">
              {t("resetPassword.invalidLinkBody")}
            </p>
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="mt-6 w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black"
            >
              {t("resetPassword.requestNewLink")}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-center text-sm text-white/60">
              {t("resetPassword.enterNewPasswordBody")}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                  {t("resetPassword.newPasswordLabel")}
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gold/30 bg-black px-3 py-2.5 text-white outline-none focus:border-gold"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-gold/70">
                  {t("resetPassword.confirmPasswordLabel")}
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gold/30 bg-black px-3 py-2.5 text-white outline-none focus:border-gold"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold py-3 text-sm font-bold uppercase tracking-wider text-black transition-colors hover:bg-gold-vivid disabled:opacity-50"
              >
                {loading ? t("resetPassword.updating") : t("resetPassword.updatePassword")}
              </button>
            </form>
          </>
        )}
      </div>
    </PageLayout>
  );
}