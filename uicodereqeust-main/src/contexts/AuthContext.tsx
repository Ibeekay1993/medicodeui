import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  fullName: string | null;
  hospitalId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const resetSubmitStorageKey = "ronsberger-reset-submitting";
const lastActivityStorageKey = "ronsberger-last-activity-at";
const sessionStartStorageKey = "ronsberger-session-started-at";
const sessionInactivityTimeoutByRole: Partial<Record<AppRole, number>> = {
  admin: 5 * 60 * 1000,
  utilization_manager: 10 * 60 * 1000,
  hospital: 10 * 60 * 1000,
  claims: 10 * 60 * 1000,
  finance: 10 * 60 * 1000,
};
const defaultSessionInactivityTimeout = 10 * 60 * 1000;
const maxSessionLifetime = 4 * 60 * 60 * 1000;

function getJwtSubject(token: string) {
  try {
    const [, payload] = token.split(".");
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = window.atob(normalizedPayload);
    const parsedPayload = JSON.parse(decodedPayload) as { sub?: string };
    return parsedPayload.sub || "";
  } catch {
    return "";
  }
}

function isResetPasswordRecoverySession(session: Session | null) {
  if (typeof window === "undefined") return false;

  const hash = window.location.hash || "";
  const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const searchParams = new URLSearchParams(window.location.search);
  const type = hashParams.get("type") || searchParams.get("type") || "";

  // If this is an invitation or signup session, it is NOT a recovery session
  if (type === "invite" || type === "signup" || window.location.pathname.includes("/register")) {
    return false;
  }

  const recoveryAccessToken = hashParams.get("access_token") || searchParams.get("access_token") || "";
  if (!recoveryAccessToken || !session) return false;

  return getJwtSubject(recoveryAccessToken) === session.user.id;
}

