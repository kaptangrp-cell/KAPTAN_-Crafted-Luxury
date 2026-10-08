import { createFileRoute, Outlet, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isLoading } = useAuthStore();
  const { t } = useTranslation();
  if (isLoading)
    return (
      <p role="status" className="p-8">
        {t("account.loading")}
      </p>
    );
  if (!user)
    return (
      <Link to="/auth" className="p-8">
        {t("auth.signIn")}
      </Link>
    );
  return <Outlet key={user.id} />;
}
