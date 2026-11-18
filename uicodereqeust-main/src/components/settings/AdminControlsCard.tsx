import { BrandSpinner } from "@/components/BrandSpinner";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Mail, Play, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_DAILY_REPORT_RECIPIENTS,
  parseReportRecipientFields,
  splitReportRecipientValues,
} from "../../../supabase/functions/_shared/report-recipients";

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
  const [reportEmails, setReportEmails] = useState<string[]>([""]);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [reportEnabled, setReportEnabled] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isTriggeringReport, setIsTriggeringReport] = useState(false);

  // Monthly Executive SLA Report state
  const [monthlyEmails, setMonthlyEmails] = useState<string[]>([""]);
  const [monthlyRecipientError, setMonthlyRecipientError] = useState<string | null>(null);
  const [monthlyEnabled, setMonthlyEnabled] = useState(true);
  const [isSavingMonthlySettings, setIsSavingMonthlySettings] = useState(false);
  const [isTriggeringMonthlyReport, setIsTriggeringMonthlyReport] = useState(false);

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
        const settings = (data as any).value;
        const savedEmails = splitReportRecipientValues(settings.emails ?? settings.email ?? []);
        setReportEmails(savedEmails.length > 0 ? savedEmails : [""]);
        setReportEnabled((data as any).value.enabled !== false);
      }
    } catch (e) {
      console.error("Failed to load daily report settings:", e);
    }

    try {
      const { data: monthlyData, error: monthlyError } = await (supabase as any)
        .from("global_policies")
        .select("*")
        .eq("key", "monthly_report_settings")
        .maybeSingle();
      if (monthlyError) throw monthlyError;
      if (monthlyData && (monthlyData as any).value) {
        const settings = (monthlyData as any).value;
        const savedEmails = splitReportRecipientValues(settings.emails ?? settings.email ?? []);
        setMonthlyEmails(savedEmails.length > 0 ? savedEmails : [""]);
        setMonthlyEnabled((monthlyData as any).value.enabled !== false);
      }
    } catch (e) {
      console.error("Failed to load monthly report settings:", e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchGlobalPolicies();
      fetchReportSettings();
    }
  }, [user]);

  const handleAddRecipientField = () => {
    if (reportEmails.length >= MAX_DAILY_REPORT_RECIPIENTS) {
      setRecipientError(`Add no more than ${MAX_DAILY_REPORT_RECIPIENTS} recipients.`);
      return;
    }
    setReportEmails((current) => [...current, ""]);
    setRecipientError(null);
  };

  const handleAddMonthlyRecipientField = () => {
    if (monthlyEmails.length >= MAX_DAILY_REPORT_RECIPIENTS) {
      setMonthlyRecipientError(`Add no more than ${MAX_DAILY_REPORT_RECIPIENTS} recipients.`);
      return;
    }
    setMonthlyEmails((current) => [...current, ""]);
    setMonthlyRecipientError(null);
  };

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
    const parsedRecipients = parseReportRecipientFields(reportEmails);
    if (parsedRecipients.multiple.length > 0) {
      setRecipientError("Enter one address in each box. Use + Add for another address.");
      return;
    }
    if (parsedRecipients.invalid.length > 0) {
      setRecipientError(`Correct or remove invalid addresses: ${parsedRecipients.invalid.join(", ")}`);
      return;
    }
    if (parsedRecipients.tooMany) {
      setRecipientError(`Add no more than ${MAX_DAILY_REPORT_RECIPIENTS} recipients.`);
      return;
    }
    setIsSavingSettings(true);
    try {
      const { error } = await (supabase as any)
        .from("global_policies")
        .upsert(
          {
            key: "daily_report_settings",
            value: { emails: parsedRecipients.recipients, enabled: reportEnabled },
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) throw error;
      toast({
        title: "Report Settings Saved",
        description: parsedRecipients.recipients.length
          ? `Daily report saved for ${parsedRecipients.recipients.length} recipient${parsedRecipients.recipients.length === 1 ? "" : "s"}.`
          : "Daily report recipients cleared. Scheduled delivery will be skipped until an address is added.",
      });
      setRecipientError(null);
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
        title: "Test report sent",
        description: data?.message || "Check the saved report recipients for the test email.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Test Send Failed",
        description: e.message || "Unknown error. Please check the server logs for details.",
      });
    } finally {
      setIsTriggeringReport(false);
    }
  };

  const handleSaveMonthlyReportSettings = async () => {
    if (role !== "admin") return;
    const parsedRecipients = parseReportRecipientFields(monthlyEmails);
    if (parsedRecipients.invalid.length > 0) {
      setMonthlyRecipientError(`Correct or remove invalid addresses: ${parsedRecipients.invalid.join(", ")}`);
      return;
    }
    if (parsedRecipients.tooMany) {
      setMonthlyRecipientError(`Add no more than ${MAX_DAILY_REPORT_RECIPIENTS} recipients.`);
      return;
    }
    setIsSavingMonthlySettings(true);
    try {
      const { error } = await (supabase as any)
        .from("global_policies")
        .upsert(
          {
            key: "monthly_report_settings",
            value: { emails: parsedRecipients.recipients, enabled: monthlyEnabled },
            updated_by: user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      if (error) throw error;
      toast({
        title: "Monthly Report Settings Saved",
        description: parsedRecipients.recipients.length
          ? `Executive monthly report saved for ${parsedRecipients.recipients.length} recipient${parsedRecipients.recipients.length === 1 ? "" : "s"}.`
          : "Monthly report recipients cleared. Scheduled delivery will be skipped until an address is added.",
      });
      setMonthlyRecipientError(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to save monthly settings", description: e.message });
    } finally {
      setIsSavingMonthlySettings(false);
    }
  };

  const handleTriggerMonthlyReport = async () => {
    if (role !== "admin") return;
    setIsTriggeringMonthlyReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("monthly-report", {
        body: { force: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Executive Monthly Report Sent",
        description: data?.message || "Monthly report dispatched to configured recipients.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Monthly Test Send Failed",
        description: e.message || "Unknown error. Please check the server logs for details.",
      });
    } finally {
      setIsTriggeringMonthlyReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Security ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-4 w-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Security</h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-900">Global MFA Enforcement</span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
                  enforceMfaPolicy
                    ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                )}>
                  {enforceMfaPolicy ? "ENFORCED" : "OPTIONAL"}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Require all accounts to complete MFA. Individual exemptions can be set per user.
              </p>
            </div>
            <Button
              onClick={handleToggleMfaPolicy}
              disabled={savingPolicy}
              size="sm"
              className={cn(
                "shrink-0 h-9 px-5 text-xs font-semibold rounded-lg transition-all",
                enforceMfaPolicy
                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                  : "bg-slate-900 hover:bg-black text-white"
              )}
            >
              {savingPolicy
                ? <BrandSpinner className="h-3.5 w-3.5 animate-spin" />
                : enforceMfaPolicy ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Daily Report ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-slate-500" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Daily Report</h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">

          {/* Toggle row */}
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-slate-900">Daily Pre-Auth Email Report</span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
                  reportEnabled
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                )}>
                  {reportEnabled ? "ACTIVE" : "PAUSED"}
                </span>
              </div>
              <p className="text-xs text-slate-500">Sends CSV summary of all pre-auth codes at 12:00 AM WAT.</p>
            </div>
            <Switch
              checked={reportEnabled}
              onCheckedChange={setReportEnabled}
              className="data-[state=checked]:bg-emerald-600 shrink-0"
              aria-label="Toggle daily report"
            />
          </div>

          {/* Recipients */}
          <div className="px-4 py-4 space-y-3">
            <Label className="text-xs font-semibold text-slate-700">Recipients</Label>
            <div className="space-y-2" role="group" aria-label="Daily report recipients">
              {reportEmails.map((email, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="email"
                    aria-label={`Report recipient ${index + 1}`}
                    placeholder="ops@ronsberger.com"
                    value={email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setReportEmails(c => c.map((x, i) => i === index ? v : x));
                      if (recipientError) setRecipientError(null);
                    }}
                    className="h-9 flex-1 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => { setReportEmails(c => c.filter((_, i) => i !== index)); setRecipientError(null); }}
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    aria-label={`Remove report recipient ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {recipientError && <p role="alert" className="text-xs text-rose-600 font-medium">{recipientError}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddRecipientField}
                disabled={reportEmails.length >= MAX_DAILY_REPORT_RECIPIENTS}
                aria-label="Add report recipient"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-slate-600 border border-dashed border-slate-300 hover:border-slate-400 hover:text-slate-900 bg-transparent transition-colors disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add recipient
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <Button
                  onClick={handleTriggerReport}
                  disabled={isTriggeringReport}
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                >
                  {isTriggeringReport
                    ? <BrandSpinner className="h-3.5 w-3.5 animate-spin" />
                    : <><Play className="h-3 w-3 fill-current" /> Test</>}
                </Button>
                <Button
                  onClick={handleSaveReportSettings}
                  disabled={isSavingSettings}
                  size="sm"
                  className="h-9 px-5 text-xs font-semibold bg-slate-900 hover:bg-black text-white"
                >
                  {isSavingSettings ? <BrandSpinner className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Monthly Report ── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-emerald-600" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-700">Monthly Executive Report</h3>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-white overflow-hidden divide-y divide-emerald-50">

          {/* Toggle row */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-emerald-50/40">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-slate-900">Monthly SLA & Intelligence Report</span>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide",
                  monthlyEnabled
                    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                    : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                )}>
                  {monthlyEnabled ? "ACTIVE" : "PAUSED"}
                </span>
              </div>
              <p className="text-xs text-slate-500">Net Approved Value, SLA scorecard, hospital rankings — sent on the 1st at 12:05 AM WAT.</p>
            </div>
            <Switch
              checked={monthlyEnabled}
              onCheckedChange={setMonthlyEnabled}
              className="data-[state=checked]:bg-emerald-600 shrink-0"
              aria-label="Toggle monthly report"
            />
          </div>

          {/* Recipients */}
          <div className="px-4 py-4 space-y-3">
            <Label className="text-xs font-semibold text-slate-700">Executive Recipients</Label>
            <div className="space-y-2" role="group" aria-label="Monthly report recipients">
              {monthlyEmails.map((email, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="email"
                    aria-label={`Monthly report recipient ${index + 1}`}
                    placeholder="executive@ronsberger.com"
                    value={email}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMonthlyEmails(c => c.map((x, i) => i === index ? v : x));
                      if (monthlyRecipientError) setMonthlyRecipientError(null);
                    }}
                    className="h-9 flex-1 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => { setMonthlyEmails(c => c.filter((_, i) => i !== index)); if (monthlyRecipientError) setMonthlyRecipientError(null); }}
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    aria-label={`Remove monthly report recipient ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {monthlyRecipientError && <p role="alert" className="text-xs text-rose-600 font-medium">{monthlyRecipientError}</p>}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAddMonthlyRecipientField}
                disabled={monthlyEmails.length >= MAX_DAILY_REPORT_RECIPIENTS}
                aria-label="Add monthly report recipient"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-emerald-700 border border-dashed border-emerald-300 hover:border-emerald-500 hover:text-emerald-900 bg-transparent transition-colors disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add recipient
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <Button
                  onClick={handleTriggerMonthlyReport}
                  disabled={isTriggeringMonthlyReport}
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-xs font-semibold border-emerald-300 text-emerald-700 hover:bg-emerald-50 gap-1.5"
                >
                  {isTriggeringMonthlyReport
                    ? <BrandSpinner className="h-3.5 w-3.5 animate-spin" />
                    : <><Play className="h-3 w-3 fill-current" /> Test</>}
                </Button>
                <Button
                  onClick={handleSaveMonthlyReportSettings}
                  disabled={isSavingMonthlySettings}
                  size="sm"
                  className="h-9 px-5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {isSavingMonthlySettings ? <BrandSpinner className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
