import { BrandSpinner } from "@/components/BrandSpinner";
import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Lock, Building2, ShieldAlert, Eye, EyeOff, RefreshCw, ArrowRight, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { completedInvitationLoginPath, invitationOtpType } from "@/lib/invitationLinks";
import { getSupabaseFunctionResponseMessage } from "@/lib/supabaseFunctionErrors";

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

// ---------------------------------------------------------------------------
export default function Register() {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Role, email, hospital decoded from JWT payload on page load
  const [tokenRole, setTokenRole] = useState<string | null>(null);
  const [tokenHospitalId, setTokenHospitalId] = useState<string | null>(null);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);

  // Invitation tokens stored strictly in memory
  const [pendingTokens, setPendingTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sessionResolving, setSessionResolving] = useState(true);

  const { toast } = useToast();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Validate token from all entry points (query params, hash, PKCE, OTP, active session)
  // ---------------------------------------------------------------------------
  const validateAndPrepare = useCallback(async () => {
    setSessionResolving(true);
    setInviteError(null);

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash || "";
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

      // New links use an app-owned seven-day bearer token. Validation is
      // read-only: opening, refreshing, or abandoning this page does not use it.
      const customToken = hashParams.get("invitation") || searchParams.get("invitation") || sessionStorage.getItem("pending_custom_invitation") || "";
      if (customToken) {
        setInvitationToken(customToken);
        sessionStorage.setItem("pending_custom_invitation", customToken);
        if (window.location.search || window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        const { data: validation, error: validationError } = await supabase.functions.invoke("invitation-validate", {
          body: { token: customToken },
        });
        if (validationError) {
          setInviteError(validation?.message || validationError?.message || "This invitation is invalid or has expired. Ask an administrator to resend it.");
          setSessionResolving(false);
          return;
        }
        if (validation?.success === true && validation?.already_completed === true) {
          sessionStorage.removeItem("pending_custom_invitation");
          toast({
            title: "Account already active",
            description: "Sign in with your account email and password to continue.",
          });
          navigate(completedInvitationLoginPath(validation.email), { replace: true });
          setSessionResolving(false);
          return;
        }
        if (validation?.success !== true) {
          setInviteError(validation?.message || "This invitation is invalid or has expired. Ask an administrator to resend it.");
          setSessionResolving(false);
          return;
        }
        setTokenRole(String(validation.role || ""));
        setTokenHospitalId(validation.hospital_id || null);
        setTokenEmail(validation.email || null);
        setFullName(String(validation.full_name || ""));
        setHospitalName(String(validation.hospital_name || ""));
        setPendingTokens(null);
        setSessionResolving(false);
        return;
      }

      // 0. Check for GoTrue error redirect in query params or hash
      const urlErrorDesc = searchParams.get("error_description") || hashParams.get("error_description");
      const urlErrorCode = searchParams.get("error_code") || hashParams.get("error_code");
      const urlError = searchParams.get("error") || hashParams.get("error");
      if (urlErrorDesc || urlError) {
        const fullErr = decodeURIComponent(urlErrorDesc || urlError || "");
        const isExpired = fullErr.toLowerCase().includes("expired") || fullErr.toLowerCase().includes("invalid") || urlErrorCode === "otp_expired";
        setInviteError(
          isExpired
            ? "This older invitation link may have expired or already been opened. Ask your administrator to resend it. New invitation links remain valid for seven days and can be reopened until account setup is completed."
            : fullErr
        );
        setSessionResolving(false);
        return;
      }

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
          console.warn("PKCE code exchange error:", err);
        }
      }

      // 2. Check for token_hash or token (?token_hash=... or ?token=...)
      const tokenHash = searchParams.get("token_hash") || searchParams.get("token");
      const otpType = invitationOtpType(searchParams.get("type"));
      if (!accessToken && tokenHash && otpType) {
        try {
          const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (!otpError && otpData?.session) {
            accessToken = otpData.session.access_token;
            refreshToken = otpData.session.refresh_token;
          }
        } catch (err) {
          console.warn("verifyOtp error:", err);
        }
      }

      // 3. Check for existing active session if not in URL
      if (!accessToken) {
        const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
        if (sessionData?.session?.access_token) {
          accessToken = sessionData.session.access_token;
          refreshToken = sessionData.session.refresh_token || "";
        }
      }

      // Clear tokens from URL bar to prevent leakage/reuse
      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, "", window.location.pathname);
      }

      if (!accessToken) {
        setInviteError(
          "Registration session expired or link is missing. Please reopen your invitation email and click the invitation link again."
        );
        setSessionResolving(false);
        return;
      }

      if (isJwtExpired(accessToken)) {
        setInviteError(
          "This invitation link has expired (invitation links are valid for 7 days). Please contact your administrator to resend the invitation."
        );
        setSessionResolving(false);
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
      if (userError || !userData?.user) {
        setInviteError(
          "This invitation link is invalid or has expired. Please contact your administrator for a new invitation."
        );
        setSessionResolving(false);
        return;
      }

      const userId = userData.user.id;
      const userEmail = userData.user.email || null;

      const inviteClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        }
      );
      const { data: inviteStatusData, error: statusError } = await (inviteClient as any).rpc("check_invite_status", {
        p_user_id: userId,
      });

      const inviteRows = inviteStatusData as any[] | null;

      if (statusError || !inviteRows || inviteRows.length === 0) {
        setInviteError(
          "This invitation record could not be verified. Please contact your administrator for a new invitation."
        );
        setSessionResolving(false);
        return;
      }

      const statusRow = inviteRows[0];
      if (statusRow.invite_status === "completed" || statusRow.onboarding_completed === true) {
        toast({
          title: "Account already active",
          description: "Sign in with your account email and password to continue.",
        });
        navigate(completedInvitationLoginPath(userEmail), { replace: true });
        setSessionResolving(false);
        return;
      }
      if (statusRow.invite_status !== "pending" || statusRow.onboarding_completed === true) {
        setInviteError(
          "This invitation has already been completed. Please log in using your email and password."
        );
        setSessionResolving(false);
        return;
      }

      setTokenRole(statusRow.role || null);
      setTokenHospitalId(statusRow.hospital_id || null);
      setTokenEmail(userEmail);
      setPendingTokens({ accessToken, refreshToken: refreshToken || accessToken });

      const metadata = (userData.user.user_metadata as Record<string, any>) || {};
      if (metadata.full_name) {
        setFullName(metadata.full_name);
      }
    } catch (e: any) {
      console.error("Invite validation error:", e);
      setInviteError("An error occurred while validating your invitation. Please reopen your invitation email or contact support.");
    } finally {
      setSessionResolving(false);
    }
  }, []);

  useEffect(() => {
    void validateAndPrepare();
  }, [validateAndPrepare]);

  // ---------------------------------------------------------------------------
  // Complete Account Setup
  // ---------------------------------------------------------------------------
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Full name is required." });
      return;
    }
    if (!acceptTerms || !acceptPrivacy) {
      toast({ variant: "destructive", title: "Consent Required", description: "You must accept the Terms of Service and Privacy Policy to register." });
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
    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords do not match",
        description: "Confirm password must match.",
      });
      return;
    }
    if (tokenRole === "hospital" && !tokenHospitalId && !hospitalName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Hospital name is required." });
      return;
    }
    if (!pendingTokens && !invitationToken) {
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Registration session has expired. Please reopen the invitation email.",
      });
      return;
    }

    setLoading(true);

    try {
      if (invitationToken) {
        const { data: activation, error: activationError } = await supabase.functions.invoke("invitation-accept", {
          body: {
            token: invitationToken,
            fullName: fullName.trim(),
            password,
            hospitalName: hospitalName.trim(),
            acceptedTerms: acceptTerms,
            acceptedPrivacy: acceptPrivacy,
          },
        });
        if (activationError || activation?.success !== true) {
          throw new Error(await getSupabaseFunctionResponseMessage(
            activation,
            activationError,
            "Account setup could not be completed. Please retry.",
          ));
        }

        sessionStorage.removeItem("pending_custom_invitation");
        const activatedRole = String(activation.role || tokenRole || "");
        const activationEmail = String(activation.email || tokenEmail || "");
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: activationEmail,
          password,
        });
        if (signInError) {
          toast({
            title: "Account activated",
            description: "Your account is ready. Sign in with your new password to continue.",
          });
          navigate("/login", { replace: true });
          return;
        }

        toast({ title: "Registration Complete", description: "Your account is ready. Welcome to Ronsberger HMO!" });
        if (activatedRole === "hospital") navigate("/dashboard", { replace: true });
        else if (activatedRole === "admin") navigate("/backoffice/admin", { replace: true });
        else if (activatedRole === "utilization_manager" || activatedRole === "utilization_manager_lead") navigate("/backoffice/utilization-manager", { replace: true });
        else if (activatedRole === "claims" || activatedRole === "claims_lead") navigate("/backoffice/claims", { replace: true });
        else if (activatedRole === "finance") navigate("/backoffice/finance", { replace: true });
        else navigate("/login", { replace: true });
        return;
      }

      const legacyTokens = pendingTokens;
      if (!legacyTokens) {
        throw new Error("Registration session expired. Please reopen your invitation link.");
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: legacyTokens.accessToken,
        refresh_token: legacyTokens.refreshToken,
      });

      if (sessionError || !sessionData?.session) {
        throw new Error(
          sessionError?.message || "Failed to establish registration session. Please reopen the invitation link."
        );
      }

      const userId = sessionData.session.user.id;
      const email = sessionData.session.user.email || "";

      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          full_name: fullName.trim(),
        },
      });
      if (updateError) throw updateError;

      let linkedHospitalId = tokenHospitalId;

      if (tokenRole === "hospital") {
        if (tokenHospitalId) {
          const { error: hospError } = await supabase
            .from("hospitals")
            .update({ user_id: userId } as any)
            .eq("id", tokenHospitalId);
          if (hospError) throw hospError;
        } else if (hospitalName.trim()) {
          const { data: existingHosp } = await supabase
            .from("hospitals")
            .select("id")
            .eq("email", email)
            .maybeSingle();

          if (existingHosp) {
            const { error: hospError } = await supabase
              .from("hospitals")
              .update({ name: hospitalName.trim(), user_id: userId } as any)
              .eq("id", existingHosp.id);
            if (hospError) throw hospError;
            linkedHospitalId = existingHosp.id;
          } else {
            const { data: newHosp, error: insertError } = await supabase
              .from("hospitals")
              .insert([
                {
                  name: hospitalName.trim(),
                  user_id: userId,
                  email: email,
                  code: `HOSP-${Math.random().toString(36).slice(-4).toUpperCase()}`,
                },
              ] as any)
              .select("id")
              .maybeSingle();

            if (insertError) throw insertError;
            if (!newHosp) throw new Error("Failed to create hospital record.");
            linkedHospitalId = newHosp.id;
          }
        }
      }

      const { error: roleUpdateError } = await supabase
        .from("user_roles")
        .update({
          full_name: fullName.trim(),
          access_status: "active",
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          invite_status: "completed",
          hospital_id: linkedHospitalId,
        } as any)
        .eq("user_id", userId);

      if (roleUpdateError) throw roleUpdateError;

      void supabase
        .from("consent_logs")
        .insert([{
          user_id: userId,
          action: "accept_all",
          policy_version: "2026-07"
        } as any]);

      toast({
        title: "Registration Complete",
        description: "Your account is ready. Welcome to Ronsberger HMO!",
      });

      if (tokenRole === "hospital") {
        navigate("/dashboard", { replace: true });
      } else if (tokenRole === "admin") {
        navigate("/backoffice/admin", { replace: true });
      } else if (tokenRole === "utilization_manager" || tokenRole === "utilization_manager_lead") {
        navigate("/backoffice/utilization-manager", { replace: true });
      } else if (tokenRole === "claims" || tokenRole === "claims_lead") {
        navigate("/backoffice/claims", { replace: true });
      } else if (tokenRole === "finance") {
        navigate("/backoffice/finance", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Setup Failed",
        description: err.message || "Failed to complete account registration.",
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (sessionResolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <BrandSpinner className="h-8 w-8 animate-spin text-[#0F6E56]" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state — invalid / expired / missing token
  // ---------------------------------------------------------------------------
  if (inviteError) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans">
        <div className="w-full max-w-[440px] animate-in fade-in duration-300">
          <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardContent className="p-6 sm:p-8 text-center space-y-5">
              {/* Brand Header */}
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-xs">
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

              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50">
                <ShieldAlert className="h-6 w-6 text-amber-600" />
              </div>

              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
                  Invitation Verification
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Could not verify your invitation link or session
                </p>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3.5 text-left">
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  {inviteError}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-left space-y-1.5 text-[11px] text-slate-500">
                <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  Helpful troubleshooting tips:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li>New invitation links expire seven days after they are issued. Opening a new link does not use it.</li>
                  <li>If opening from an email app, try opening the link directly in Chrome or Safari.</li>
                  <li>If your password was already set up, you can proceed directly to login.</li>
                </ul>
              </div>

              <div className="space-y-2 pt-1">
                <Button
                  onClick={() => navigate("/login")}
                  className="h-10 w-full rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-xs font-semibold text-white shadow-xs"
                >
                  Go to Login <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void validateAndPrepare()}
                  className="h-10 w-full rounded-xl border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-slate-400" /> Retry Verification
                </Button>
              </div>

              <p className="text-[11px] text-slate-400">
                Need a new invitation? Contact your organization administrator or email{" "}
                <a href="mailto:operations@ronsbergerhmo.io" className="text-[#0F6E56] font-medium hover:underline">
                  operations@ronsbergerhmo.io
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Registration form
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-[460px] animate-in fade-in duration-300">
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
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Complete Registration
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Set up your credentials for Ronsberger HMO Portal
              </p>
              {tokenEmail && (
                <p className="mt-2 text-xs font-mono font-semibold text-[#0F6E56] bg-emerald-50 py-1 px-2.5 rounded-lg inline-block border border-emerald-100">
                  {tokenEmail}
                </p>
              )}
            </div>

            <form onSubmit={handleCompleteRegistration} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-semibold text-slate-700">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                    className="h-11 pl-10 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Create Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                    required
                    className="h-11 pl-10 pr-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm transition-all"
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
                <Label htmlFor="confirmPassword" className="text-xs font-semibold text-slate-700">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    required
                    className="h-11 pl-10 pr-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm transition-all"
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

              {tokenRole === "hospital" && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="hospitalName" className="text-xs font-semibold text-slate-700">
                    Hospital Facility Name
                  </Label>
                  {tokenHospitalId ? (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200/80">
                      <Building2 className="h-4 w-4 text-[#0F6E56] shrink-0" />
                      <p className="text-xs font-semibold text-[#0F6E56]">
                        Pre-assigned facility linked to your invite
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="hospitalName"
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        placeholder="As registered with NHIA"
                        required
                        className="h-11 pl-10 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#0F6E56] focus:ring-2 focus:ring-[#0F6E56]/15 text-sm transition-all"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Legal & Consent Checkboxes */}
              <div className="space-y-3.5 pt-3.5 pb-1 border-t border-slate-100">
                <label htmlFor="terms" className="flex items-start gap-3 cursor-pointer select-none group">
                  <Checkbox 
                    id="terms" 
                    checked={acceptTerms} 
                    onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border-slate-300 data-[state=checked]:bg-[#0F6E56] data-[state=checked]:border-[#0F6E56] !h-4 !w-4 !min-h-[16px] !max-h-[16px] !min-w-[16px] !max-w-[16px]"
                  />
                  <span className="text-xs font-normal text-slate-600 leading-snug">
                    I agree to the{" "}
                    <Link to="/terms-of-service" className="font-semibold text-[#0F6E56] hover:underline" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="/privacy-policy" className="font-semibold text-[#0F6E56] hover:underline" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      Privacy Policy
                    </Link>.
                  </span>
                </label>

                <label htmlFor="privacy" className="flex items-start gap-3 cursor-pointer select-none group">
                  <Checkbox 
                    id="privacy" 
                    checked={acceptPrivacy} 
                    onCheckedChange={(checked) => setAcceptPrivacy(checked as boolean)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border-slate-300 data-[state=checked]:bg-[#0F6E56] data-[state=checked]:border-[#0F6E56] !h-4 !w-4 !min-h-[16px] !max-h-[16px] !min-w-[16px] !max-w-[16px]"
                  />
                  <span className="text-xs font-normal text-slate-600 leading-snug">
                    I consent to the processing of authorized healthcare data under GDPR/NDPR standards.
                  </span>
                </label>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading || !acceptTerms || !acceptPrivacy}
                  className="h-11 w-full rounded-xl bg-[#0F6E56] hover:bg-[#0a5240] text-sm font-semibold text-white shadow-xs transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <BrandSpinner className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    "Complete Account Setup"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
