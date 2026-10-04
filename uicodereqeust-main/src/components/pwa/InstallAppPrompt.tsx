import { useEffect, useState, useCallback } from "react";
import { Download, X, Share2, PlusSquare, Smartphone, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_INSTALLED_KEY = "ronsberger_pwa_installed";
const STORAGE_DISMISSED_UNTIL_KEY = "ronsberger_pwa_dismissed_until";
const SNOOZE_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new CustomEvent("pwa-prompt-ready"));
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(STORAGE_INSTALLED_KEY, "true");
    window.dispatchEvent(new CustomEvent("pwa-installed-success"));
  });
}

export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;
  
  // 1. Check if running in standalone display mode (installed PWA)
  const isStandaloneMode =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes("android-app://");

  if (isStandaloneMode) {
    localStorage.setItem(STORAGE_INSTALLED_KEY, "true");
    return true;
  }

  // 2. Check if previously recorded as installed
  if (localStorage.getItem(STORAGE_INSTALLED_KEY) === "true") {
    return true;
  }

  return false;
}

function isInstallPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const dismissedUntil = localStorage.getItem(STORAGE_DISMISSED_UNTIL_KEY);
  if (!dismissedUntil) return false;
  const expiry = parseInt(dismissedUntil, 10);
  return !isNaN(expiry) && Date.now() < expiry;
}

