import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, Mail, ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const [, b64] = token.split(".");
    const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      window
        .atob(normalized)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isJwtExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return Math.floor(Date.now() / 1000) > payload.exp;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // In-memory token storage (for recovery link click)
  const [pendingTokens, setPendingTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [hasTokens, setHasTokens] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sessionResolving, setSessionResolving] = useState(true);

  // Request Reset form state (when arriving without tokens)
  const [requestEmail, setRequestEmail] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState("");

  // ---------------------------------------------------------------------------
  // On mount: check for tokens, PKCE codes, OTP recovery tokens, or show request form
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const validateAndPrepare = async () => {
      setSessionResolving(true);
      setInviteError(null);

      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

        let accessToken = hashParams.get("access_token") || searchParams.get("access_token") || "";
        let refreshToken = hashParams.get("refresh_token") || searchParams.get("refresh_token") || "";

        // 1. Check for PKCE authorization code (?code=...)
        const code = searchParams.get("code");
        if (!accessToken && code) {
          try {
            const { data: codeData, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
            if (!codeError && codeData?.session) {
              accessToken = codeData.session.access_token;
              refreshToken = codeData.session.refresh_token;
            }
          } catch (err) {
            console.warn("PKCE recovery code exchange error:", err);
          }
        }

        // 2. Check for token_hash or token (?token_hash=... or ?token=...)
        const tokenHash = searchParams.get("token_hash") || searchParams.get("token");
        const otpType = (searchParams.get("type") as any) || "recovery";
        if (!accessToken && tokenHash) {
          try {
            const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: otpType === "recovery" ? "recovery" : "email",
            });
            if (!otpError && otpData?.session) {
              accessToken = otpData.session.access_token;
              refreshToken = otpData.session.refresh_token;
            }
          } catch (err) {
            console.warn("verifyOtp recovery error:", err);
          }
        }

        // 3. Check for existing active recovery session if not passed directly in URL
        if (!accessToken) {
          const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
          if (sessionData?.session?.access_token) {
            accessToken = sessionData.session.access_token;
            refreshToken = sessionData.session.refresh_token || "";
          }
        }

        // Clean tokens from URL bar to prevent token leakage
        if (code || tokenHash || hashParams.has("access_token") || searchParams.has("access_token")) {
          window.history.replaceState(null, "", window.location.pathname);
        }

        if (!accessToken) {
          setHasTokens(false);
          setPendingTokens(null);
          setSessionResolving(false);
          return;
        }

        if (isJwtExpired(accessToken)) {
          setInviteError(
            "This password reset link has expired. Please request a new password reset link below."
          );
          setHasTokens(false);
          setPendingTokens(null);
          setSessionResolving(false);
          return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          setInviteError(
            "This password reset link is invalid or has expired. Please request a new reset link below."
          );
          setHasTokens(false);
          setPendingTokens(null);
          setSessionResolving(false);
          return;
        }

        setPendingTokens({ accessToken, refreshToken });
        setHasTokens(true);
      } catch (e: any) {
        setInviteError("An error occurred while validating your reset link. Please request a new reset link below.");
        setHasTokens(false);
        setPendingTokens(null);
      } finally {
        setSessionResolving(false);
      }
    };

    validateAndPrepare();
  }, []);

  const signOutResetSession = async () => {
    await supabase.auth.signOut({ scope: "global" }).catch(async () => {
      await supabase.auth.signOut({ scope: "local" });
    });
  };

  // ---------------------------------------------------------------------------
  // Submit new password
  // ---------------------------------------------------------------------------
  const onReset = async () => {
    if (!pendingTokens) {
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Please request a new reset email.",
      });
      return;
    }
    if (password.length < 8) {
      toast({
        variant: "destructive",
        title: "Weak Password",
        description: "Password must be at least 8 characters.",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        variant: "destructive",
        title: "Passwords Do Not Match",
        description: "Please make sure your passwords match exactly.",
      });
      return;
    }

    setSubmitting(true);
    let resetSessionApplied = false;

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("ronsberger-reset-submitting", "true");
    }

    try {
      if (pendingTokens.accessToken && pendingTokens.refreshToken) {
        const { data: currentSession } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (!currentSession?.session) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: pendingTokens.accessToken,
            refresh_token: pendingTokens.refreshToken,
          });
          if (sessionError) {
            throw new Error(
              sessionError?.message || "Failed to establish password reset session. Please reopen the recovery link."
            );
          }
        }
      }

      resetSessionApplied = true;

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await (supabase as any).rpc("unlock_account_after_reset", { p_email: user.email });
        }
      } catch (err) {
        console.error("Error unlocking account after reset:", err);
      }

      await signOutResetSession();

      toast({
        title: "Password Updated Successfully",
        description: "You can now sign in with your new password.",
      });
      setPendingTokens(null);
      navigate("/login");
    } catch (e: any) {
      if (resetSessionApplied) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }

      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: e?.message || "Could not update password. Please try again.",
      });
    } finally {
      setSubmitting(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("ronsberger-reset-submitting");
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Request reset link (when arriving without tokens)
  // ---------------------------------------------------------------------------
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = requestEmail.trim().toLowerCase();
    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      setRequestError("Please enter a valid email address.");
      return;
    }

    setRequestLoading(true);
    setRequestError("");

    try {
      const siteUrl = window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: `${siteUrl}/reset-password`,
      });

      if (error) throw error;
      setRequestSuccess(true);
    } catch (err: any) {
      setRequestError(err?.message || "Failed to send reset link. Please try again.");
    } finally {
      setRequestLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (sessionResolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F6E56]" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[420px] animate-in fade-in duration-300">
        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="p-7 sm:p-9">
            {/* Header Brand */}
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
                <img
                  src="/ronsberger-logo.png"
                  alt="Ronsberger HMO Logo"
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src.endsWith(".png")) target.src = "/ronsberger-logo.webp";
                  }}
                />
              </div>

              {hasTokens && pendingTokens ? (
                <>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    Set New Password
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    Create a strong password of at least 8 characters
                  </p>
                </>
              ) : requestSuccess ? (
                <>
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    Check Your Inbox
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    We sent a recovery link to your email
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    Reset Your Password
                  </h1>
                  <p className="mt-1 text-xs text-slate-500">
                    Enter your email to receive a secure recovery link
                  </p>
                </>
              )}
            </div>

            {/* Error banner if token was invalid/expired */}
            {inviteError && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs text-amber-800">
                <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{inviteError}</p>
              </div>
            )}

            {/* Case 1: Has valid tokens from recovery link -> Set New Password Form */}
            {hasTokens && pendingTokens ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onReset();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs font-semibold text-slate-700">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      required
                      disabled={submitting}
                      className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm pr-11 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs font-semibold text-slate-700">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      disabled={submitting}
                      className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm pr-11 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={submitting || password.length < 8 || password !== confirm}
                    className="h-11 w-full rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-sm font-semibold text-white shadow-xs transition-colors disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    ) : (
                      "Save New Password"
                    )}
                  </Button>
                </div>
              </form>
            ) : requestSuccess ? (
              /* Case 2: Email sent successfully */
              <div className="space-y-4 text-center">
                <p className="text-xs text-slate-600 leading-relaxed">
                  If an account exists for <strong className="text-slate-800">{requestEmail}</strong>, we have sent a secure link to reset your password.
                </p>
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="h-11 w-full rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-sm font-semibold text-white shadow-xs"
                  >
                    Return to Login
                  </Button>
                </div>
              </div>
            ) : (
              /* Case 3: Request Reset Link Form */
              <form onSubmit={handleSendResetEmail} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="request-email" className="text-xs font-semibold text-slate-700">
                    Registered Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="request-email"
                      type="email"
                      required
                      value={requestEmail}
                      onChange={(e) => {
                        setRequestEmail(e.target.value);
                        setRequestError("");
                      }}
                      placeholder="name@hospital.com"
                      className="h-11 pl-10 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm transition-all"
                    />
                  </div>
                </div>

                {requestError && (
                  <p className="text-xs font-semibold text-rose-600 animate-in fade-in">
                    {requestError}
                  </p>
                )}

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={requestLoading || !requestEmail}
                    className="h-11 w-full rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-sm font-semibold text-white shadow-xs transition-colors disabled:opacity-60"
                  >
                    {requestLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    ) : (
                      "Send Recovery Link"
                    )}
                  </Button>
                </div>

                <div className="text-center pt-2">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Sign In
                  </Link>
                </div>
              </form>
            )}

            {/* Bottom Links */}
            <div className="mt-8 border-t border-slate-100 pt-5 text-center">
              <p className="text-[11px] text-slate-400">
                Ronsberger HMO Security & Account Recovery
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
