import type { QueryClient } from "@tanstack/react-query";

/** Clear cached patient and financial data before the active account changes. */
export function clearPrivateQueryCacheIfIdentityChanged(
  client: QueryClient,
  previousIdentity: string | null,
  nextIdentity: string | null,
): void {
  if (previousIdentity !== nextIdentity) {
    // Stop in-flight PHI reads before removing their cached results so a late
    // response from the prior session cannot repopulate the shared cache.
    void client.cancelQueries();
    client.clear();
  }
}
