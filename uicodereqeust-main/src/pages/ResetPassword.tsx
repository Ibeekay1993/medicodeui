import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Lock } from "lucide-react";

// ---------------------------------------------------------------------------
// JWT helpers — no library needed, works in all modern browsers
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
  const [submitting, setSubmitting] = useState(false);

  // In-memory token storage
  const [pendingTokens, setPendingTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sessionResolving, setSessionResolving] = useState(true);

  // ---------------------------------------------------------------------------
  // On mount: validate token, clear URL hash, prepare sessionless reset page
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";

    if (!accessToken || !refreshToken) {
      setInviteError(
        "Password reset session expired or link is missing. Please reopen your recovery email and click the reset link again."
      );
      setSessionResolving(false);
      return;
    }

    // Immediately clear URL hash to prevent token leakage
    window.history.replaceState(null, "", window.location.pathname);

    const validateAndPrepare = async () => {
      try {
        // Force Logout Existing Session to enter a clean unauthenticated state
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});

        // Validate JWT expiry client-side
        if (isJwtExpired(accessToken)) {
          setInviteError(
            "This password reset link has expired. Please request a new password reset."
          );
          setSessionResolving(false);
          return;
        }

        // Validate Invitation/Recovery Token server-side
        const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          setInviteError(
            "This password reset link is invalid or has expired. Please request a new password reset."
          );
          setSessionResolving(false);
          return;
        }

        // Store tokens strictly in React memory state
        setPendingTokens({ accessToken, refreshToken });
      } catch (e: any) {
        setInviteError("An error occurred while validating your reset link. Please try again.");
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

  const onReset = async () => {
    if (!pendingTokens) {
      toast({
        variant: "destructive",
        title: "Reset unavailable",
        description: "Request a new reset email or contact support.",
      });
      return;
    }
    if (password.length < 8) {
      toast({
        variant: "destructive",
        title: "Weak password",
        description: "Password must be at least 8 characters.",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Confirm password must match.",
      });
      return;
    }

    setSubmitting(true);
    let resetSessionApplied = false;

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("ronsberger-reset-submitting", "true");
    }

    try {
      // Establish Supabase Session ONLY after validation succeeds
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: pendingTokens.accessToken,
        refresh_token: pendingTokens.refreshToken,
      });

      if (sessionError || !sessionData?.session) {
        throw new Error(
          sessionError?.message || "Failed to establish password reset session. Please reopen the recovery link."
        );
      }

      resetSessionApplied = true;

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Attempt to heal the account if it was brute-force locked
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await (supabase as any).rpc('unlock_account_after_reset', { p_email: user.email });
        }
      } catch (err) {
        console.error('Error unlocking account after reset:', err);
      }

      // Invalidate all active sessions for this user on success
      await signOutResetSession();

      toast({
        title: "Password updated",
        description: "Please sign in again with your new password.",
      });
      setPendingTokens(null);
      navigate("/login");
    } catch (e: any) {
      // Failure Rollback: Clear any partial session/authentication
      if (resetSessionApplied) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }

      toast({
        variant: "destructive",
        title: "Reset failed",
        description: e?.message || "Could not reset password.",
      });
    } finally {
      setSubmitting(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("ronsberger-reset-submitting");
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (sessionResolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#3f3f95]" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state — invalid / expired / missing token
  // ---------------------------------------------------------------------------
  if (inviteError) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans py-12 px-4 flex items-center justify-center">
        <div className="max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className="rounded-2xl shadow-2xl border-slate-200 bg-white overflow-hidden">
            <div className="text-center p-6 pb-2">
              <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-amber-50 shadow-xl shadow-amber-500/10 border border-amber-200">
                <ShieldAlert className="h-7 w-7 text-amber-600 animate-pulse" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 uppercase italic">
                Reset <span className="text-amber-600">Error</span>
              </h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                Verification Failed
              </p>
            </div>
            <div className="p-8 pt-0 text-center space-y-6">
              <p className="text-sm font-semibold text-slate-600 leading-relaxed">{inviteError}</p>
              <Button
                onClick={() => navigate("/login")}
                className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all"
              >
                Go to Login
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Reset Form
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-50 font-sans py-12 px-4 flex items-center justify-center">
      <div className="max-w-md w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Card className="rounded-2xl shadow-2xl border-slate-200 bg-white overflow-hidden">
          <div className="text-center p-6 pb-2">
            <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-slate-900 shadow-xl shadow-slate-900/20">
              <ShieldCheck className="h-7 w-7 text-[#93c34b]" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase italic">
              Reset <span className="text-[#3f3f95]">Password</span>
            </h1>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mt-2">
              Secure Account Update
            </p>
          </div>
          <div className="p-8 pt-2">
            <p className="text-xs font-semibold text-slate-700 mb-6 text-center">
              Set a new password using the secure link sent to your email. This link expires after 1 hour.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onReset();
              }}
              className="space-y-5"
              autoComplete="off"
            >
              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-slate-700 ml-1">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-100 font-bold"
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm" className="text-xs font-black uppercase tracking-widest text-slate-700 ml-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-100 font-bold"
                    autoComplete="new-password"
                    required
                    disabled={submitting}
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all mt-4"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}

