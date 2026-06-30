import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function MfaSetup() {
  const { session, user, fullName, role } = useAuth();
  const { toast } = useToast();
  
  const [mfaVerified, setMfaVerified] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  
  const [enrollData, setEnrollData] = useState<any>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [initError, setInitError] = useState("");
  
  useEffect(() => {
    async function initMfa() {
      if (!session || !user) {
        setChecking(false);
        return;
      }
      
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && data) {
        if (data.nextLevel === "aal2" && data.currentLevel === "aal2") {
          setMfaVerified(true);
          setChecking(false);
          return;
        }
      }
      
      setMfaVerified(false);
      
      try {
        // Use a generic name instead of the user's email to prevent email exposure in the Authenticator App
        const friendlyName = "Authorized User";
        
        // Clean up unverified lingering factors
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        if (factorsData?.all) {
          for (const factor of factorsData.all) {
            if (factor.status === "unverified" && factor.friendly_name === friendlyName) {
              await supabase.auth.mfa.unenroll({ factorId: factor.id });
            }
          }
        }
        
        const { data: enrollRes, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          issuer: "Ronsberger HMO",
          friendlyName,
        });
        
        if (enrollErr) throw enrollErr;
        setEnrollData(enrollRes);
      } catch (err: any) {
        setInitError(err.message);
      }
      
      setChecking(false);
    }
    
    initMfa();
  }, [session, user, fullName]);
  
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

      toast({ title: "Setup Complete", description: "Your account is now secured." });
      setMfaVerified(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Verification Failed", description: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  if (!session) return <Navigate to="/login" replace />;
  
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  if (mfaVerified) {
    if (role === "hospital") return <Navigate to="/dashboard" replace />;
    if (role === "claims") return <Navigate to="/backoffice/claims" replace />;
    if (role === "admin") return <Navigate to="/backoffice/admin" replace />;
    if (role === "finance") return <Navigate to="/backoffice/finance" replace />;
    return <Navigate to="/backoffice/utilization-manager" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 px-6 py-8 text-center text-white">
          <h1 className="text-2xl font-bold">MFA Setup Required</h1>
          <p className="text-slate-300 mt-2 text-sm">
            Your organization requires Multi-Factor Authentication to access the system.
          </p>
        </div>
        
        <div className="p-6">
          {initError ? (
            <div className="text-center text-rose-500 font-medium">
              Error initializing setup: {initError}
            </div>
          ) : !enrollData ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : (
            <div className="space-y-6 flex flex-col items-center">
              <p className="text-sm font-medium text-slate-600 text-center">
                Scan this QR code with Google Authenticator or Authy, then enter the 6-digit code below.
              </p>
              
              <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-inner inline-block">
                <QRCodeSVG value={enrollData.totp.uri} size={160} level="H" />
              </div>
              
              <div className="w-full space-y-3">
                <Input
                  placeholder="000000"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                  className="h-12 rounded-xl text-center text-2xl font-black tracking-[0.5em] bg-slate-50 border-slate-200"
                />
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying || verifyCode.length !== 6}
                  className="w-full h-12 rounded-xl text-sm font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Verify & Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
