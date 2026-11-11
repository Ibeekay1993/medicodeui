import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Check, FileText, ShieldCheck } from "lucide-react";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseFunctionResponseMessage } from "@/lib/supabaseFunctionErrors";

function homeForRole(role: string | null) {
  if (role === "hospital") return "/dashboard";
  if (role === "admin") return "/backoffice/admin";
  if (role === "claims" || role === "claims_lead") return "/backoffice/claims";
  if (role === "finance") return "/backoffice/finance";
  if (role === "utilization_manager" || role === "utilization_manager_lead") return "/backoffice/utilization-manager";
  return "/login";
}

export default function CompleteProvisionedAccount() {
  const { session, user, role, fullName, hospitalId, loading, accountSetupRequired, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState(fullName || String(user?.user_metadata?.full_name || ""));
  const [hospitalName, setHospitalName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentSaved, setConsentSaved] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (fullName && !name) setName(fullName);
  }, [fullName, name]);

  useEffect(() => {
    if (consentSaved && !accountSetupRequired) navigate(homeForRole(role), { replace: true });
  }, [consentSaved, accountSetupRequired, role, navigate]);

  if (loading) return <BrandSpinner className="h-8 w-8" label="Checking account setup…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (!accountSetupRequired) return <Navigate to={homeForRole(role)} replace />;

  const needsHospitalName = role === "hospital" && !hospitalId;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("Enter your full name to continue.");
      return;
    }
    if (needsHospitalName && !hospitalName.trim()) {
      setFormError("Enter your hospital name to continue.");
      return;
    }
    if (!acceptedTerms || !acceptedPrivacy) {
      setFormError("Accept both the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("complete-provisioned-account", {
        body: {
          fullName: name.trim(),
          hospitalName: hospitalName.trim(),
          acceptedTerms,
          acceptedPrivacy,
        },
      });
      if (error || data?.success !== true) {
        throw new Error(await getSupabaseFunctionResponseMessage(
          data,
          error,
          "The account setup service could not complete the request. Please retry or contact your administrator.",
        ));
      }

      await refreshProfile();
      toast({ title: "Account ready", description: "Your consent is recorded. You can now access the portal." });
      setConsentSaved(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Account setup could not be completed. Please retry.";
      setFormError(message);
      toast({ variant: "destructive", title: "Could not complete setup", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-xl border-slate-200 shadow-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold text-slate-900">Complete account setup</CardTitle>
            <CardDescription className="mt-1 text-sm leading-relaxed text-slate-600">
              Confirm your profile and accept the required policies before opening portal records.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="setup-email">Account email</Label>
              <Input id="setup-email" value={user?.email || ""} readOnly className="bg-slate-50 text-slate-600" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-full-name">Full name</Label>
              <Input id="setup-full-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required />
            </div>
            {needsHospitalName && (
              <div className="space-y-2">
                <Label htmlFor="setup-hospital-name">Hospital name</Label>
                <Input id="setup-hospital-name" autoComplete="organization" value={hospitalName} onChange={(event) => setHospitalName(event.target.value)} maxLength={200} required />
              </div>
            )}

            <section aria-labelledby="required-consent-heading" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <h2 id="required-consent-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" /> Required consent
              </h2>
              <label htmlFor="accept-terms" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700">
                <Checkbox id="accept-terms" checked={acceptedTerms} onCheckedChange={(checked) => setAcceptedTerms(checked === true)} className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px]" />
                <span>I accept the <Link className="font-medium text-emerald-700 underline underline-offset-2" to="/terms-of-service" target="_blank" rel="noreferrer">Terms of Service</Link>.</span>
              </label>
              <label htmlFor="accept-privacy" className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700">
                <Checkbox id="accept-privacy" checked={acceptedPrivacy} onCheckedChange={(checked) => setAcceptedPrivacy(checked === true)} className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px]" />
                <span>I acknowledge the <Link className="font-medium text-emerald-700 underline underline-offset-2" to="/privacy-policy" target="_blank" rel="noreferrer">Privacy Policy</Link>.</span>
              </label>
            </section>

            <p className="text-xs leading-relaxed text-slate-500">
              Your assigned password remains yours to keep. You can change it later using password reset; changing it is optional.
            </p>
            {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p>}
            {consentSaved && accountSetupRequired && (
              <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Consent was saved, but access status has not refreshed yet. Retry the status check in a moment.
                <Button type="button" variant="link" className="ml-1 h-auto p-0 text-amber-900 underline" onClick={() => void refreshProfile()}>Retry</Button>
              </div>
            )}
            <Button type="submit" disabled={submitting || !acceptedTerms || !acceptedPrivacy} className="w-full bg-emerald-700 text-white hover:bg-emerald-800">
              {submitting ? <BrandSpinner className="mr-2 h-4 w-4" label="Saving consent…" /> : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
              Accept and continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
