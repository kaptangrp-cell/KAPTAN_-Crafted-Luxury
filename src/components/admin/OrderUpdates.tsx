import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";

/** Server queries remain authoritative; events invalidate rather than injecting payloads. */
export function OrderUpdates() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of ["admin-stats", "admin-orders", "admin-analytics"])
          void qc.invalidateQueries({ queryKey: [key] });
      }, 250);
    };
    const channel = supabase
      .channel(`admin-orders-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    // Covers reconnects and installations without the realtime publication migration.
    const poll = setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
  return null;
}
