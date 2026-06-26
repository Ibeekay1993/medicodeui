import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Lock, Building2, ShieldAlert } from "lucide-react";

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

// ---------------------------------------------------------------------------
export default function Register() {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [loading, setLoading] = useState(false);

  // Role, email, hospital decoded from JWT payload on page load
  const [tokenRole, setTokenRole] = useState<string | null>(null);
  const [tokenHospitalId, setTokenHospitalId] = useState<string | null>(null);
  const [tokenEmail, setTokenEmail] = useState<string | null>(null);

  // Invitation tokens stored strictly in memory
  const [pendingTokens, setPendingTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);


  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sessionResolving, setSessionResolving] = useState(true);

  const { toast } = useToast();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // On mount: validate token, clear old session, verify invitation status.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const hash = window.location.hash || "";
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";

    if (!accessToken || !refreshToken) {
      setInviteError(
        "Registration session expired or link is missing. Please reopen your invitation email and click the invitation link again."
      );
      setSessionResolving(false);
      return;
    }

    // Immediately clear URL hash to prevent token leakage/reuse on refresh
    window.history.replaceState(null, "", window.location.pathname);

    const validateAndPrepare = async () => {
      try {
        // Step 4: Force Logout Existing Session to enter a clean unauthenticated state
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});

        // Validate JWT expiry client-side first
        if (isJwtExpired(accessToken)) {
          setInviteError(
            "This invitation link has expired. Please contact your administrator to resend the invitation."
          );
          setSessionResolving(false);
          return;
        }

        // Step 5: Validate Invitation Token server-side
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

        // Step 6: Verify Invitation Status from DB
        const { data: inviteStatusData, error: statusError } = await (supabase as any).rpc("check_invite_status", {
          p_user_id: userId,
        });

        const inviteRows = inviteStatusData as any[] | null;

        if (statusError || !inviteRows || inviteRows.length === 0) {
          setInviteError(
            "This invitation link is invalid or has expired. Please contact your administrator for a new invitation."
          );
          setSessionResolving(false);
          return;
        }

        const statusRow = inviteRows[0];
        if (statusRow.invite_status !== "pending" || statusRow.onboarding_completed === true) {
          setInviteError(
            "This invitation has already been used. Please log in using your email and password."
          );
          setSessionResolving(false);
          return;
        }

        // Step 7: Store tokens strictly in memory React state (not localStorage/sessionStorage/cookies)
        setTokenRole(statusRow.role || null);
        setTokenHospitalId(statusRow.hospital_id || null);
        setTokenEmail(userEmail);
        setPendingTokens({ accessToken, refreshToken });

        const metadata = (userData.user.user_metadata as Record<string, any>) || {};
        if (metadata.full_name) {
          setFullName(metadata.full_name);
        }


      } catch (e: any) {
        setInviteError("An error occurred while validating your invitation. Please try again.");
      } finally {
        setSessionResolving(false);
      }
    };

    validateAndPrepare();
  }, []);

  // ---------------------------------------------------------------------------
  // Complete Account Setup
  // ---------------------------------------------------------------------------
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Full name is required." });
      return;
    }
    // Minimum 8 characters
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
    if (!pendingTokens) {
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Registration session has expired. Please reopen the invitation email.",
      });
      return;
    }

    setLoading(true);
    let sessionEstablished = false;

    try {
      // Step 2: Establish Supabase Session ONLY after validation succeeds
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: pendingTokens.accessToken,
        refresh_token: pendingTokens.refreshToken,
      });

      if (sessionError || !sessionData?.session) {
        throw new Error(
          sessionError?.message || "Failed to establish registration session. Please reopen the invitation link."
        );
      }

      sessionEstablished = true;
      const userId = sessionData.session.user.id;
      const email = sessionData.session.user.email || "";

      // Complete Onboarding: Update auth user details (password and metadata)
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          full_name: fullName.trim(),
        },
      });
      if (updateError) throw updateError;

      // Step 5: Hospital linking/provisioning
      let linkedHospitalId = tokenHospitalId;

      if (tokenRole === "hospital") {
        if (tokenHospitalId) {
          // Pre-assigned by admin — link user to existing hospital
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

      // Mark Invitation Consumed: Update user_roles with onboarding metadata
      const { error: roleUpdateError } = await supabase
        .from("user_roles")
        .update({
          full_name: fullName.trim(),
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          invite_status: "completed",
          hospital_id: linkedHospitalId,
        } as any)
        .eq("user_id", userId);

      if (roleUpdateError) throw roleUpdateError;

      toast({
        title: "Registration Complete",
        description: "Your account is ready. Welcome to Ronsberger HMO!",
      });

      // Clear pending tokens from state
      setPendingTokens(null);
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
      });

      // Failure Rollback: Clear any partial session/authentication
      if (sessionEstablished) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
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
        <Loader2 className="h-8 w-8 animate-spin text-[#93c34b]" />
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
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-2xl bg-amber-50 shadow-xl shadow-amber-500/10 border border-amber-200">
                <ShieldAlert className="h-7 w-7 text-amber-600" />
              </div>
              <CardTitle className="text-2xl font-black text-slate-900 uppercase italic">
                Invitation <span className="text-amber-600">Error</span>
              </CardTitle>
              <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                Setup Failed
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 text-center space-y-6">
              <p className="text-sm font-semibold text-slate-600 leading-relaxed">{inviteError}</p>
              <Button
                onClick={() => navigate("/login")}
                className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all"
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Registration form
  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-50 font-sans py-12 px-4">
      <div className="max-w-md mx-auto">
        <Card className="rounded-2xl shadow-2xl border-slate-200 bg-white overflow-hidden">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-[80px] w-[80px] items-center justify-center rounded-2xl bg-white border border-slate-100 shadow-xl p-2 overflow-hidden">
              <img src="/ronsberger-logo.png" alt="Ronsberger HMO Logo" className="h-full w-full object-contain" />
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 uppercase italic">
              Complete <span className="text-[#93c34b]">Registration</span>
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
              Finalize your Ronsberger HMO access
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleCompleteRegistration} className="space-y-5" autoComplete="off">
              {/* Hidden dummy fields to absorb browser credential autofill */}
              <input
                type="text"
                name="email"
                value={tokenEmail || ""}
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

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-xs font-black uppercase tracking-widest text-slate-700 ml-1">
                  Full Name
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-100 font-bold"
                    autoComplete="new-name"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-slate-700 ml-1">
                  Create Password
                </Label>
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-xs font-black uppercase tracking-widest text-slate-700 ml-1">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-100 font-bold"
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              {tokenRole === "hospital" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label htmlFor="hospitalName" className="text-xs font-black uppercase tracking-widest text-slate-700 ml-1">
                    NHIA Hospital Name
                  </Label>
                  {tokenHospitalId ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <p className="text-xs font-semibold text-emerald-700">
                        Hospital account pre-configured by administrator
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        id="hospitalName"
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                        placeholder="As on NHIA Registration"
                        className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-100 font-bold"
                        autoComplete="off"
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all mt-4"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  "Complete Account Setup"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
