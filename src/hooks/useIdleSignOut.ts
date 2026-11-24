import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import i18n from "@/lib/i18n";
import { IDLE_TIMEOUT_MS, idleKey, readActivity, sessionExpired } from "@/lib/session-idle";

export function useIdleSignOut() {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const navigate = useNavigate();
  const id = user?.id;
  const signedInAt = user?.last_sign_in_at;
  useEffect(() => {
    if (!id) return;
    const key = idleKey({ id, last_sign_in_at: signedInAt });
    let last = readActivity(key) || Date.now();
    let written = 0;
    let ended = false;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      try {
        localStorage.setItem(key, String(last));
      } catch {
        /* Private mode. */
      }
    };
    save();
    const expire = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      // Hide private content immediately, even if the sign-out request is slow.
      useAuthStore.getState().logout();
      void client.cancelQueries();
      client.clear();
      void supabase.auth.signOut({ scope: "local" });
      toast.info(i18n.t("auth.idleSignedOut"));
      void navigate({ to: "/auth", replace: true });
    };
    const check = () => {
      if (ended) return;
      last = Math.max(last, readActivity(key));
      if (sessionExpired(last)) {
        expire();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(check, Math.max(1, IDLE_TIMEOUT_MS - (Date.now() - last)));
    };
    const activity = (event: Event) => {
      if (!event.isTrusted || ended) return;
      // An interaction after a sleeping tab's deadline must not revive the session.
      last = Math.max(last, readActivity(key));
      if (sessionExpired(last)) {
        expire();
        return;
      }
      last = Date.now();
      if (last - written >= 500) {
        save();
        written = last;
      }
      check();
    };
    const visibility = () => {
      if (document.hidden) save();
      check();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === key) check();
    };
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((event) =>
      window.addEventListener(event, activity, { passive: true, capture: true }),
    );
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visibility);
    check();
    return () => {
      clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, activity, true));
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, signedInAt, client, navigate]);
}
