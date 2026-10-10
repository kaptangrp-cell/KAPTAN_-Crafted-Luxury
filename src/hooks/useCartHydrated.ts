import { useSyncExternalStore } from "react";
import { useCartStore } from "@/stores/cartStore";

function subscribe(notify: () => void) {
  const start = useCartStore.persist.onHydrate(notify);
  const finish = useCartStore.persist.onFinishHydration(notify);
  return () => {
    start();
    finish();
  };
}

/** Keep the server and first browser render consistent while saved items load. */
export function useCartHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => useCartStore.persist.hasHydrated(),
    () => false,
  );
}
