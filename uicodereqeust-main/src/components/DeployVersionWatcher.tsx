import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const BUILD_META_KEY = "ronsberger-build-id";
const RELOAD_COUNT_KEY = "ronsberger-build-reload-count";

export function DeployVersionWatcher() {
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    // ── 1. Build-meta polling (detects new deploy while tab is open) ──
    const checkVersion = async () => {
      try {
        const response = await fetch("/build-meta.json", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
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
          sessionStorage.setItem(BUILD_META_KEY, meta.buildId);
          sessionStorage.removeItem(RELOAD_COUNT_KEY);
          window.location.reload();
        }
      } catch (error) {
        console.warn("Ronsberger HMO: version check failed.", error);
      }
    };

    checkVersion();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = window.setInterval(checkVersion, 30_000);

    // ── 2. Service Worker update banner ──
    // Fires when index.html detects a new SW in 'installed' (waiting) state
    const handleSwUpdate = (event: Event) => {
      if (cancelled) return;
      const registration = (event as CustomEvent).detail as ServiceWorkerRegistration;

      toast({
        title: "Update Available ✨",
        description: "A new version of the portal is ready.",
        duration: 0, // Keep until user acts
        action: (
          <button
            className="rounded bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800 transition-colors"
            onClick={() => {
              if (registration.waiting) {
                registration.waiting.postMessage({ type: "SKIP_WAITING" });
              } else {
                window.location.reload();
              }
            }}
          >
            Update Now
          </button>
        ) as unknown as React.ReactElement,
      });
    };

    window.addEventListener("sw-update-available", handleSwUpdate);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
      window.removeEventListener("sw-update-available", handleSwUpdate);
    };
  }, [toast]);

  return null;
}
