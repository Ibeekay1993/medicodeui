import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Default timeout: 15 minutes (900000 ms)
const TIMEOUT_MS = 15 * 60 * 1000;

export function useSessionTimeout() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = async () => {
    if (session) {
      await supabase.auth.signOut();
      toast.error("Session Expired", {
        description: "You have been logged out due to inactivity.",
      });
      navigate("/login", { replace: true });
    }
  };

  const resetTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (session) {
      timeoutRef.current = setTimeout(handleLogout, TIMEOUT_MS);
    }
  };

  useEffect(() => {
    // Only track if logged in
    if (!session) return;

    // Set initial timeout
    resetTimeout();

    // Events that indicate user activity
    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart"
    ];

    const activityHandler = () => {
      resetTimeout();
    };

    // Attach event listeners
    events.forEach((event) => {
      window.addEventListener(event, activityHandler);
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, activityHandler);
      });
    };
  }, [session]);
}
