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
  admin: 5 * 60 * 60 * 1000, // 5 hours
  utilization_manager: 5 * 60 * 60 * 1000, // 5 hours
  utilization_manager_lead: 5 * 60 * 60 * 1000, // 5 hours
  hospital: 2 * 60 * 60 * 1000, // 2 hours
  claims: 5 * 60 * 60 * 1000, // 5 hours
  finance: 5 * 60 * 60 * 1000, // 5 hours
};
const defaultSessionInactivityTimeout = 2 * 60 * 60 * 1000;
const maxSessionLifetime = 10 * 60 * 60 * 1000; // 10 hours max continuous session lifetime
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(
        () => reject(new Error("Authentication service did not respond in time.")),
        AUTH_REQUEST_TIMEOUT_MS,
      ),
    ),
  ]);
}

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

type ResolvedUserRole = {
  role: AppRole | null;
  fullName: string | null;
  hospitalId: string | null;
  accessStatus: string | null;
};

function resolveUserRole(user: User, touchLastSignIn = true): Promise<ResolvedUserRole> {
  return (async () => {
    const fallbackName = (user.user_metadata as any)?.full_name || user.email || null;

    try {
      const { data: userRoleRow, error: userRoleError } = await supabase
        .from("user_roles")
        .select("role, full_name, hospital_id, access_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (userRoleError) throw userRoleError;
      if (userRoleRow?.role) {
        if (touchLastSignIn) {
          void supabase
            .from("user_roles")
            .update({ last_sign_in: new Date().toISOString() } as any)
            .eq("user_id", user.id);
        }

        return {
          role: userRoleRow.access_status === "active" ? userRoleRow.role as AppRole : null,
          fullName: (userRoleRow.full_name as string) || fallbackName,
          hospitalId: userRoleRow.hospital_id,
          accessStatus: userRoleRow.access_status || null,
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
        .select("role, full_name, hospital_id, access_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (retryError) throw retryError;
      if (retryRow?.role) {
        return {
          role: retryRow.access_status === "active" ? retryRow.role as AppRole : null,
          fullName: (retryRow.full_name as string) || fallbackName,
          hospitalId: retryRow.hospital_id,
          accessStatus: retryRow.access_status || null,
        };
      }
    } catch (error) {
      console.error("AuthContext: failed to resolve user role", error);
    }

    return { role: null, fullName: fallbackName, hospitalId: null, accessStatus: null };
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
  const roleRef = useRef<AppRole | null>(null);
  const hospitalIdRef = useRef<string | null>(null);
  const fullNameRef = useRef<string | null>(null);

  const handleSession = useCallback(async (nextSession: Session | null, silent = false) => {
    if (!mountedRef.current) return;
    if (!silent) setLoading(true);

    if (!nextSession || !nextSession.user) {
      setSession(null);
      setUser(null);
      userIdRef.current = null;
      roleRef.current = null;
      hospitalIdRef.current = null;
      fullNameRef.current = null;
      setRole(null);
      setFullName(null);
      setHospitalId(null);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(lastActivityStorageKey);
        window.sessionStorage.removeItem(sessionStartStorageKey);
      }
      if (!silent) setLoading(false);
      return;
    }

    const currentUserId = nextSession.user.id;
    const sameUser = userIdRef.current === currentUserId;
    const cachedRole = (window.sessionStorage.getItem("ronsberger-role-" + currentUserId) as AppRole) || null;
    const cachedHospitalId = window.sessionStorage.getItem("ronsberger-hosp-" + currentUserId) || null;
    const cachedFullName = window.sessionStorage.getItem("ronsberger-name-" + currentUserId) || null;
    const immediateRole = (sameUser ? roleRef.current : null) || cachedRole;
    const immediateHospitalId = (sameUser ? hospitalIdRef.current : null) || cachedHospitalId;
    const immediateFullName = (sameUser ? fullNameRef.current : null) || cachedFullName ||
      (nextSession.user.user_metadata as any)?.full_name || nextSession.user.email || null;

    setSession(nextSession);
    setUser(nextSession.user);
    userIdRef.current = currentUserId;

    // A cached profile lets an already signed-in user reopen the portal immediately.
    // Refresh authorization in the background so a suspended account is still rejected.
    if (immediateRole) {
      const now = Date.now();
      const lastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || now);
      const startedAt = Number(window.sessionStorage.getItem(sessionStartStorageKey) || now);
      const inactivityTimeout = getSessionInactivityTimeout(immediateRole);
      if (now - lastActivity >= inactivityTimeout || now - startedAt >= maxSessionLifetime) {
        setSession(null);
        setUser(null);
        userIdRef.current = null;
        roleRef.current = null;
        hospitalIdRef.current = null;
        fullNameRef.current = null;
        setRole(null);
        setFullName(null);
        setHospitalId(null);
        window.localStorage.removeItem(lastActivityStorageKey);
        window.sessionStorage.removeItem(sessionStartStorageKey);
        void supabase.auth.signOut({ scope: "local" });
        if (!silent) setLoading(false);
        return;
      }

      roleRef.current = immediateRole;
      hospitalIdRef.current = immediateHospitalId;
      fullNameRef.current = immediateFullName;
      setRole(immediateRole);
      setHospitalId(immediateHospitalId);
      setFullName(immediateFullName);
      if (!silent) setLoading(false);

      void withAuthTimeout(resolveUserRole(nextSession.user, false)).then((profile) => {
        if (!mountedRef.current || userIdRef.current !== currentUserId) return;
        if (profile.accessStatus && profile.accessStatus !== "active") {
          setSession(null);
          setUser(null);
          userIdRef.current = null;
          roleRef.current = null;
          hospitalIdRef.current = null;
          fullNameRef.current = null;
          setRole(null);
          setFullName(null);
          setHospitalId(null);
          window.sessionStorage.removeItem("ronsberger-role-" + currentUserId);
          window.sessionStorage.removeItem("ronsberger-hosp-" + currentUserId);
          window.sessionStorage.removeItem("ronsberger-name-" + currentUserId);
          void supabase.auth.signOut({ scope: "local" });
          return;
        }
        if (!profile.role) return;
        roleRef.current = profile.role;
        hospitalIdRef.current = profile.hospitalId;
        fullNameRef.current = profile.fullName;
        setRole(profile.role);
        setHospitalId(profile.hospitalId);
        setFullName(profile.fullName);
        window.sessionStorage.setItem("ronsberger-role-" + currentUserId, profile.role);
        if (profile.hospitalId) window.sessionStorage.setItem("ronsberger-hosp-" + currentUserId, profile.hospitalId);
        else window.sessionStorage.removeItem("ronsberger-hosp-" + currentUserId);
        if (profile.fullName) window.sessionStorage.setItem("ronsberger-name-" + currentUserId, profile.fullName);
      }).catch((error) => {
        console.warn("AuthContext: background role refresh failed; retaining cached role:", error);
      });
      return;
    }

    const profile = await withAuthTimeout(resolveUserRole(nextSession.user)).catch((error) => {
      console.warn("AuthContext: role resolution timed out or failed:", error);
      const fallbackName = (nextSession.user.user_metadata as any)?.full_name || nextSession.user.email || null;
      return { role: null, fullName: fallbackName, hospitalId: null, accessStatus: null };
    });

    if (!mountedRef.current || userIdRef.current !== currentUserId) return;
    if (profile.accessStatus && profile.accessStatus !== "active") {
      setSession(null);
      setUser(null);
      userIdRef.current = null;
      roleRef.current = null;
      hospitalIdRef.current = null;
      fullNameRef.current = null;
      setRole(null);
      setFullName(null);
      setHospitalId(null);
      void supabase.auth.signOut({ scope: "local" });
      if (!silent) setLoading(false);
      return;
    }

    const effectiveRole = profile.role || (sameUser ? roleRef.current : null) || cachedRole;
    const effectiveHospitalId = profile.hospitalId || (sameUser ? hospitalIdRef.current : null) || cachedHospitalId;
    const effectiveFullName = profile.fullName || (sameUser ? fullNameRef.current : null) || cachedFullName;
    const now = Date.now();
    const lastActivity = Number(window.localStorage.getItem(lastActivityStorageKey) || now);
    const startedAt = Number(window.sessionStorage.getItem(sessionStartStorageKey) || now);
    const inactivityTimeout = getSessionInactivityTimeout(effectiveRole);

    if (now - lastActivity >= inactivityTimeout || now - startedAt >= maxSessionLifetime) {
      setSession(null);
      setUser(null);
      userIdRef.current = null;
      roleRef.current = null;
      hospitalIdRef.current = null;
      fullNameRef.current = null;
      setRole(null);
      setFullName(null);
      setHospitalId(null);
      window.localStorage.removeItem(lastActivityStorageKey);
      window.sessionStorage.removeItem(sessionStartStorageKey);
      void supabase.auth.signOut({ scope: "local" });
      if (!silent) setLoading(false);
      return;
    }

    roleRef.current = effectiveRole;
    hospitalIdRef.current = effectiveHospitalId || null;
    fullNameRef.current = effectiveFullName;
    setRole(effectiveRole);
    setFullName(effectiveFullName);
    setHospitalId(effectiveHospitalId || null);
    if (effectiveRole) window.sessionStorage.setItem("ronsberger-role-" + currentUserId, effectiveRole);
    if (effectiveHospitalId) window.sessionStorage.setItem("ronsberger-hosp-" + currentUserId, effectiveHospitalId);
    if (effectiveFullName) window.sessionStorage.setItem("ronsberger-name-" + currentUserId, effectiveFullName);
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

    withAuthTimeout(supabase.auth.getSession())
      .then(({ data: { session: initialSession } }) => {
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
      })
      .catch((error) => {
        console.error("AuthProvider: initial session lookup failed", error);
        if (mountedRef.current) {
          setSession(null);
          setUser(null);
          setRole(null);
          setFullName(null);
          setHospitalId(null);
          setLoading(false);
        }
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

  const value = useAuthContextValue(session, user, role, fullName, hospitalId, loading, signOut, refreshProfile);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
