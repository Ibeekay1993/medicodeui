import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { readSessionJSON, removeSessionItem, writeSessionJSON } from "@/lib/sessionState";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@/components/ui/form";

import {
  TreatmentItem,
  HospitalRequestDraft,
  BRAND_TO_GENERIC,
  DIAGNOSES,
  isValidNigerianPhone,
  isValidPolicyNumber,
  isValidEmail,
  hospitalRequestSchema,
  HospitalRequestFormValues
} from "@/lib/new-request-helpers";

import PatientSection from "@/components/new-request/PatientSection";
import DiagnosisSection from "@/components/new-request/DiagnosisSection";
import PrioritySection from "@/components/new-request/PrioritySection";
import ReferralSection from "@/components/new-request/ReferralSection";
import TreatmentSection from "@/components/new-request/TreatmentSection";

// ─── Shared helper: resolve hospital UUID by name ──────────────────────────
async function findHospitalIdByName(name: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const normalizedInput = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
  try {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .ilike("name", `%${name.trim()}%`)
      .limit(5);

    if (error || !data || data.length === 0) return null;

    // Prefer exact normalized match first
    for (const h of data) {
      const norm = String(h.name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
      if (norm === normalizedInput) return h.id;
    }
    // Fallback: first result
    return data[0].id;
  } catch (err) {
    console.error("findHospitalIdByName error:", err);
    return null;
  }
}

export default function HospitalNewRequest() {
  const { user, hospitalId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [hospital, setHospital] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const draftKey = user?.id ? `ronsberger:hospital-new-request:${user.id}` : null;

  const form = useForm<HospitalRequestFormValues>({
    resolver: zodResolver(hospitalRequestSchema),
    defaultValues: {
      selectedPatient: null,
      patientSearch: "",
      phone: "",
      patientEmail: "",
      noEmail: false,
      diagnoses: [],
      diagnosisSearch: "",
      urgency: "routine",
      referralHospitalId: null,
      referralHospitalName: "",
      treatments: [],
      treatSearch: "",
    },
    mode: "onChange",
  });

  const { watch, setValue, trigger } = form;

  // React-hook-form state mapping for child components
  const selectedPatient = watch("selectedPatient");
  const patientSearch = watch("patientSearch") || "";
  const phone = watch("phone");
  const patientEmail = watch("patientEmail");
  const noEmail = watch("noEmail");
  const diagnoses = watch("diagnoses");
  const diagnosisSearch = watch("diagnosisSearch") || "";
  const urgency = watch("urgency");
  const referralHospitalId = watch("referralHospitalId");
  const referralHospitalName = watch("referralHospitalName") || "";
  const treatments = watch("treatments");
  const treatSearch = watch("treatSearch") || "";

  // Local UI state for comboboxes
  const patientRef = useRef<HTMLDivElement>(null);
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);

  const diagRef = useRef<HTMLDivElement>(null);
  const [diagSuggestions, setDiagSuggestions] = useState<string[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);

  const treatRef = useRef<HTMLDivElement>(null);
  const [treatResults, setTreatResults] = useState<any[]>([]);
  const [treatLoading, setTreatLoading] = useState(false);
  const [treatOpen, setTreatOpen] = useState(false);

  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    if (user) {
      const query = hospitalId
        ? supabase.from("hospitals").select("*").eq("id", hospitalId)
        : supabase.from("hospitals").select("*").eq("user_id", user.id);
      query.maybeSingle().then(({ data }) => setHospital(data));
    }
  }, [user, hospitalId]);

  useEffect(() => {
    if (!draftKey) {
      setDraftReady(true);
      return;
    }

    const draft = readSessionJSON<HospitalRequestDraft>(draftKey);
    if (draft) {
      if (draft.selectedPatient) setValue("selectedPatient", draft.selectedPatient);
      if (draft.patientSearch) setValue("patientSearch", draft.patientSearch);
      if (Array.isArray(draft.diagnoses)) setValue("diagnoses", draft.diagnoses);
      if (draft.diagnosisSearch) setValue("diagnosisSearch", draft.diagnosisSearch);
      if (draft.treatSearch) setValue("treatSearch", draft.treatSearch);
      if (Array.isArray(draft.treatments)) setValue("treatments", draft.treatments);
      if (draft.phone) setValue("phone", draft.phone);
      if (draft.patientEmail) setValue("patientEmail", draft.patientEmail);
      if (draft.patientEmail === "no-email@medicode.com") setValue("noEmail", true);
      if (draft.urgency) setValue("urgency", draft.urgency as any);
      if (draft.referralHospitalId) setValue("referralHospitalId", draft.referralHospitalId);
      if (draft.referralHospitalName) setValue("referralHospitalName", draft.referralHospitalName);
    }
    setDraftReady(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady || !draftKey) return;

    const draft: HospitalRequestDraft = {
      selectedPatient,
      patientSearch,
      diagnoses,
      diagnosisSearch,
      treatSearch,
      treatments,
      phone,
      urgency,
      referralHospitalId,
      referralHospitalName,
    };

    const hasContent =
      Boolean(selectedPatient) ||
      patientSearch.trim().length > 0 ||
      diagnoses.length > 0 ||
      diagnosisSearch.trim().length > 0 ||
      treatSearch.trim().length > 0 ||
      treatments.length > 0 ||
      phone.trim().length > 0 ||
      patientEmail.trim().length > 0 ||
      urgency !== "routine" ||
      Boolean(referralHospitalId) ||
      referralHospitalName.trim().length > 0;

    if (hasContent) {
      writeSessionJSON(draftKey, draft);
    } else {
      removeSessionItem(draftKey);
    }
  }, [
    draftKey, draftReady, diagnoses, diagnosisSearch, patientSearch,
    phone, patientEmail, referralHospitalId, referralHospitalName,
    selectedPatient, treatSearch, treatments, urgency,
  ]);

  // Patient search
  useEffect(() => {
    const t = setTimeout(async () => {
      if (patientSearch.length < 3) {
        setPatientResults([]);
        setPatientOpen(false);
        return;
      }
      setPatientLoading(true);

      const { data } = await supabase.from("nhis_beneficiaries")
        .select("full_name, policy_number")
        .or(`policy_number.ilike.%${patientSearch}%,full_name.ilike.%${patientSearch}%`)
        .limit(8);
      setPatientResults(data || []);
      setPatientOpen((data || []).length > 0);
      setPatientLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  // Diagnosis suggestions
  useEffect(() => {
    const q = diagnosisSearch.trim();
    if (q.length < 2) { setDiagSuggestions([]); setDiagOpen(false); return; }
    const matches = DIAGNOSES.filter(d => d.toLowerCase().includes(q.toLowerCase()));
    setDiagSuggestions(matches.slice(0, 10));
    setDiagOpen(matches.length > 0);
  }, [diagnosisSearch]);

  // Treatment search
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = treatSearch.toLowerCase().trim();
      if (q.length < 3) {
        setTreatResults([]);
        setTreatOpen(false);
        return;
      }
      setTreatLoading(true);

      const brand = Object.keys(BRAND_TO_GENERIC).find(b => q.includes(b));
      const term = brand ? BRAND_TO_GENERIC[brand] : treatSearch;

      const { data } = await supabase
        .from("nhia_items" as any)
        .select("code,name,amount,category,subcategory")
        .or(`name.ilike.%${term}%,code.ilike.%${term}%,subcategory.ilike.%${term}%`)
        .eq("is_active", true)
        .limit(100);

      setTreatResults((data || []) as any[]);
      setTreatOpen((data || []).length > 0);
      setTreatLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [treatSearch]);

  const total = treatments.reduce((a, t) => a + Number(t.amount) * t.quantity, 0);

  const handleNextStep = async () => {
    let isValid = false;
    if (step === 1) {
      isValid = await trigger(["selectedPatient", "phone", "patientEmail", "noEmail"]);
    } else if (step === 2) {
      isValid = await trigger(["diagnoses", "urgency", "referralHospitalId", "referralHospitalName"]);
    } else if (step === 3) {
      isValid = await trigger(["treatments"]);
    }
    
    if (isValid) {
      setStep(s => s + 1);
      window.scrollTo(0, 0);
    } else {
      // Show error toast if they try to proceed with invalid data
      const errors = form.formState.errors;
      const firstError = Object.values(errors)[0]?.message;
      if (firstError) {
        toast({ variant: "destructive", title: "Validation Error", description: firstError as string });
      }
    }
  };

  const onSubmit = async (data: HospitalRequestFormValues) => {
    // Double check email validation logic
    if (!data.noEmail && (!data.patientEmail || !isValidEmail(data.patientEmail))) {
      toast({ variant: "destructive", title: "Invalid email", description: "Enter a valid patient email address for OTP verification." });
      return;
    }
    
    if (!Number.isFinite(total) || total <= 0) {
      toast({ variant: "destructive", title: "Invalid tariff total", description: "The request total must be greater than zero." });
      return;
    }

    const approvedPayload = treatments.map((item) => ({
      code: item.code,
      name: item.name,
      category: item.category || item.subcategory || null,
      unit_price: Number(item.amount),
      quantity: Number(item.quantity),
      amount: Number(item.amount) * Number(item.quantity),
      frequency: null,
      duration: null,
      matched_via: "hospital-selected",
      matched_text: item.name,
      confidence: "high",
    }));
    setIsSubmitting(true);

    try {
      const familyPolicy = selectedPatient.policy_number.split('-')[0];
      const diagnosisText = diagnoses.join("; ");

      // Validate email against policy family registry
      const { data: emailCheck } = await (supabase.rpc as any)('validate_policy_email', {
        p_email: patientEmail.trim(),
        p_family_policy: familyPolicy
      });

      if (emailCheck && !emailCheck.allowed) {
        toast({ variant: "destructive", title: "Email blocked", description: emailCheck.reason || "This email address is already associated with another policy family." });
        setIsSubmitting(false);
        return;
      }

      // Register email in policy_email_registry
      const { data: registryData } = await (supabase as any)
        .from('policy_email_registry')
        .select('id')
        .eq('email', patientEmail.trim())
        .maybeSingle();

      if (!registryData) {
        await (supabase as any).from('policy_email_registry').insert({
          email: patientEmail.trim(),
          family_policy_number: familyPolicy,
        }).maybeSingle();
      }

      // ── Resolve referral hospital ID if name is provided but ID is missing ──
      let resolvedReferralHospitalId = referralHospitalId;
      let resolvedReferralHospitalName = referralHospitalName.trim() || null;
      if (!resolvedReferralHospitalId && resolvedReferralHospitalName) {
        const foundId = await findHospitalIdByName(referralHospitalName.trim());
        if (foundId) {
          resolvedReferralHospitalId = foundId;
        }
      }

      // ── Determine request status based on whether a referral hospital is set ──
      // If a referral hospital is assigned → status is "pending_referral" (awaiting insurer approval)
      // If no referral → status is "pending" (standard authorization request)
      const isReferral = Boolean(resolvedReferralHospitalId || resolvedReferralHospitalName);
      const initialStatus = isReferral ? "pending_referral" : "pending";

      // ── Insert the authorization request ──────────────────────────────────
      const { data: insertedRequest, error } = await supabase
        .from("authorization_requests")
        .insert({
          request_id: `REQ-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          patient_name: selectedPatient.full_name,
          policy_number: selectedPatient.policy_number,
          patient_email: patientEmail.trim(),
          diagnosis: diagnosisText,
          treatment: treatments.map(t => `${t.name} [Code: ${t.code}] (Qty: ${t.quantity} x ₦${t.amount} = ₦${t.quantity * Number(t.amount)})`).join("; "),
          patient_phone: phone,
          urgency,
          hospital_id: hospital?.id,
          hospital_name: hospital?.name,
          // Referral chain — all four ID+name pairs must be set for RLS and queue queries
          requesting_hospital_id: hospital?.id,
          requesting_hospital_name: hospital?.name,
          referring_hospital_id: hospital?.id,
          referring_hospital_name: hospital?.name,
          referred_hospital_id: resolvedReferralHospitalId,
          referred_hospital_name: resolvedReferralHospitalName,
          // Claiming hospital = receiving hospital (if referral) or requesting hospital
          claiming_hospital_id: resolvedReferralHospitalId || hospital?.id,
          claiming_hospital_name: resolvedReferralHospitalName || hospital?.name,
          submitted_by: user?.id,
          approved_items: approvedPayload,
          source: "hospital_portal",
          total_amount: total,
          status: initialStatus,
        })
        .select("id")
        .single();

      if (error) throw error;
      if (!insertedRequest?.id) throw new Error("Request created but no ID returned");

      // ── Audit log: referral assignment ────────────────────────────────────
      if (isReferral) {
        try {
          await supabase.from("audit_logs" as any).insert({
            action: "referral_created",
            user_id: user?.id,
            details: {
              request_id: insertedRequest.id,
              patient_name: selectedPatient.full_name,
              policy_number: selectedPatient.policy_number,
              referring_hospital_id: hospital?.id,
              referring_hospital_name: hospital?.name,
              referred_hospital_id: resolvedReferralHospitalId,
              referred_hospital_name: resolvedReferralHospitalName,
              status: initialStatus,
            },
            severity: "info",
          });
        } catch {}
      }

      // ── Send OTP to patient email ─────────────────────────────────────────
      try {
        const { data: otpData, error: otpError } = await supabase.functions.invoke("send-otp", {
          method: "POST",
          body: {
            authorization_id: insertedRequest.id,
            patient_email: patientEmail.trim(),
            policy_number: selectedPatient.policy_number,
            otp_type: isReferral ? "ARRIVAL" : "TREATMENT",
            hospital_id: resolvedReferralHospitalId || hospital?.id,
          },
        });

        const fnResult = otpData || {};
        if (otpError && !fnResult.message) {
          toast({ variant: "destructive", title: "OTP send failed", description: otpError?.message || "Could not deliver OTP email." });
        } else if (fnResult.error) {
          toast({ variant: "destructive", title: "OTP send failed", description: fnResult.message || "Could not deliver OTP email." });
        } else if (fnResult.email_status === "failed") {
          toast({ variant: "destructive", title: "OTP email failed", description: fnResult.error_message || fnResult.message || "Unable to send OTP email. Check email settings." });
        } else if (fnResult.email_status === "skipped") {
          toast({ title: "OTP generated", description: fnResult.message || "OTP created but email sending was skipped. Check BREVO_API_KEY configuration." });
        } else {
          toast({
            title: isReferral ? "Referral request submitted" : "Request submitted successfully",
            description: isReferral
              ? `Referral to ${resolvedReferralHospitalName} submitted. An OTP has been sent to the patient.`
              : "An OTP has been sent to the patient's email.",
          });
        }
      } catch (err: any) {
        console.error("OTP send failed:", err);
        toast({ variant: "destructive", title: "OTP send failed", description: err?.message || "Could not deliver OTP email." });
      }

      if (draftKey) removeSessionItem(draftKey);
      navigate("/dashboard");
    } catch (err: any) {
      console.error("Request submission error:", err);
      toast({ variant: "destructive", title: "Submission failed", description: err.message });
    } finally { setIsSubmitting(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-in fade-in duration-300">
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full h-8 w-8 bg-white border border-slate-100 shadow-sm shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-col">
          <h1 className="text-xl font-black text-slate-800">New Authorization Request</h1>
          <p className="text-xs font-semibold text-slate-400">Step {step} of 4</p>
        </div>
      </div>
      
      {/* Stepper Header */}
      <div className="flex items-center justify-between px-2 mb-6">
        {[1, 2, 3, 4].map(num => (
          <div key={num} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-black transition-colors ${step === num ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20" : step > num ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
              {step > num ? <CheckCircle2 className="w-4 h-4" /> : num}
            </div>
            {num < 4 && (
              <div className={`w-12 sm:w-24 h-1 rounded-full mx-2 transition-colors ${step > num ? "bg-emerald-100" : "bg-slate-100"}`} />
            )}
          </div>
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
            
            {step === 1 && (
              <PatientSection
                selectedPatient={selectedPatient}
                setSelectedPatient={(val) => setValue("selectedPatient", val, { shouldValidate: true })}
                patientSearch={patientSearch}
                setPatientSearch={(val) => setValue("patientSearch", val)}
                patientLoading={patientLoading}
                patientResults={patientResults}
                patientOpen={patientOpen}
                setPatientOpen={setPatientOpen}
                phone={phone}
                setPhone={(val) => setValue("phone", val, { shouldValidate: true })}
                patientEmail={patientEmail}
                setPatientEmail={(val) => setValue("patientEmail", val, { shouldValidate: true })}
                patientRef={patientRef}
              />
            )}

            {step === 2 && (
              <div className="divide-y divide-slate-100">
                <DiagnosisSection
                  diagnoses={diagnoses}
                  setDiagnoses={(val) => setValue("diagnoses", typeof val === 'function' ? val(diagnoses) : val, { shouldValidate: true })}
                  diagnosisSearch={diagnosisSearch}
                  setDiagnosisSearch={(val) => setValue("diagnosisSearch", val)}
                  diagSuggestions={diagSuggestions}
                  setDiagSuggestions={setDiagSuggestions}
                  diagOpen={diagOpen}
                  setDiagOpen={setDiagOpen}
                  diagRef={diagRef}
                />
                <PrioritySection
                  urgency={urgency}
                  setUrgency={(val) => setValue("urgency", val as any, { shouldValidate: true })}
                />
                <ReferralSection
                  hospitalName={hospital?.name}
                  referralHospitalName={referralHospitalName}
                  referralHospitalId={referralHospitalId}
                  setReferralHospitalId={(val) => setValue("referralHospitalId", val)}
                  setReferralHospitalName={(val) => setValue("referralHospitalName", val)}
                />
              </div>
            )}

            {step === 3 && (
              <TreatmentSection
                treatSearch={treatSearch}
                setTreatSearch={(val) => setValue("treatSearch", val)}
                treatLoading={treatLoading}
                treatResults={treatResults}
                treatOpen={treatOpen}
                setTreatOpen={setTreatOpen}
                treatments={treatments}
                setTreatments={(val) => setValue("treatments", typeof val === 'function' ? val(treatments) : val, { shouldValidate: true })}
                isSubmitting={isSubmitting}
                onSubmit={handleNextStep}
                treatRef={treatRef}
              />
            )}

            {step === 4 && (
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-black text-slate-800">Review Request</h3>
                  <p className="text-sm text-slate-500">Ensure all details are correct before submitting.</p>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold text-slate-500">Patient:</span>
                    <span className="text-xs font-bold text-slate-900">{selectedPatient?.full_name} ({selectedPatient?.policy_number})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold text-slate-500">Contact:</span>
                    <span className="text-xs font-bold text-slate-900">{phone} | {noEmail ? "No Email Provided" : patientEmail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold text-slate-500">Diagnoses:</span>
                    <span className="text-xs font-bold text-slate-900 text-right">{diagnoses.join(", ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold text-slate-500">Priority:</span>
                    <span className="text-xs font-bold uppercase text-slate-900">{urgency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs font-semibold text-slate-500">Total Items:</span>
                    <span className="text-xs font-bold text-slate-900">{treatments.length}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-3 mt-3">
                    <span className="text-sm font-black text-slate-900">Total Amount:</span>
                    <span className="text-sm font-black text-emerald-600">₦{total.toLocaleString()}</span>
                  </div>
                </div>

              </div>
            )}
            
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (step === 1) navigate("/dashboard");
                else setStep(s => s - 1);
              }}
              className="h-12 px-6 rounded-xl border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-slate-900"
            >
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            
            {step < 4 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                className="h-12 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-12 px-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