export function InstallAppPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(globalDeferredPrompt);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    setDeferredPrompt(globalDeferredPrompt);
    if (location.pathname === "/login") {
      setShowBanner(false);
      setShowGuideModal(false);
      return;
    }
    // If running in standalone or already installed, never show banner
    if (isAppInstalled()) {
      setIsStandalone(true);
      return;
    }

    // If user previously dismissed the prompt (within 14 days), do not show
    if (isInstallPromptDismissed()) {
      return;
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isApple);

    // Modern Chrome: Check getInstalledRelatedApps
    if ("getInstalledRelatedApps" in navigator) {
      (navigator as any).getInstalledRelatedApps?.().then((relatedApps: any[]) => {
        if (Array.isArray(relatedApps) && relatedApps.length > 0) {
          localStorage.setItem(STORAGE_INSTALLED_KEY, "true");
          setIsStandalone(true);
          return;
        }
      }).catch(() => {});
    }

    // Show install banner smoothly after 2.5s if not installed and not dismissed
    const timer = window.setTimeout(() => {
      if (!isAppInstalled() && !isInstallPromptDismissed()) {
        setShowBanner(true);
      }
    }, 2500);

    const handlePromptReady = () => {
      setDeferredPrompt(globalDeferredPrompt);
      if (!isAppInstalled() && !isInstallPromptDismissed()) {
        setShowBanner(true);
      }
    };

    const handleInstalled = () => {
      setIsStandalone(true);
      setShowBanner(false);
      setShowGuideModal(false);
    };

    window.addEventListener("pwa-prompt-ready", handlePromptReady);
    window.addEventListener("pwa-installed-success", handleInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pwa-prompt-ready", handlePromptReady);
      window.removeEventListener("pwa-installed-success", handleInstalled);
    };
  }, [location.pathname]);

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          localStorage.setItem(STORAGE_INSTALLED_KEY, "true");
          setShowBanner(false);
          setDeferredPrompt(null);
          globalDeferredPrompt = null;
          return;
        } else {
          // User cancelled native prompt: snooze for 14 days so it doesn't pop up again
          localStorage.setItem(STORAGE_DISMISSED_UNTIL_KEY, (Date.now() + SNOOZE_DURATION_MS).toString());
          setShowBanner(false);
          return;
        }
      } catch (err) {
        console.warn("PWA prompt error:", err);
      }
    }
    // If native prompt wasn't captured or user is on iOS, open the step-by-step visual guide
    setShowGuideModal(true);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    // Persistently snooze dismissal for 14 days in localStorage
    localStorage.setItem(STORAGE_DISMISSED_UNTIL_KEY, (Date.now() + SNOOZE_DURATION_MS).toString());
    setShowBanner(false);
  }, []);

  if (isStandalone || !showBanner) {
    return null;
  }

  return (
    <>
      <aside
        aria-label="Install Ronsberger HMO app"
        className="fixed bottom-16 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-50 bg-slate-900/95 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shrink-0 p-1 shadow-sm">
            <img
              src="/ronsberger-logo.webp"
              alt="Ronsberger HMO"
              className="h-full w-full object-contain"
            />
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <p className="text-xs sm:text-sm font-semibold text-white leading-snug">
              Install Ronsberger Portal App
            </p>
            <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 leading-relaxed">
              Install on your phone or desktop for instant push alerts and fast access.
            </p>

            <div className="flex items-center gap-2 mt-2.5">
              <Button
                size="sm"
                onClick={handleInstallClick}
                className="h-7 px-3 text-xs bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-lg flex items-center gap-1.5 shadow-sm"
              >
                <Download className="h-3.5 w-3.5" />
                Install App
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-7 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
              >
                Dismiss
              </Button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-md transition-colors shrink-0"
            aria-label="Close install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Visual Guide Modal for iOS & Manual Chrome Install */}
      <Dialog open={showGuideModal} onOpenChange={setShowGuideModal}>
        <DialogContent className="sm:max-w-md bg-white text-slate-900 p-6 rounded-2xl">
          <DialogHeader>
            <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center mb-2">
              <Smartphone className="h-6 w-6 text-brand-700" />
            </div>
            <DialogTitle className="text-center text-lg font-bold text-slate-900">
              Install Ronsberger HMO App
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500">
              Follow these quick steps to add the app to your home screen:
            </DialogDescription>
          </DialogHeader>

          {isIOS ? (
            <div className="space-y-3.5 my-2 text-xs sm:text-sm text-slate-700">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="h-7 w-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Tap the Share button</p>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                    At the bottom of Safari, tap the <Share2 className="h-3.5 w-3.5 text-blue-600 inline" /> Share icon.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Select "Add to Home Screen"</p>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                    Scroll down and tap <PlusSquare className="h-3.5 w-3.5 text-emerald-600 inline" /> <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="h-7 w-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Open &amp; Tap "Add"</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Tap Add in the top right. The Ronsberger HMO app is now on your home screen!
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5 my-2 text-xs sm:text-sm text-slate-700">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="h-7 w-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Tap the Browser Menu</p>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                    At the top right of Chrome, tap the <MoreVertical className="h-3.5 w-3.5 text-slate-700 inline" /> (3 dots) menu.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="h-7 w-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Tap "Install App" or "Add to Home screen"</p>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                    Select <Download className="h-3.5 w-3.5 text-brand-700 inline" /> <strong>Install app</strong> from the menu list.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="h-7 w-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Tap "Install"</p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Confirm by tapping Install. The app with the official Ronsberger logo will be added immediately!
                  </p>
                </div>
              </div>
            </div>
          )}

          <Button
            className="w-full bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-xl"
            onClick={() => {
              setShowGuideModal(false);
              localStorage.setItem(STORAGE_DISMISSED_UNTIL_KEY, (Date.now() + SNOOZE_DURATION_MS).toString());
            }}
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SidebarInstallButton() {
  const [installed, setInstalled] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    setInstalled(isAppInstalled());
    const handleInstalled = () => setInstalled(true);
    window.addEventListener("pwa-installed-success", handleInstalled);
    return () => window.removeEventListener("pwa-installed-success", handleInstalled);
  }, []);

  if (installed) return null;

  return (
    <>
      <button
        onClick={() => {
          if (globalDeferredPrompt) {
            globalDeferredPrompt.prompt().catch(() => setShowGuide(true));
          } else {
            setShowGuide(true);
          }
        }}
        className="w-full flex items-center gap-3 px-3 py-2 text-emerald-400 hover:text-white hover:bg-emerald-600/10 rounded-xl text-xs font-medium transition-colors border border-emerald-500/20 my-1"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Install App</span>
      </button>

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="sm:max-w-md bg-white text-slate-900 p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-bold text-slate-900">
              Install Ronsberger HMO App
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-slate-500">
              Tap your browser menu (3 dots ⋮ at top right in Chrome or Share ⎋ in Safari) and select <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong>.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="w-full bg-brand-700 hover:bg-brand-800 text-white font-medium rounded-xl"
            onClick={() => setShowGuide(false)}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
