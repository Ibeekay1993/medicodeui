import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, FileSpreadsheet, Mail, Play, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminControlsCardProps {
  user: any;
}

export default function AdminControlsCard({ user }: AdminControlsCardProps) {
  const { toast } = useToast();
  const { role } = useAuth();

  // Administrative Global MFA Policy state
  const [enforceMfaPolicy, setEnforceMfaPolicy] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Daily Pre-Auth Report Email state
  const [reportEmail, setReportEmail] = useState("");
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
        setReportEmail((data as any).value.email || "");
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
    if (role !== "admin") return;
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
    if (role !== "admin") return;
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
    if (role !== "admin") return;
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
    <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all">
      <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Administrative Controls
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Global system security policies and scheduled reporting
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Row 1: MFA Policy */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50/90 border border-slate-100">
          <div className="space-y-1 flex-1 pr-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Global MFA Enforcement
              </span>
              <Badge
                className={cn(
                  "text-[10px] font-bold py-0.5 px-2",
                  enforceMfaPolicy ? "bg-rose-100 text-rose-700 border-rose-200" : "bg-slate-200 text-slate-700 border-slate-300"
                )}
                variant="outline"
              >
                {enforceMfaPolicy ? "ENFORCED" : "OPTIONAL"}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Forces all admin and manager roles to activate 2FA before accessing portal dashboards.
            </p>
          </div>
          <div className="w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 flex justify-end">
            <Button
              onClick={handleToggleMfaPolicy}
              disabled={savingPolicy}
              size="sm"
              className={cn(
                "w-full sm:w-auto h-9 px-4 text-xs font-semibold shadow-sm transition-all",
                enforceMfaPolicy ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-slate-900 hover:bg-black text-white"
              )}
            >
              {savingPolicy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : enforceMfaPolicy ? (
                "Disable Policy"
              ) : (
                "Enable Policy"
              )}
            </Button>
          </div>
        </div>

        {/* Row 2: Daily Pre-Auth Report Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50/90 border border-slate-100">
          <div className="space-y-1 flex-1 pr-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-900">
                Daily Pre-Auth Email Report
              </span>
              <Badge
                className={cn(
                  "text-[10px] font-bold py-0.5 px-2",
                  reportEnabled ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-slate-200 text-slate-700 border-slate-300"
                )}
                variant="outline"
              >
                {reportEnabled ? "ACTIVE" : "PAUSED"}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Dispatches automated CSV summaries of daily authorization codes at 12:00 AM WAT.
            </p>
          </div>
          <div className="w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 flex items-center justify-between sm:justify-end gap-3">
            <span className="text-xs font-semibold text-slate-600 sm:hidden">
              {reportEnabled ? "Active" : "Paused"}
            </span>
            <Switch
              checked={reportEnabled}
              onCheckedChange={setReportEnabled}
              className="data-[state=checked]:bg-emerald-600"
              aria-label="Toggle daily report"
            />
          </div>
        </div>

        {/* Row 3: Recipient Email Configuration */}
        <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-slate-500" />
            <Label className="text-xs sm:text-sm font-bold text-slate-900">
              Report Recipient Email
            </Label>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <Input
              type="email"
              placeholder="e.g. reports@ronsberger.com"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              className="h-10 rounded-xl text-xs sm:text-sm font-medium bg-white border-slate-200 text-slate-900 flex-1 shadow-sm"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSaveReportSettings}
                disabled={isSavingSettings}
                size="sm"
                className="flex-1 sm:flex-none h-10 px-4 text-xs font-semibold bg-slate-900 hover:bg-black text-white shadow-sm"
              >
                {isSavingSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button
                onClick={handleTriggerReport}
                disabled={isTriggeringReport}
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none h-10 px-4 text-xs font-semibold border-slate-300 text-slate-700 bg-white hover:bg-slate-100 gap-1.5 shadow-sm"
              >
                {isTriggeringReport ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="h-3 w-3 fill-current" />
                    <span>Test Send</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
