import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ShieldAlert, QrCode, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MfaSettingsCardProps {
  user: any;
  fullName: string | null;
  autoEnroll?: boolean;
}

export default function MfaSettingsCard({ user, fullName, autoEnroll = false }: MfaSettingsCardProps) {
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
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Ronsberger HMO",
        friendlyName: fullName || user?.email || "User",
      });
      if (error) throw error;
      setEnrollData(data);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Enrollment Failed", description: err.message });
    } finally {
      setIsEnrolling(false);
    }
  };

  useEffect(() => {
    if (autoEnroll && !mfaEnabled && !isEnrolling && !enrollData) {
      handleEnroll();
    }
  }, [autoEnroll, mfaEnabled, enrollData]);

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

      toast({ title: "MFA Enabled", description: "Your account is now secured with two-factor authentication." });
      setMfaEnabled(true);
      setEnrollData(null);
      setVerifyCode("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUnenroll = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.all.find((f) => f.status === "verified");
    if (!factor) return;

    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) {
      toast({ variant: "destructive", title: "Action Failed", description: error.message });
    } else {
      toast({ title: "MFA Disabled", description: "Two-factor authentication has been removed." });
      setMfaEnabled(false);
    }
  };

  return (
    <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden">
      <CardHeader className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">
          Two-Factor Authentication
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {!enrollData ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  mfaEnabled ? "bg-emerald-50 text-emerald-500" : "bg-slate-50 text-slate-300"
                )}
              >
                {mfaEnabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-xs font-black uppercase text-slate-700">Two-Factor Authentication</p>
                <p className="text-xs font-medium text-slate-400">
                  {mfaEnabled ? "Active — secured with authenticator app" : "Not enabled — add extra login security"}
                </p>
              </div>
            </div>
            {mfaEnabled ? (
              <Button
                variant="outline"
                onClick={handleUnenroll}
                className="h-8 px-4 shrink-0 rounded-lg text-xs font-black uppercase tracking-widest border-rose-100 text-rose-600 hover:bg-rose-50"
              >
                Disable
              </Button>
            ) : (
              <Button
                onClick={handleEnroll}
                disabled={isEnrolling}
                className="h-8 px-4 shrink-0 rounded-lg text-xs font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-black gap-1.5"
              >
                {isEnrolling ? <Loader2 className="h-3 w-3 animate-spin" /> : <QrCode className="h-3 w-3" />}
                Enable
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-300">
            <p className="text-xs font-black uppercase text-slate-500 text-center">
              Scan QR with Google Authenticator or Authy, then enter the 6-digit code
            </p>
            <div className="flex gap-4 items-center justify-center">
              <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-inner">
                {/* Use the URI rather than the raw SVG string to prevent Data Too Long errors */}
                <QRCodeSVG value={enrollData.totp.uri} size={120} level="H" />
              </div>
              <div className="space-y-2 flex-1 max-w-[200px]">
                <Input
                  placeholder="000000"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  className="h-10 rounded-xl text-center text-lg font-black tracking-[0.4em] bg-slate-50 border-slate-200"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setEnrollData(null)}
                    className="flex-1 h-8 rounded-lg text-xs font-black uppercase border-slate-100"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleVerify}
                    disabled={isVerifying || verifyCode.length !== 6}
                    className="flex-[2] h-8 rounded-lg text-xs font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                  >
                    {isVerifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Verify
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
