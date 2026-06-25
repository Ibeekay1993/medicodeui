import { useEffect } from "react";

const BUILD_META_KEY = "ronsberger-build-id";
const RELOAD_COUNT_KEY = "ronsberger-build-reload-count";

export function DeployVersionWatcher() {
  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      try {
        const response = await fetch("/build-meta.json", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok || cancelled) return;

        const meta = await response.json() as { buildId?: string };
        if (!meta.buildId) return;

        const storedBuildId = sessionStorage.getItem(BUILD_META_KEY);

        if (!storedBuildId) {
          sessionStorage.setItem(BUILD_META_KEY, meta.buildId);
          return;
        }

        if (storedBuildId !== meta.buildId) {
          const reloadCount = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || "0");

          if (reloadCount < 3) {
            sessionStorage.setItem(RELOAD_COUNT_KEY, String(reloadCount + 1));
            window.location.reload();
          }
        }
      } catch (error) {
        console.warn("Ronsberger HMO: version check failed.", error);
      }
    };

    checkVersion();

    const interval = window.setInterval(checkVersion, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
