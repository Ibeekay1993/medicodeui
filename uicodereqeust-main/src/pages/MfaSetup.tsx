import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MfaSettingsCard from "@/components/settings/MfaSettingsCard";
import { supabase } from "@/integrations/supabase/client";

export default function MfaSetup() {
  const { session, user, fullName, role } = useAuth();
  const [mfaVerified, setMfaVerified] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    async function checkMfa() {
      if (!session) {
        setChecking(false);
        return;
      }
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && data) {
        if (data.nextLevel === "aal2" && data.currentLevel === "aal2") {
          setMfaVerified(true);
        } else {
          setMfaVerified(false);
        }
      } else {
        setMfaVerified(false);
      }
      setChecking(false);
    }
    
    checkMfa();
  }, [session]);
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  
  if (mfaVerified) {
    // Already verified, send to their role dashboard
    if (role === "hospital") return <Navigate to="/dashboard" replace />;
    if (role === "claims") return <Navigate to="/backoffice/claims" replace />;
    if (role === "admin") return <Navigate to="/backoffice/admin" replace />;
    if (role === "finance") return <Navigate to="/backoffice/finance" replace />;
    return <Navigate to="/backoffice/utilization-manager" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">MFA Setup Required</h1>
          <p className="text-slate-600 mt-2">
            Your organization requires Multi-Factor Authentication (MFA) to access the system. Please set it up below to continue.
          </p>
        </div>
        
        {user && (
          <MfaSettingsCard user={user} fullName={fullName || user?.email || ""} />
        )}
        
        <div className="mt-8 text-center">
          <button 
            onClick={() => window.location.reload()}
            className="text-primary font-medium hover:underline"
          >
            I have completed the setup
          </button>
        </div>
      </div>
    </div>
  );
}
