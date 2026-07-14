import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ConsentSettingsCard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);
  const [latestConsent, setLatestConsent] = useState<{ action: string; created_at: string } | null>(null);

  useEffect(() => {
    async function fetchConsent() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data, error } = await supabase
          .from("consent_logs")
          .select("action, created_at")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setLatestConsent(data as any);
        }
      } catch (e) {
        console.error("Failed to load consent logs", e);
      } finally {
        setLoading(false);
      }
    }
    fetchConsent();
  }, []);

  const handleRevoke = async () => {
    try {
      setRevoking(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { error } = await supabase
        .from("consent_logs")
        .insert([{
          user_id: session.user.id,
          action: "withdraw",
          policy_version: "2026-07"
        } as any]);

      if (error) throw error;

      localStorage.removeItem("cookie-consent");
      
      toast({
        title: "Consent Withdrawn",
        description: "Your consent has been securely revoked. You will now be signed out.",
      });

      // Sign out and redirect to home after 1.5 seconds
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/");
      }, 1500);

    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Failed to revoke consent", description: e.message });
      setRevoking(false);
    }
  };

  const isWithdrawn = latestConsent?.action === "withdraw";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center space-x-2">
          <ShieldAlert className="h-5 w-5 text-slate-500" />
          <span>Privacy & Consent</span>
        </CardTitle>
        <CardDescription>
          Manage your GDPR/NDPR data processing consent and cookies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center space-x-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading status...</span>
          </div>
        ) : latestConsent ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Status:</span>
              <span className={`text-sm font-bold ${isWithdrawn ? "text-red-600" : "text-lime-600"}`}>
                {isWithdrawn ? "Withdrawn" : "Consented"}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-sm">Last Updated:</span>
              <span className="text-sm">
                {new Date(latestConsent.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">No consent history found.</div>
        )}
      </CardContent>
      <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-between items-center">
        <p className="text-xs text-slate-500 max-w-[60%]">
          Revoking consent will restrict your account's data processing and sign you out immediately.
        </p>
        <Button 
          variant="destructive" 
          onClick={handleRevoke} 
          disabled={loading || revoking || isWithdrawn}
        >
          {revoking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Revoke Consent
        </Button>
      </CardFooter>
    </Card>
  );
}
