import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { accessStatus } from "@/lib/user-helpers";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
export default function Login() {
  const { session, role, loading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();
  const fromPath =
    (location.state as any)?.from?.pathname ||
    (typeof window !== "undefined"
      ? window.sessionStorage.getItem("ronsberger-intended-path")
      : null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showMfa, setShowMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [pendingAdminRole, setPendingAdminRole] = useState<AppRole | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Brute-force throttle state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Redirect on successful auth
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (session && !loading && role && !showMfa) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("ronsberger-intended-path");
      }
      if (fromPath) {
        navigate(fromPath, { replace: true });
        return;
      }
      if (role === "hospital") navigate("/dashboard", { replace: true });
      else if (role === "admin") navigate("/backoffice/admin", { replace: true });
      else if (role === "nurse") navigate("/backoffice/nurse", { replace: true });
      else if (role === "claims") navigate("/backoffice/claims", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [session, loading, role, navigate, showMfa, fromPath]);

  // ---------------------------------------------------------------------------
  // Lockout countdown ticker
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (lockedUntil === null) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockCountdown(remaining);
      if (remaining === 0) {
        setLockedUntil(null);
        setFailedAttempts(0);
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const resolveRole = async (
    userId: string,
    userEmail: string
  ): Promise<AppRole | null> => {
    const { data: roleRow } = await (supabase as any)
      .from("user_roles")
      .select("role, access_status, onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();

    if (roleRow) {
      const status = accessStatus(roleRow as any);
      if (status === "revoked") {
        throw new Error("Account locked. Please contact your IT administrator.");
      }
      return (roleRow as any).role;
    }

    const { data: healed, error: healErr } = await (supabase.rpc as any)(
      "heal_hospital_user_link",
      { p_user_id: userId, p_email: userEmail }
    );

    if (healErr) {
      console.error("Login: heal_hospital_user_link failed:", healErr);
    } else if (healed?.[0]?.out_role) {
      return healed[0].out_role as AppRole;
    }

    const { data: retry } = await (supabase as any)
      .from("user_roles")
      .select("role, access_status, onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle();

    if (retry) {
      const status = accessStatus(retry as any);
      if (status === "revoked") {
        throw new Error("Account locked. Please contact your IT administrator.");
      }
      return (retry as any).role;
    }

    return null;
  };

  const redirectForRole = (resolvedRole: AppRole) => {
    if (resolvedRole === "hospital") navigate("/dashboard", { replace: true });
    else if (resolvedRole === "admin") navigate("/backoffice/admin", { replace: true });
    else if (resolvedRole === "nurse") navigate("/backoffice/nurse", { replace: true });
    else if (resolvedRole === "claims") navigate("/backoffice/claims", { replace: true });
    else navigate("/", { replace: true });
  };



  // FIX 3: Categorise errors correctly — don't expose internals but distinguish network issues
  const parseAuthError = (err: any): string => {
    const msg: string = (err?.message || "").toLowerCase();
    if (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("networkerror")
    ) {
      return "Connection error. Please check your network and try again.";
    }
    // Generic message for any auth failure — prevents user enumeration
    return "Invalid credentials. Please check your email and password.";
  };

  // ---------------------------------------------------------------------------
  // Sign in
  // ---------------------------------------------------------------------------
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setError("");
    setIsLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;

      const userId = data.user?.id;
      const userEmail = data.user?.email ?? email;
      if (!userId) throw new Error("No user id");

      const resolvedRole = await resolveRole(userId, userEmail);

      if (!resolvedRole) {
        await supabase.auth.signOut();
        let dbAttempts = 3;
        try {
          const { data: rpcData } = await (supabase.rpc as any)("record_failed_login", { p_email: email });
          if (rpcData && typeof rpcData === "object") {
            dbAttempts = (rpcData as any).failed_attempts || 3;
          }
        } catch (rpcEx) {
          console.error(rpcEx);
        }
        setFailedAttempts(dbAttempts);
        if (dbAttempts >= MAX_FAILED_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
        }
        setError("Invalid credentials. Please check your email and password.");
        return;
      }

      // Reset throttle on successful login
      try {
        await (supabase.rpc as any)("reset_failed_login", { p_email: userEmail });
      } catch (rpcEx) {
        console.error("Failed to reset failed login attempts:", rpcEx);
      }
      setFailedAttempts(0);
      setLockedUntil(null);

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verifiedFactor = factors?.all.find((f) => f.status === "verified");

      if (verifiedFactor) {
        setPendingAdminRole(resolvedRole);
        setShowMfa(true);
        setIsLoading(false);
        return;
      }

      redirectForRole(resolvedRole);
    } catch (err: any) {
      await supabase.auth.signOut();
      
      let dbAttempts = 1;
      let dbStatus = "active";
      try {
        const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)("record_failed_login", { p_email: email });
        if (!rpcErr && rpcData && typeof rpcData === "object") {
          dbAttempts = (rpcData as any).failed_attempts || 1;
          dbStatus = (rpcData as any).status || "active";
        }
      } catch (rpcEx) {
        console.error("Failed to record login attempt in DB:", rpcEx);
      }

      const localAttempts = failedAttempts + 1;
      const effectiveAttempts = Math.max(localAttempts, dbAttempts);
      setFailedAttempts(effectiveAttempts);
      if (effectiveAttempts >= MAX_FAILED_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
      }

      if (dbStatus === "revoked" || effectiveAttempts >= 5 || err.message?.includes("Account locked")) {
        // Automatically trigger password reset on the exact 5th attempt
        if (effectiveAttempts === 5 && localAttempts === 5) {
          supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          }).catch((err) => console.error("Failed to send reset email on lockout", err));
        }
        setError("Account locked due to 5 failed attempts. A password reset link has been sent to your email to regain access.");
      } else {
        const baseError = parseAuthError(err);
        if (effectiveAttempts === 3) {
          setError(`${baseError} You have 2 more trials before your account is locked.`);
        } else if (effectiveAttempts === 4) {
          setError(`${baseError} You have 1 more trial before your account is locked.`);
        } else {
          setError(baseError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // MFA verification
  // ---------------------------------------------------------------------------
  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.all.find((f) => f.status === "verified");

      if (factor) {
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challengeError) throw challengeError;

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challengeData.id,
          code: mfaCode,
        });

        if (!verifyError) {
          if (pendingAdminRole) {
            redirectForRole(pendingAdminRole);
          } else if (fromPath) {
            navigate(fromPath, { replace: true });
          } else {
            navigate("/", { replace: true });
          }
          return;
        }
        throw verifyError;
      }

      setError("MFA enrollment required for this account.");
    } catch (err: any) {
      setError(err.message || "MFA verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-50 font-sans">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10">
        <Card className="w-full rounded-2xl shadow-xl border-slate-200 bg-white overflow-hidden">
          <CardContent className="p-8 sm:p-10">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[80px] w-[80px] items-center justify-center rounded-2xl bg-white border border-slate-100 shadow-xl p-2 overflow-hidden">
                <img src="/ronsberger-logo.png" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
              </div>
              <h1 className="text-xl font-extrabold text-[#3f3f95] uppercase tracking-normal">
                Ronsberger <span className="text-[#93c34b]">HMO</span>
              </h1>
              <p className="mt-2 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Sign in to your account
              </p>
            </div>

            {showMfa ? (
              /* ---- MFA screen ---- */
              <form onSubmit={handleVerifyMfa} className="space-y-5">
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs font-semibold text-[#3f3f95] leading-tight flex items-center gap-2">
                      <Shield className="h-4 w-4 text-[#3f3f95]" />
                      Multi-Factor Authentication
                    </p>
                    <p className="text-xs text-slate-600 mt-1.5 leading-normal">
                      Authenticator protection is enabled. Enter the verification code from your authenticator app to authorize this session.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                       <Label htmlFor="mfa-code" className="text-xs font-bold text-slate-800">
                         Authenticator Code
                       </Label>
                      <Badge className="bg-slate-100 text-[#3f3f95] border border-slate-200 text-xs font-bold">
                        MFA Enabled
                      </Badge>
                    </div>
                    <Input
                      id="mfa-code"
                      type="text"
                      maxLength={6}
                      value={mfaCode}
                      onChange={(e) => {
                        setError("");
                        setMfaCode(e.target.value.replace(/\D/g, ""));
                      }}
                      required
                      placeholder="000000"
                      className="h-14 rounded-xl text-center text-3xl font-mono tracking-[0.4em] bg-slate-50 border-slate-200 focus:border-[#3f3f95] transition-all"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl font-semibold bg-[#3f3f95] hover:bg-[#32327a] text-white shadow-lg shadow-[#3f3f95]/10 active:scale-95 transition-all"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Verify Identity"
                  )}
                </Button>
                {error && (
                  <p className="text-center text-xs font-semibold text-rose-600 animate-in fade-in slide-in-from-bottom-1">
                    {error}
                  </p>
                )}
              </form>
            ) : (
              /* ---- Login screen ---- */
              <form onSubmit={handleSignIn} className="space-y-5">
                {/* Hidden dummy fields to absorb browser credential autofill */}
                <input
                  type="text"
                  name="email"
                  value={email}
                  autoComplete="username"
                  aria-label="Hidden Username Autofill"
                  style={{
                    position: "absolute",
                    top: "-1000px",
                    left: "-1000px",
                    width: "1px",
                    height: "1px",
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                  tabIndex={-1}
                  readOnly
                />
                <input
                  type="password"
                  name="dummy-password"
                  autoComplete="current-password"
                  aria-label="Hidden Password Autofill"
                  style={{
                    position: "absolute",
                    top: "-1000px",
                    left: "-1000px",
                    width: "1px",
                    height: "1px",
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                  tabIndex={-1}
                  readOnly
                />

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-bold text-slate-800">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      required
                      disabled={isLocked}
                      placeholder="name@your-domain.com"
                      className="h-12 rounded-xl bg-slate-50 border-slate-100 font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-bold text-slate-800">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setError("");
                        }}
                        required
                        disabled={isLocked}
                        className="h-12 rounded-xl bg-slate-50 border-slate-100 font-bold pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-700 transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lockout banner */}
                {isLocked && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 animate-in fade-in">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-800">
                      Too many attempts — please wait {lockCountdown}s
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || isLocked}
                  className="h-12 w-full rounded-xl font-semibold bg-[#3f3f95] hover:bg-[#32327a] text-white shadow-lg shadow-[#3f3f95]/10 active:scale-95 transition-all disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isLocked ? (
                    `Locked — ${lockCountdown}s`
                  ) : (
                    "Login"
                  )}
                </Button>

                {error && !isLocked && (
                  <p className="text-center text-xs font-semibold text-rose-700 animate-in fade-in slide-in-from-bottom-1">
                    {error}
                  </p>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
