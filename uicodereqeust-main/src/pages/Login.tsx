import { BrandSpinner } from "@/components/BrandSpinner";
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, AlertTriangle, Mail } from "lucide-react";
import { MfaChallengeForm } from "@/components/auth/MfaChallengeForm";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { accessStatus } from "@/lib/user-helpers";
import { isMfaRequiredForUser } from "@/lib/mfa-policy";
import { getPrefilledLoginEmail } from "@/lib/loginPrefill";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds
const AUTH_REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

function withAuthTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      window.setTimeout(
        () => reject(new Error("Authentication service did not respond in time.")),
        AUTH_REQUEST_TIMEOUT_MS,
      ),
    ),
  ]);
}

// ---------------------------------------------------------------------------
export default function Login() {
  const { session, role, loading, accountSetupRequired } = useAuth();

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

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const prefilledEmail = getPrefilledLoginEmail(location.search);
    if (prefilledEmail) setEmail(prefilledEmail);
    if (searchParams.get("mode") === "reset") {
      setForgotEmail(prefilledEmail);
      setForgotOpen(true);
    }
  }, [location.search]);

  // Brute-force throttle state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Redirect on successful auth
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash,
    );
    const searchParams = new URLSearchParams(window.location.search);
    const inviteType = hashParams.get("type") || searchParams.get("type") || "";
    const hasInviteTokens =
      Boolean(hashParams.get("access_token") && hashParams.get("refresh_token")) ||
      Boolean(searchParams.get("access_token") && searchParams.get("refresh_token"));

    if (["invite", "signup"].includes(inviteType) && hasInviteTokens) {
      navigate("/register", { replace: true });
      return;
    }

    if (session && !loading && accountSetupRequired) {
      navigate("/complete-account-setup", { replace: true });
      return;
    }

    if (session && !loading && role && !showMfa) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("ronsberger-intended-path");
      }
      
      if (role === "hospital") {
        navigate("/dashboard", { replace: true });
        return;
      }

      let active = true;
      const redirectAfterLogin = () => {
        if (fromPath) {
          navigate(fromPath, { replace: true });
        } else if (role === "admin") {
          navigate("/backoffice/admin", { replace: true });
        } else if (role === "utilization_manager" || role === "utilization_manager_lead") {
          navigate("/backoffice/utilization-manager", { replace: true });
        } else if (role === "claims" || role === "claims_lead") {
          navigate("/backoffice/claims", { replace: true });
        } else if (role === "finance") {
          navigate("/backoffice/finance", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      };

      const checkMfaRequirement = async () => {
        try {
          if (!(await isMfaRequiredForUser(session.user.id))) {
            if (active) redirectAfterLogin();
            return;
          }

          const { data: mfaLevel, error: mfaError } =
            await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (mfaError) throw mfaError;
          if (!mfaLevel) throw new Error("MFA assurance level is unavailable.");
          if (!active) return;

          if (mfaLevel?.nextLevel === "aal2" && mfaLevel.currentLevel === "aal1") {
            setShowMfa(true);
          } else {
            redirectAfterLogin();
          }
        } catch (mfaError) {
          console.error("Unable to check the MFA requirement after login:", mfaError);
          if (active) {
            setError("Could not verify the MFA policy. Please try signing in again.");
          }
        }
      };

      void checkMfaRequirement();
      return () => {
        active = false;
      };
    }
  }, [session, loading, role, accountSetupRequired, navigate, showMfa, fromPath]);

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
    const { data: roleRow, error: roleError } = await withAuthTimeout(
      supabase
        .from("user_roles")
        .select("role, access_status, onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle()
    );

    if (roleError) throw roleError;

    if (roleRow) {
      const status = accessStatus(roleRow);
      if (status === "revoked") {
        throw new Error("Account locked. Please contact your IT administrator.");
      }
      return roleRow.role;
    }

    const { data: healed, error: healErr } = await withAuthTimeout(
      supabase.rpc("heal_hospital_user_link", { p_user_id: userId, p_email: userEmail })
    );

    if (healErr) {
      console.error("Login: heal_hospital_user_link failed:", healErr);
    } else if (healed?.[0]?.out_role) {
      return healed[0].out_role as AppRole;
    }

    const { data: retry, error: retryError } = await withAuthTimeout(
      supabase
        .from("user_roles")
        .select("role, access_status, onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle()
    );

    if (retryError) throw retryError;

    if (retry) {
      const status = accessStatus(retry);
      if (status === "revoked") {
        throw new Error("Account locked. Please contact your IT administrator.");
      }
      return retry.role;
    }

    return null;
  };

  const redirectForRole = (resolvedRole: AppRole) => {
    if (resolvedRole === "hospital") navigate("/dashboard", { replace: true });
    else if (resolvedRole === "admin") navigate("/backoffice/admin", { replace: true });
    else if (resolvedRole === "utilization_manager") navigate("/backoffice/utilization-manager", { replace: true });
    else if (resolvedRole === "utilization_manager_lead") navigate("/backoffice/utilization-manager", { replace: true });
    else if (resolvedRole === "claims" || resolvedRole === "claims_lead") navigate("/backoffice/claims", { replace: true });
    else navigate("/", { replace: true });
  };

  const isTransientAuthError = (err: any): boolean => {
    const msg: string = (err?.message || "").toLowerCase();
    if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials") || msg.includes("account locked")) {
      return false;
    }
    return (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("timed out") ||
      msg.includes("did not respond") ||
      msg.includes("cors") ||
      msg.includes("service unavailable") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504")
    );
  };

  const parseAuthError = (err: any): string => {
    if (err?.message && err.message.includes("Account locked")) {
      return err.message;
    }
    if (isTransientAuthError(err)) {
      return "Connection error. Unable to reach the server. Please check your internet connection and try again.";
    }
    return "Invalid email or password. Please verify your credentials.";
  };

  // ---------------------------------------------------------------------------
  // Sign in
  // ---------------------------------------------------------------------------
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;

    setError("");
    setIsLoading(true);
    let authenticationSucceeded = false;

    try {
      const { data, error: authError } = await withAuthTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        }),
      );
      if (authError) throw authError;
      authenticationSucceeded = true;

      const userId = data.user?.id;
      const userEmail = data.user?.email ?? email;
      if (!userId) throw new Error("No user id");

      const resolvedRole = await resolveRole(userId, userEmail);

      if (!resolvedRole) {
        await withAuthTimeout(supabase.auth.signOut({ scope: "local" })).catch((signOutError) => {
          console.error("Login: sign-out after missing role timed out", signOutError);
        });
        setError("Your password was accepted, but your account profile could not be loaded. Please contact support.");
        return;
      }

      // Reset throttle on successful login
      try {
        await withAuthTimeout(
          (supabase.rpc as any)("reset_failed_login", { p_email: userEmail }),
        );
      } catch (rpcEx) {
        console.error("Failed to reset failed login attempts:", rpcEx);
      }
      setFailedAttempts(0);
      setLockedUntil(null);

      // Update last_sign_in timestamp on user_roles
      void supabase
        .from("user_roles")
        .update({ last_sign_in: new Date().toISOString() })
        .eq("user_id", userId)
        .then(
          () => undefined,
          (err: unknown) => console.warn("Could not update last_sign_in on login", err),
        );

      const { data: factors } = await withAuthTimeout(supabase.auth.mfa.listFactors());
      const verifiedFactor = factors?.all.find((f) => f.status === "verified");

      if (verifiedFactor && resolvedRole !== "hospital") {
        if (await isMfaRequiredForUser(userId)) {
          setPendingAdminRole(resolvedRole);
          setShowMfa(true);
          setIsLoading(false);
          return;
        }
      }
    } catch (err: any) {
      if (!authenticationSucceeded) {
        try {
          await withAuthTimeout(supabase.auth.signOut({ scope: "local" }));
        } catch (signOutError) {
          console.error("Login: sign-out after failed authentication timed out", signOutError);
        }
      }
      
      if (authenticationSucceeded) {
        setError("Your password was accepted, but your account profile could not be loaded. Please try again.");
        return;
      }

      const localAttempts = failedAttempts + 1;
      setFailedAttempts(localAttempts);
      if (localAttempts >= MAX_FAILED_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_DURATION_MS);
      }

      if (localAttempts >= 5 || err.message?.includes("Account locked")) {
        if (localAttempts === 5) {
          supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          }).catch((err) => console.error("Failed to send reset email on lockout", err));
        }
        setError("Account locked due to 5 failed attempts. A password reset link has been sent to your email to regain access.");
      } else {
        const baseError = parseAuthError(err);
        if (localAttempts === 3) {
          setError(`${baseError} You have 2 more attempts before your account is temporarily locked.`);
        } else if (localAttempts === 4) {
          setError(`${baseError} You have 1 more attempt before your account is temporarily locked.`);
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
      if (!session || !(await isMfaRequiredForUser(session.user.id))) {
        setShowMfa(false);
        setMfaCode("");
        setPendingAdminRole(null);
        return;
      }

      const { data: factors } = await withAuthTimeout(supabase.auth.mfa.listFactors());
      const factor = factors?.all.find((f) => f.status === "verified");

      if (factor) {
        const { data: challengeData, error: challengeError } =
          await withAuthTimeout(supabase.auth.mfa.challenge({ factorId: factor.id }));
        if (challengeError) throw challengeError;

        const { error: verifyError } = await withAuthTimeout(supabase.auth.mfa.verify({
          factorId: factor.id,
          challengeId: challengeData.id,
          code: mfaCode,
        }));

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
      setError(isTransientAuthError(err)
        ? "Connection error. Unable to reach the server. Please check your internet connection and try again."
        : err.message || "MFA verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Request Password Reset Link (Forgot Password)
  // ---------------------------------------------------------------------------
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = forgotEmail.trim().toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setForgotError("Please enter a valid email address.");
      return;
    }

    setForgotLoading(true);
    setForgotError("");

    try {
      const siteUrl = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${siteUrl}/reset-password`,
      });

      if (resetError) throw resetError;

      setForgotSuccess(true);
    } catch (err: any) {
      setForgotError(err?.message || "Failed to send password reset email. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render -- suppress login flash: show spinner while auth resolves
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <BrandSpinner className="h-8 w-8" label="Checking session…" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[420px] animate-in fade-in duration-300">
        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-7 sm:p-9">
            {/* Logo and Brand Title */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
                <img
                  src="/ronsberger-logo.png"
                  alt="Ronsberger HMO Logo"
                  className="h-full w-full object-contain"
                  fetchPriority="high"
                  onError={(e) => {
                    // Fallback to webp if png is not found
                    const target = e.currentTarget;
                    if (target.src.endsWith(".png")) {
                      target.src = "/ronsberger-logo.webp";
                    }
                  }}
                />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Ronsberger <span className="text-[#0F6E56]">HMO</span>
              </h1>
              <p className="mt-1.5 text-xs font-medium text-slate-500">
                Clinical Authorization & Healthcare Operations
              </p>
            </div>

            {showMfa ? (
              /* ---- MFA screen ---- */
              <div className="space-y-4">
                <MfaChallengeForm
                  mfaCode={mfaCode}
                  onCodeChange={(code) => {
                    setError("");
                    setMfaCode(code);
                  }}
                  onSubmit={handleVerifyMfa}
                  isLoading={isLoading}
                  onCancel={async () => {
                    setIsLoading(true);
                    await supabase.auth.signOut({ scope: "local" });
                    setShowMfa(false);
                    setMfaCode("");
                    setIsLoading(false);
                  }}
                />
                {error && (
                  <p className="text-center text-xs font-semibold text-rose-600 animate-in fade-in">
                    {error}
                  </p>
                )}
              </div>
            ) : (
              /* ---- Login screen ---- */
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    required
                    disabled={isLocked}
                    placeholder="name@hospital.com"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotSuccess(false);
                        setForgotError("");
                        setForgotOpen(true);
                      }}
                      className="text-xs font-semibold text-[#0F6E56] hover:text-[#0a5240] hover:underline transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      required
                      disabled={isLocked}
                      placeholder="••••••••"
                      className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm pr-11 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-slate-400 hover:text-slate-600 transition-colors"
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

                {/* Lockout banner */}
                {isLocked && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 animate-in fade-in">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-semibold text-amber-800">
                      Too many attempts — please wait {lockCountdown}s
                    </p>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={isLoading || isLocked}
                    className="h-11 w-full rounded-xl bg-[#0F6E56] font-semibold text-sm text-white shadow-xs transition-colors hover:bg-[#0a5240] disabled:opacity-60"
                  >
                    {isLoading ? (
                      <BrandSpinner className="h-4 w-4 animate-spin mx-auto" />
                    ) : isLocked ? (
                      `Locked — wait ${lockCountdown}s`
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </div>

                {error && !isLocked && (
                  <p className="text-center text-xs font-semibold text-rose-600 animate-in fade-in">
                    {error}
                  </p>
                )}
              </form>
            )}

            {/* Bottom Footer Details */}
            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                <Link to="/privacy-policy" className="hover:text-slate-700 hover:underline transition-colors">
                  Privacy Policy
                </Link>
                <span>·</span>
                <Link to="/terms-of-service" className="hover:text-slate-700 hover:underline transition-colors">
                  Terms of Service
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forgot Password Dialog */}
      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        email={forgotEmail}
        onEmailChange={(val) => {
          setForgotEmail(val);
          setForgotError("");
        }}
        onSubmit={handleRequestReset}
        loading={forgotLoading}
        success={forgotSuccess}
        error={forgotError}
      />
    </main>
  );
}
