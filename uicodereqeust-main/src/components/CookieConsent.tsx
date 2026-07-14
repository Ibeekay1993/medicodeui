import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the user has already made a choice
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      // Delay slightly for better UX
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = async (type: "all" | "essential") => {
    localStorage.setItem("cookie-consent", type);
    setIsVisible(false);

    // If user is authenticated, log it for compliance
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Log to database
        await supabase.from("consent_logs").insert([{
          user_id: session.user.id,
          action: type === "all" ? "accept_all" : "accept_essential",
          policy_version: "2026-07"
        } as any]);
      }
    } catch (e) {
      console.error("Failed to log consent", e);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-slate-200 bg-white p-4 shadow-xl sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Cookie className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Cookie Preferences</h3>
            <p className="mt-1 text-sm text-slate-600">
              We use cookies to ensure you get the best experience on our platform, particularly for session management and security. 
              By continuing to use this site, you consent to our {" "}
              <Link to="/privacy-policy" className="font-medium text-slate-900 underline hover:text-lime-600">
                Privacy Policy
              </Link>.
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 shrink-0 md:w-auto sm:flex-row">
          <Button 
            variant="outline" 
            className="whitespace-nowrap"
            onClick={() => handleAccept("essential")}
          >
            Essential Only
          </Button>
          <Button 
            className="whitespace-nowrap bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => handleAccept("all")}
          >
            Accept All
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 md:relative md:top-0 md:right-0"
            onClick={() => setIsVisible(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
