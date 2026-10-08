import type { QueryClient } from "@tanstack/react-query";

export function clearAccountCache(client: QueryClient, previous?: string, next?: string) {
  if (previous === next) return;
  // Cancellation stops old in-flight responses from repopulating the active cache.
  void client.cancelQueries();
  client.clear();
}
