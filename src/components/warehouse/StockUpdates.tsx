import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export function StockUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const key of [
          "products",
          "product",
          "related-products",
          "recently-viewed",
          "catalog-colors",
        ])
          void qc.invalidateQueries({ queryKey: [key] });
      }, 250);
    };
    const channel = supabase
      .channel("public-stock")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, refresh)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "product_variants" },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    const poll = setInterval(refresh, 30000);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
  return null;
}
