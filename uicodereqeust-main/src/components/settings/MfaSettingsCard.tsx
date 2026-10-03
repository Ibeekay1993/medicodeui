import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ShieldAlert, QrCode, Loader2, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MfaSettingsCardProps {
  user: any;
  fullName: string | null;
  role?: string | null;
}

export default function MfaSettingsCard({ user, fullName, role }: MfaSettingsCardProps) {
  const { toast } = useToast();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const checkMfaStatus = async () => {
      if (!user) return;
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        console.error("Error listing MFA factors:", error);
        return;
      }
      const activeFactor = data.all.find((f) => f.status === "verified");
      setMfaEnabled(!!activeFactor);
    };

    checkMfaStatus();
  }, [user]);

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      const friendlyName = fullName || user?.email || "User";

      // Clean up any unverified lingering factors to prevent collision
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      if (factorsData?.all) {
        for (const factor of factorsData.all) {
          if (factor.status === "unverified") {
            await supabase.auth.mfa.unenroll({ factorId: factor.id });
          }
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Ronsberger HMO",
        friendlyName,
      });
      if (error) throw error;
      setEnrollData(data);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Enrollment Failed", description: err.message });
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollData) return;
    setIsVerifying(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollData.id,
      });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollData.id,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      toast({ title: "MFA Enabled ✨", description: "Your account is now secured with two-factor authentication." });
      setMfaEnabled(true);
      setEnrollData(null);
      setVerifyCode("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  if (role === "hospital") return null;

  return (
    <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all">
      <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shrink-0">
              {mfaEnabled ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-500" />}
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Two-Factor Authentication (2FA)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Protect your account with Google Authenticator or Authy
              </CardDescription>
            </div>
          </div>
          <div className="self-start sm:self-auto">
            {mfaEnabled ? (
              <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-semibold">
                <CheckCircle2 className="h-3 w-3" /> Secured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-amber-700 bg-amber-50 border-amber-200 font-semibold">
                Not Enabled
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {!enrollData ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/90 border border-slate-100">
            <div className="space-y-1 flex-1 pr-2">
              <p className="text-xs sm:text-sm font-semibold text-slate-900">
                {mfaEnabled ? "Authenticator App Active" : "Add Extra Login Protection"}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {mfaEnabled
                  ? "Your account requires a 6-digit one-time passcode from your authenticator app when signing in."
                  : "Enable 2FA to require a secure verification code from Google Authenticator or Microsoft Authenticator on login."}
              </p>
            </div>
            <div className="w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
              {mfaEnabled ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-lg">
                  <CheckCircle2 className="h-4 w-4" /> Active &amp; Protected
                </div>
              ) : (
                <Button
                  onClick={handleEnroll}
                  disabled={isEnrolling}
                  size="sm"
                  className="w-full sm:w-auto h-9 px-4 text-xs font-semibold bg-brand-700 hover:bg-brand-800 text-white gap-1.5 shadow-sm"
                >
                  {isEnrolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                  Enable 2FA
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80 animate-in fade-in duration-300">
            <div className="text-center space-y-1">
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                Scan QR Code with Authenticator App
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Open Google Authenticator or Authy, scan this barcode, and enter the 6-digit code below.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 items-center justify-center pt-2">
              <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <QRCodeSVG value={enrollData.totp.uri} size={140} level="H" />
              </div>
              <div className="space-y-3 w-full max-w-xs text-center sm:text-left">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600">Enter 6-Digit Code</label>
                  <Input
                    placeholder="000000"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    className="h-11 rounded-xl text-center text-xl font-bold tracking-[0.3em] bg-white border-slate-300"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEnrollData(null)}
                    className="flex-1 h-9 text-xs font-semibold text-slate-600 bg-white"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleVerify}
                    disabled={isVerifying || verifyCode.length !== 6}
                    className="flex-[1.5] h-9 text-xs font-semibold bg-brand-700 hover:bg-brand-800 text-white gap-1"
                  >
                    {isVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
