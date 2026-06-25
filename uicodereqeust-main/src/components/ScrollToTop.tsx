import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = `ronsberger-scroll:${pathname}`;
    const storedScroll = Number(window.sessionStorage.getItem(storageKey));
    const restorePosition = Number.isFinite(storedScroll) && storedScroll > 0 ? storedScroll : 0;

    window.requestAnimationFrame(() => {
      window.scrollTo(0, restorePosition);
    });

    let rafId = 0;
    const persistScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        try {
          window.sessionStorage.setItem(storageKey, String(window.scrollY || window.pageYOffset || 0));
        } catch {
          // Ignore storage failures silently.
        }
      });
    };

    window.addEventListener("scroll", persistScroll, { passive: true });
    window.addEventListener("pagehide", persistScroll);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      persistScroll();
      window.removeEventListener("scroll", persistScroll);
      window.removeEventListener("pagehide", persistScroll);
    };
  }, [pathname]);

  return null;
}
