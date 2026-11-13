import { BrandSpinner } from "@/components/BrandSpinner";
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

  return (
    <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all">
      <CardHeader className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/50">
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

      <CardContent className="p-3 sm:p-4 space-y-3">
        {/* Row 1: MFA Policy */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50/90 border border-slate-100">
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
              When disabled, no account is required to complete MFA. When enabled, MFA can be disabled for individual users from Users.
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
                <BrandSpinner className="h-3.5 w-3.5 animate-spin" />
              ) : enforceMfaPolicy ? (
                "Disable Policy"
              ) : (
                "Enable Policy"
              )}
            </Button>
          </div>
        </div>

        {/* Row 2: Daily Pre-Auth Report Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50/90 border border-slate-100">
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
        <div className="p-3 rounded-xl bg-slate-50/90 border border-slate-100 space-y-2.5">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-slate-500" />
            <Label className="text-xs sm:text-sm font-bold text-slate-900">
              Daily Report Recipients
            </Label>
          </div>

          <p id="report-recipient-help" className="text-xs leading-relaxed text-slate-500">
            Add each address separately; save before testing. Reports contain patient and authorization details. Maximum {MAX_DAILY_REPORT_RECIPIENTS} recipients.
          </p>

          <div role="group" aria-label="Report email recipients" className="space-y-2">
            {reportEmails.map((email, index) => (
              <div key={index} className="flex min-w-0 items-center gap-2">
                <Input
                  type="email"
                  aria-label={`Report recipient ${index + 1}`}
                  aria-describedby="report-recipient-help"
                  placeholder="reports@ronsberger.com"
                  value={email}
                  onChange={(e) => {
                    const value = e.target.value;
                    setReportEmails((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
                    if (recipientError) setRecipientError(null);
                  }}
                  className="h-9 min-w-0 flex-1 rounded-lg bg-white text-sm font-medium text-slate-900 shadow-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove report recipient ${index + 1}`}
                  onClick={() => {
                    setReportEmails((current) => current.filter((_, itemIndex) => itemIndex !== index));
                    setRecipientError(null);
                  }}
                  className="h-11 w-11 shrink-0 text-slate-500 hover:text-rose-700"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={handleAddRecipientField}
            disabled={reportEmails.length >= MAX_DAILY_REPORT_RECIPIENTS}
            variant="outline"
            size="sm"
            aria-label="Add report recipient"
            className="h-9 gap-1.5 border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <Plus className="h-4 w-4" />
            Add recipient
          </Button>

          {recipientError && (
            <p role="alert" className="text-xs font-medium text-rose-700">{recipientError}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={handleSaveReportSettings}
                disabled={isSavingSettings}
                size="sm"
                className="h-11 px-4 text-xs font-semibold bg-slate-900 hover:bg-black text-white shadow-sm"
              >
                {isSavingSettings ? <BrandSpinner className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button
                onClick={handleTriggerReport}
                disabled={isTriggeringReport}
                variant="outline"
                size="sm"
                className="h-11 px-4 text-xs font-semibold border-slate-300 text-slate-700 bg-white hover:bg-slate-100 gap-1.5 shadow-sm"
              >
                {isTriggeringReport ? (
                  <BrandSpinner className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Play className="h-3 w-3 fill-current" />
                    <span>Test Send</span>
                  </>
                )}
              </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