function getSessionInactivityTimeout(role: AppRole | null) {
  return sessionInactivityTimeoutByRole[role as AppRole] || defaultSessionInactivityTimeout;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function resolveUserRole(user: User): Promise<{ role: AppRole | null; fullName: string | null; hospitalId: string | null }> {
  return (async () => {
    const fallbackName = (user.user_metadata as any)?.full_name || user.email || null;

    try {
      const { data: userRoleRow, error: userRoleError } = await supabase
        .from("user_roles")
        .select("role, full_name, hospital_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (userRoleError) throw userRoleError;
      if (userRoleRow?.role) {
        return {
          role: userRoleRow.role as AppRole,
          fullName: (userRoleRow.full_name as string) || fallbackName,
          hospitalId: userRoleRow.hospital_id,
        };
      }

      const { data: healed, error: healError } = await (supabase.rpc as any)("heal_hospital_user_link", {
        p_user_id: user.id,
        p_email: user.email,
      });

      if (!healError && Array.isArray(healed) && healed[0]?.out_role) {
        // Since healed does not return hospital_id in the RPC signature, we will query it in the retry step below.
      }

      const { data: retryRow, error: retryError } = await supabase
        .from("user_roles")
        .select("role, full_name, hospital_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (retryError) throw retryError;
      if (retryRow?.role) {
        return {
          role: retryRow.role as AppRole,
          fullName: (retryRow.full_name as string) || fallbackName,
          hospitalId: retryRow.hospital_id,
        };
      }
    } catch (error) {
      console.error("AuthContext: failed to resolve user role", error);
    }

    return { role: null, fullName: fallbackName, hospitalId: null };
  })();
}

function useAuthContextValue(session: Session | null, user: User | null, role: AppRole | null, fullName: string | null, hospitalId: string | null, loading: boolean, signOut: () => Promise<void>, refreshProfile: () => Promise<void>) {
  return useMemo(
    () => ({ session, user, role, fullName, hospitalId, loading, signOut, refreshProfile }),
    [session, user, role, fullName, hospitalId, loading, signOut, refreshProfile]
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mountedRef = useRef(true);
  const prevTokenRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const maxLifetimeTimerRef = useRef<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const handleSession = useCallback(async (nextSession: Session | null, silent = false) => {
    if (!mountedRef.current) return;
    if (!silent) setLoading(true);

    if (!nextSession || !nextSession.user) {
      setSession(null);
      setUser(null);
      userIdRef.current = null;
      setRole(null);
      setFullName(null);
      setHospitalId(null);
      if (!silent) setLoading(false);
      return;
    }

    setSession(nextSession);
    setUser(nextSession.user);
    userIdRef.current = nextSession.user.id;

    const { role: resolvedRole, fullName: resolvedFullName, hospitalId: resolvedHospitalId } = await resolveUserRole(nextSession.user);

    if (!mountedRef.current) return;

    // Check session expiry on load before activating the user role
    const now = Date.now();
    const lastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || now);
    const startedAt = Number(window.sessionStorage.getItem(sessionStartStorageKey) || now);
    const inactivityTimeout = sessionInactivityTimeoutByRole[resolvedRole as AppRole] || defaultSessionInactivityTimeout;

    if (now - lastActivity >= inactivityTimeout || now - startedAt >= maxSessionLifetime) {
      console.log("handleSession: Session expired on mount. Performing local sign out.");
      setSession(null);
      setUser(null);
      userIdRef.current = null;
      setRole(null);
      setFullName(null);
      setHospitalId(null);
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (err) {
        console.error("handleSession signOut failed", err);
      }
      if (!silent) setLoading(false);
      return;
    }

    setRole(resolvedRole);
    setFullName(resolvedFullName);
    setHospitalId(resolvedHospitalId || null);
    if (!silent) setLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await handleSession(data.session, true);
  }, [handleSession]);

  const signOut = useCallback(async () => {
    try {
      handleSession(null);
      await supabase.auth.signOut();
    } catch (error) {
      console.error("AuthContext signOut failed", error);
    }
  }, [handleSession]);

  const signOutForInactivity = useCallback(async () => {
    if (!session) return;

    try {
      handleSession(null);
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.error("AuthContext idle signOut failed", error);
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }, [session, handleSession]);

  useEffect(() => {
    if (typeof window === "undefined" || !session || !role) {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      if (maxLifetimeTimerRef.current) window.clearTimeout(maxLifetimeTimerRef.current);
      inactivityTimerRef.current = null;
      maxLifetimeTimerRef.current = null;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(lastActivityStorageKey);
        window.sessionStorage.removeItem(sessionStartStorageKey);
      }
      return;
    }

    const clearTimers = () => {
      if (inactivityTimerRef.current) window.clearTimeout(inactivityTimerRef.current);
      if (maxLifetimeTimerRef.current) window.clearTimeout(maxLifetimeTimerRef.current);
      inactivityTimerRef.current = null;
      maxLifetimeTimerRef.current = null;
    };

    const now = Date.now();
    const startedAt = Number(window.sessionStorage.getItem(sessionStartStorageKey) || now);
    if (!window.sessionStorage.getItem(sessionStartStorageKey)) {
      window.sessionStorage.setItem(sessionStartStorageKey, String(now));
    }

    if (!window.localStorage.getItem(lastActivityStorageKey)) {
      window.localStorage.setItem(lastActivityStorageKey, String(now));
    }

    const checkSessionExpiry = () => {
      const currentLastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || Date.now());
      const inactivityTimeout = getSessionInactivityTimeout(role);
      
      if (Date.now() - currentLastActivity >= inactivityTimeout || Date.now() - startedAt >= maxSessionLifetime) {
        signOutForInactivity();
        return true;
      }
      return false;
    };

    const scheduleTimeouts = () => {
      clearTimers();

      const currentLastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || Date.now());
      const inactivityTimeout = getSessionInactivityTimeout(role);
      const inactivityRemaining = Math.max(0, inactivityTimeout - (Date.now() - currentLastActivity));

      inactivityTimerRef.current = window.setTimeout(() => {
        const lastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || Date.now());
        if (Date.now() - lastActivity >= inactivityTimeout) {
          signOutForInactivity();
        } else {
          scheduleTimeouts();
        }
      }, inactivityRemaining);

      const maxLifetimeRemaining = Math.max(0, maxSessionLifetime - (Date.now() - startedAt));
      maxLifetimeTimerRef.current = window.setTimeout(() => {
        signOutForInactivity();
      }, maxLifetimeRemaining);
    };

    let lastActivityUpdate = 0;
    const updateActivity = () => {
      const now = Date.now();
      if (now - lastActivityUpdate < 2000) return; // Throttle to prevent flooding event loop on scroll/touch
      lastActivityUpdate = now;

      if (checkSessionExpiry()) return;
      window.localStorage.setItem(lastActivityStorageKey, String(now));
      scheduleTimeouts();
    };

    const handleStorageActivity = (event: StorageEvent) => {
      if (event.key === lastActivityStorageKey) {
        if (checkSessionExpiry()) return;
        scheduleTimeouts();
      }
    };

    const handleFocus = () => {
      if (!checkSessionExpiry()) {
        scheduleTimeouts();
      }
    };

    // Run immediately on mount
    if (checkSessionExpiry()) return;

    const activityEvents = ["mousemove", "keydown", "mousedown", "touchstart", "click"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, updateActivity, { passive: true, capture: true }));
    window.addEventListener("storage", handleStorageActivity);
    window.addEventListener("visibilitychange", handleFocus);
    window.addEventListener("focus", handleFocus);

    // Fallback interval check for mobile sleep/wake cycles where visibilitychange/focus events are frequently skipped
    const checkIntervalId = window.setInterval(() => {
      checkSessionExpiry();
    }, 5000);

    scheduleTimeouts();

    return () => {
      clearTimers();
      window.clearInterval(checkIntervalId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, updateActivity, true));
      window.removeEventListener("storage", handleStorageActivity);
      window.removeEventListener("visibilitychange", handleFocus);
      window.removeEventListener("focus", handleFocus);
    };
  }, [session, role, signOutForInactivity]);

  useEffect(() => {
    mountedRef.current = true;

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (!mountedRef.current) return;
      if (initialSession?.access_token) {
        prevTokenRef.current = initialSession.access_token;
      }

      if (isResetPasswordRecoverySession(initialSession) && window.sessionStorage.getItem(resetSubmitStorageKey) !== "true") {
        supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        handleSession(null);
        return;
      }

      handleSession(initialSession);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mountedRef.current) return;

      if (event === "SIGNED_IN" && isResetPasswordRecoverySession(nextSession) && window.sessionStorage.getItem(resetSubmitStorageKey) !== "true") {
        supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        handleSession(null, false);
        return;
      }

      if (event === "SIGNED_IN") {
        const newToken = nextSession?.access_token;
        const currentUserId = userIdRef.current;
        const nextUserId = nextSession?.user?.id;
        const isSameUser = currentUserId && nextUserId && currentUserId === nextUserId;

        if (isSameUser) {
          // Token refreshed in another tab or storage updated for the same user.
          // Silently update session to avoid unmounting ProtectedRoutes and showing PageLoader.
          if (newToken && newToken !== prevTokenRef.current) {
            prevTokenRef.current = newToken;
            handleSession(nextSession, true);
          }
        } else {
          if (newToken) {
            prevTokenRef.current = newToken;
          }
          handleSession(nextSession, false);
        }
      }

      if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        const newToken = nextSession?.access_token;
        if (newToken) {
          prevTokenRef.current = newToken;
        } else {
          prevTokenRef.current = null;
        }
        handleSession(nextSession, false);
      }

      if (event === "TOKEN_REFRESHED") {
        const newToken = nextSession?.access_token;
        if (newToken && newToken !== prevTokenRef.current) {
          prevTokenRef.current = newToken;
          handleSession(nextSession, true);
        }
      }
    });

    return () => {
      mountedRef.current = false;
      subscription?.unsubscribe();
    };
  }, [handleSession]);

  useEffect(() => {
    if (!user) return;

    console.log("AuthProvider: Subscribing to user_roles updates for user:", user.id);
    const channel = supabase
      .channel(`user-role-change-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_roles",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log("AuthProvider: Realtime user_role row updated:", payload.new);
          const updated = payload.new as any;
          if (updated) {
            setRole(updated.role as AppRole);
            setFullName(updated.full_name);
            setHospitalId(updated.hospital_id);
            
            if (updated.access_status === "inactive" || updated.access_status === "suspended") {
              signOut();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, signOut]);

  const value = useAuthContextValue(session, user, role, fullName, hospitalId, loading, signOut, refreshProfile);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

