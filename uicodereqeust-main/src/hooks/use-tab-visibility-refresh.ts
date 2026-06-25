import { useEffect, useRef } from "react";

/**
 * Hook to silently refresh data when tab becomes visible or window is focused.
 * Uses a cooldown to ensure we only refresh if the user was away for a certain time,
 * and a throttle to prevent spamming when toggling tabs rapidly.
 * 
 * @param onRefresh - The function to call to refresh the data.
 * @param enabled - Whether the hook is active (default: true).
 * @param cooldownMs - Minimum time (in ms) the user must have been away/inactive before a refresh is triggered (default: 5 minutes).
 * @param throttleMs - Minimum time (in ms) between consecutive refreshes (default: 30 seconds).
 */
export function useTabVisibilityRefresh(
  onRefresh: (force?: boolean) => void,
  enabled = true,
  cooldownMs = 5 * 60 * 1000,
  throttleMs = 30000
) {
  const lastRefreshedAt = useRef(0);
  const lastAwayAt = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    const handleRefresh = (force = false) => {
      const now = Date.now();

      // Apply throttle check
      if (!force && now - lastRefreshedAt.current < throttleMs) {
        return;
      }

      lastRefreshedAt.current = now;
      onRefresh(force);
    };

    const triggerRefreshOnReturn = () => {
      const now = Date.now();
      // Only refresh if we've been away longer than the cooldown period
      if (now - lastAwayAt.current >= cooldownMs) {
        handleRefresh(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastAwayAt.current = Date.now();
      } else {
        triggerRefreshOnReturn();
      }
    };

    const handleFocus = () => {
      triggerRefreshOnReturn();
    };

    const handleBlur = () => {
      lastAwayAt.current = Date.now();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    // Initial load: record the start time
    lastRefreshedAt.current = Date.now();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onRefresh, enabled, cooldownMs, throttleMs]);
}