import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import type { Profile } from "@/types";

export function useAuth() {
  const queryClient = useQueryClient();
  const { setUser, setProfile, setLoading, logout } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    async function getInitialSession() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session?.user) {
        setUser(session.user);
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, role, full_name, phone, avatar_url, date_of_birth, email_marketing")
          .eq("id", session.user.id)
          .single();
        if (mounted) setProfile((profile as Profile) ?? null);
      }
      if (mounted) setLoading(false);
    }

    getInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          logout();
          queryClient.clear();
          return;
        }
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          if (session?.user) {
            setUser(session.user);
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, role, full_name, phone, avatar_url, date_of_birth, email_marketing")
              .eq("id", session.user.id)
              .single();
            setProfile((profile as Profile) ?? null);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [setUser, setProfile, setLoading, logout, queryClient]);
}
