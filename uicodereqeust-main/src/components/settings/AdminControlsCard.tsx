import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ToggleLeft, ToggleRight, FileSpreadsheet, Mail, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminControlsCardProps {
  user: any;
}

export default function AdminControlsCard({ user }: AdminControlsCardProps) {
  const { toast } = useToast();

  // Administrative Global MFA Policy state
  const [enforceMfaPolicy, setEnforceMfaPolicy] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Daily Pre-Auth Report Email state
  const [reportEmail, setReportEmail] = useState("afolayanibukun33@gmail.com");
  const [reportEnabled, setReportEnabled] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTriggeringReport, setIsTriggeringReport] = useState(false);

  const fetchGlobalPolicies = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("global_policies")
        .select("*")
        .eq("key", "enforce_mfa")
        .single();
      if (error) throw error;
      setEnforceMfaPolicy(!!(data as any).value?.enforced);
    } catch (e) {
      console.error("Failed to load global MFA policy:", e);
    }
  };

  const fetchReportSettings = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("global_policies")
        .select("*")
        .eq("key", "daily_report_settings")
        .maybeSingle();
      if (error) throw error;
      if (data && (data as any).value) {
        setReportEmail((data as any).value.email || "afolayanibukun33@gmail.com");
        setReportEnabled((data as any).value.enabled !== false);
      }
    } catch (e) {
      console.error("Failed to load daily report settings:", e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGlobalPolicies();
      fetchReportSettings();
    }
  }, [user]);

  const handleToggleMfaPolicy = async () => {
    setSavingPolicy(true);
    try {
      const { error } = await (supabase as any)
        .from("global_policies")
        .update({
          value: { enforced: !enforceMfaPolicy },
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq("key", "enforce_mfa");
      if (error) throw error;
      setEnforceMfaPolicy(!enforceMfaPolicy);
      toast({
        title: "Security Policy Updated",
        description: `MFA Enforcement has been ${!enforceMfaPolicy ? "ENABLED" : "DISABLED"} globally.`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Policy update failed", description: e.message });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSaveReportSettings = async () => {
    setIsSavingSettings(true);
    try {
      const { error } = await (supabase as any)
        .from("global_policies")
        .upsert(
          {
            key: "daily_report_settings",
            value: { email: reportEmail.trim(), enabled: reportEnabled },
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) throw error;
      toast({
        title: "Report Settings Saved",
        description: `Daily pre-auth report email address updated to ${reportEmail.trim()}.`,
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to save settings", description: e.message });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTriggerReport = async () => {
    setIsTriggeringReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-report", {
        body: { force: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({
        title: "✅ Test Report Sent",
        description: data?.message || `Check ${reportEmail} for the test email.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Test Send Failed",
        description: e.message || "Unknown error. Check Supabase function logs.",
      });
    } finally {
      setIsTriggeringReport(false);
    }
  };

  return (
    <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden">
      <CardHeader className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/50">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">
          Administrative Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-slate-50">
        {/* MFA Policy row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                enforceMfaPolicy ? "bg-rose-50 text-rose-500" : "bg-slate-50 text-slate-400"
              )}
            >
              <Lock className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase text-slate-700 flex items-center gap-2">
                Global MFA Enforcement
                <Badge
                  className={cn(
                    "border-none text-xs font-black uppercase py-0 px-1.5",
                    enforceMfaPolicy ? "bg-rose-50 text-rose-600 animate-pulse" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {enforceMfaPolicy ? "ENFORCED" : "OPTIONAL"}
                </Badge>
              </div>
              <p className="text-xs font-medium text-slate-400 truncate">
                Forces all admin roles to activate 2FA before accessing the dashboard
              </p>
            </div>
          </div>
          <Button
            onClick={handleToggleMfaPolicy}
            disabled={savingPolicy}
            className={cn(
              "h-8 px-4 shrink-0 rounded-lg text-xs font-black uppercase tracking-widest transition-all gap-1.5",
              enforceMfaPolicy ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-slate-900 hover:bg-black text-white"
            )}
          >
            {savingPolicy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : enforceMfaPolicy ? (
              <>
                <ToggleRight className="h-4 w-4" />
                Disable
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4" />
                Enable
              </>
            )}
          </Button>
        </div>

        {/* Daily report toggle row */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                reportEnabled ? "bg-emerald-50 text-emerald-500" : "bg-slate-50 text-slate-400"
              )}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase text-slate-700 flex items-center gap-2">
                Daily Pre-Auth Email Report
                <Badge
                  className={cn(
                    "border-none text-xs font-black uppercase py-0 px-1.5",
                    reportEnabled ? "bg-emerald-50 text-emerald-600 animate-pulse" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {reportEnabled ? "ACTIVE" : "PAUSED"}
                </Badge>
              </div>
              <p className="text-xs font-medium text-slate-400">
                Sends CSV summary to recipient email at 12:00 AM WAT daily
              </p>
            </div>
          </div>
          <Button
            onClick={() => setReportEnabled(!reportEnabled)}
            variant="ghost"
            className="h-8 px-3 shrink-0 rounded-lg text-xs font-black uppercase tracking-widest border border-slate-100 gap-1.5 hover:bg-slate-50"
          >
            {reportEnabled ? (
              <>
                <ToggleRight className="h-4 w-4 text-emerald-600" />
                On
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4 text-slate-400" />
                Off
              </>
            )}
          </Button>
        </div>

        {/* Email input + actions row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="h-7 w-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <Mail className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-xs font-black uppercase text-slate-400">Recipient Email</Label>
            <Input
              type="email"
              placeholder="enter email address"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              className="h-8 mt-1 rounded-lg text-xs font-bold bg-slate-50 border-none"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={handleSaveReportSettings}
              disabled={isSavingSettings}
              className="h-8 px-4 rounded-lg text-xs font-black uppercase tracking-widest bg-slate-900 hover:bg-black text-white"
            >
              {isSavingSettings ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
            <Button
              onClick={handleTriggerReport}
              disabled={isTriggeringReport}
              variant="outline"
              className="h-8 px-4 rounded-lg text-xs font-black uppercase tracking-widest border-slate-200 text-slate-700 hover:bg-slate-50 gap-1"
            >
              {isTriggeringReport ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" />
                  Test
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
