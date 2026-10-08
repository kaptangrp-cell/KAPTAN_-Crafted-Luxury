import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { clearAccountCache } from "@/lib/account-cache";
import type { Profile } from "@/types";

export function useAuth() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let mounted = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function applySession(user: User | null) {
      if (!mounted) return;
      const currentRevision = ++revision;
      const store = useAuthStore.getState();
      clearAccountCache(queryClient, store.user?.id, user?.id);
      store.setUser(user);
      if (store.user?.id !== user?.id) store.setLoading(Boolean(user));
      clearTimeout(timer);
      if (!user) {
        store.logout();
        return;
      }
      // Do not await Supabase calls inside its auth callback (auth lock).
      timer = setTimeout(() => {
        void Promise.resolve(
          supabase
            .from("profiles")
            .select(
              "id, role, full_name, phone, avatar_url, date_of_birth, email_marketing, last_payment_method",
            )
            .eq("id", user.id)
            .single(),
        )
          .then(({ data }) => {
            if (!mounted || revision !== currentRevision) return;
            useAuthStore.getState().setProfile((data as Profile) ?? null);
          })
          .catch(() => {
            if (mounted && revision === currentRevision) useAuthStore.getState().setProfile(null);
          })
          .finally(() => {
            if (mounted && revision === currentRevision) useAuthStore.getState().setLoading(false);
          });
      }, 0);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        event === "TOKEN_REFRESHED" &&
        session &&
        session.user.id === useAuthStore.getState().user?.id
      ) {
        useAuthStore.getState().setUser(session.user);
        return;
      }
      applySession(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        window.location.href = "/reset-password";
      }
    });
    const initialRevision = revision;
    void supabase.auth.getSession().then(({ data }) => {
      if (revision === initialRevision) applySession(data.session?.user ?? null);
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [queryClient]);
}
