import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Calendar } from "lucide-react";
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
    <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all">
      <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shrink-0">
            {isWithdrawn ? <ShieldAlert className="h-5 w-5 text-rose-500" /> : <ShieldCheck className="h-5 w-5 text-emerald-600" />}
          </div>
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Privacy &amp; Data Consent
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Manage your NDPR &amp; healthcare data processing preferences
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center space-x-2 text-xs text-slate-500 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand-700" />
            <span>Checking consent status...</span>
          </div>
        ) : latestConsent ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="text-xs font-semibold text-slate-500">Status:</span>
              <Badge className={`text-xs font-bold ${isWithdrawn ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`} variant="outline">
                {isWithdrawn ? "Withdrawn" : "Consented"}
              </Badge>
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 text-slate-500 text-xs">
              <span className="font-semibold flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" /> Recorded:
              </span>
              <span className="font-medium text-slate-700">
                {new Date(latestConsent.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 py-1">No consent history found.</div>
        )}
      </CardContent>

      <CardFooter className="bg-slate-50/80 p-4 sm:p-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
          Revoking consent will restrict healthcare data access and log you out immediately.
        </p>
        <Button 
          variant="destructive" 
          size="sm"
          onClick={handleRevoke} 
          disabled={loading || revoking || isWithdrawn}
          className="w-full sm:w-auto text-xs font-semibold px-4 h-9 shadow-sm shrink-0"
        >
          {revoking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          Revoke Consent
        </Button>
      </CardFooter>
    </Card>
  );
}
