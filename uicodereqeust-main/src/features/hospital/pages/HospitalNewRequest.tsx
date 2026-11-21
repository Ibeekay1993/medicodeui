import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { readSessionJSON, removeSessionItem, writeSessionJSON } from "@/lib/sessionState";

import {
  HospitalRequestDraft,
  hospitalRequestSchema,
  HospitalRequestFormValues,
} from "@/lib/new-request-helpers";

import { useHospitalProfile } from "../hooks/useHospitalDashboard";
import { useNewRequestSearches } from "../hooks/useNewRequestSearches";
import { useHospitalNewRequestSubmit } from "../hooks/useHospitalNewRequestSubmit";

import PatientSection from "@/components/new-request/PatientSection";
import DiagnosisSection from "@/components/new-request/DiagnosisSection";
import PrioritySection from "@/components/new-request/PrioritySection";
import ReferralSection from "@/components/new-request/ReferralSection";
import TreatmentSection from "@/components/new-request/TreatmentSection";
import DocumentUploadSection from "@/components/new-request/DocumentUploadSection";
import RequestStepperHeader from "@/components/new-request/RequestStepperHeader";
import RequestReviewSection from "@/components/new-request/RequestReviewSection";

export default function HospitalNewRequest() {
  const { user, hospitalId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [canSubmit, setCanSubmit] = useState(false);
  const [doctorReportPath, setDoctorReportPath] = useState<string | null>(null);
  const [doctorReportName, setDoctorReportName] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const { data: hospital } = useHospitalProfile(hospitalId ?? undefined, user?.id, user?.email);

  useEffect(() => {
    if (step === 5) {
      const t = setTimeout(() => setCanSubmit(true), 800);
      return () => clearTimeout(t);
    } else {
      setCanSubmit(false);
    }
  }, [step]);

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
  const normalizedTreatments = treatments.map(({ category, subcategory, ...item }) => ({
    ...item,
    ...(category ? { category } : {}),
    ...(subcategory ? { subcategory } : {}),
  }));
  const treatSearch = watch("treatSearch") || "";

  // DOM refs for keyboard/popover handling
  const patientRef = useRef<HTMLDivElement>(null);
  const diagRef = useRef<HTMLDivElement>(null);
  const treatRef = useRef<HTMLDivElement>(null);

  // Live queries for comboboxes
  const {
    patientResults,
    patientLoading,
    patientOpen,
    setPatientOpen,
    diagSuggestions,
    diagOpen,
    setDiagOpen,
    setDiagSuggestions,
    treatResults,
    treatLoading,
    treatOpen,
    setTreatOpen,
  } = useNewRequestSearches({
    patientSearch,
    diagnosisSearch,
    treatSearch,
  });

  // Draft persistence in sessionStorage
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
      if (
        draft.patientEmail === "no-email@ronsbergerhmo.io" ||
        (draft.patientEmail &&
          (draft.patientEmail.startsWith("no-email@") || draft.patientEmail.endsWith("@medicode.com")))
      ) {
        setValue("noEmail", true);
      }
      if (draft.urgency) setValue("urgency", draft.urgency as any);
      if (draft.referralHospitalId) setValue("referralHospitalId", draft.referralHospitalId);
      if (draft.referralHospitalName) setValue("referralHospitalName", draft.referralHospitalName);
      if (draft.doctorReportPath) setDoctorReportPath(draft.doctorReportPath);
      if (draft.doctorReportName) setDoctorReportName(draft.doctorReportName);
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
      treatments: normalizedTreatments,
      phone,
      urgency,
      referralHospitalId: referralHospitalId ?? null,
      referralHospitalName,
      doctorReportPath,
      doctorReportName,
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
      referralHospitalName.trim().length > 0 ||
      Boolean(doctorReportPath) ||
      Boolean(doctorReportName);

    if (hasContent) {
      writeSessionJSON(draftKey, draft);
    } else {
      removeSessionItem(draftKey);
    }
  }, [
    draftKey,
    draftReady,
    diagnoses,
    diagnosisSearch,
    patientSearch,
    phone,
    patientEmail,
    referralHospitalId,
    referralHospitalName,
    selectedPatient,
    treatSearch,
    treatments,
    urgency,
    doctorReportPath,
    doctorReportName,
  ]);

  const total = treatments.reduce((a, t) => a + Number(t.amount) * t.quantity, 0);

  const handleNextStep = async () => {
    let isValid = false;
    if (step === 1) {
      isValid = await trigger(["selectedPatient", "phone", "patientEmail", "noEmail"]);
    } else if (step === 2) {
      isValid = await trigger(["diagnoses", "urgency", "referralHospitalId", "referralHospitalName"]);
      if (isValid) {
        const refId = form.getValues("referralHospitalId");
        const refName = form.getValues("referralHospitalName") || "";
        const currentHospId = hospitalId || hospital?.id;
        const currentHospName = hospital?.name || "";

        if (
          (refId && currentHospId && refId === currentHospId) ||
          (refName.trim() &&
            currentHospName.trim() &&
            refName.toLowerCase().trim() === currentHospName.toLowerCase().trim())
        ) {
          toast({
            variant: "destructive",
            title: "Invalid Referral",
            description: "You cannot refer a patient to your own facility.",
          });
          isValid = false;
        }
      }
    } else if (step === 3) {
      isValid = await trigger(["treatments"]);
    } else if (step === 4) {
      isValid = true;
    }

    if (isValid) {
      setStep((s) => s + 1);
      window.scrollTo(0, 0);
    } else {
      const errors = form.formState.errors;
      let errMsg = "Please check all fields";
      const firstVal: any = Object.values(errors)[0];

      if (firstVal?.message) {
        errMsg = firstVal.message;
      } else if (Array.isArray(firstVal)) {
        const firstErrInArray = firstVal.find((e: any) => e !== undefined);
        if (firstErrInArray) {
          const nestedErr = Object.values(firstErrInArray)[0] as any;
          errMsg = nestedErr?.message || errMsg;
        }
      } else if (firstVal?.root?.message) {
        errMsg = firstVal.root.message;
      }

      toast({ variant: "destructive", title: "Validation Error", description: errMsg });
    }
  };

  const { isSubmitting, onSubmit } = useHospitalNewRequestSubmit({
    hospitalId,
    hospital: hospital ?? null,
    userId: user?.id,
    total,
    doctorReportPath,
    doctorReportName,
    draftKey,
    step,
    handleNextStep,
  });

  return (
    <div className="max-w-2xl mx-auto pb-10 animate-in fade-in duration-300">
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="rounded-lg h-9 w-9 border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  New Authorization Request
                </h1>
                {hospital?.code && (
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200"
                  >
                    {hospital.code}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Step {step} of 5 · Clinical pre-authorization & referral request submission
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Registry Active
          </span>
        </div>
      </div>

      <RequestStepperHeader step={step} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
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
                  setDiagnoses={(val) =>
                    setValue("diagnoses", typeof val === "function" ? val(diagnoses) : val, {
                      shouldValidate: true,
                    })
                  }
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
                  hospitalName={hospital?.name ?? ""}
                  hospitalId={hospital?.id}
                  referralHospitalName={referralHospitalName}
                  referralHospitalId={referralHospitalId ?? null}
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
                treatments={normalizedTreatments}
                setTreatments={(val) =>
                  setValue("treatments", typeof val === "function" ? val(normalizedTreatments) : val, {
                    shouldValidate: true,
                  })
                }
                isSubmitting={isSubmitting}
                onSubmit={handleNextStep}
                treatRef={treatRef}
              />
            )}

            {step === 4 && (
              <DocumentUploadSection
                doctorReportPath={doctorReportPath}
                setDoctorReportPath={setDoctorReportPath}
                doctorReportName={doctorReportName}
                setDoctorReportName={setDoctorReportName}
              />
            )}

            {step === 5 && (
              <RequestReviewSection
                selectedPatient={selectedPatient}
                phone={phone}
                patientEmail={patientEmail}
                noEmail={noEmail}
                diagnoses={diagnoses}
                urgency={urgency}
                doctorReportName={doctorReportName}
                treatments={treatments}
                referralHospitalId={referralHospitalId ?? null}
                referralHospitalName={referralHospitalName}
                total={total}
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (step === 1) navigate("/dashboard");
                else setStep((s) => s - 1);
              }}
              className="h-9 sm:h-10 px-4 sm:px-5 rounded-lg border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              {step === 1 ? "Cancel" : "Back"}
            </Button>

            {step < 5 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                className="h-9 sm:h-10 px-5 sm:px-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
              >
                Next Step <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting || !canSubmit}
                className={`h-9 sm:h-10 rounded-lg bg-emerald-600 px-5 sm:px-6 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 ${
                  !canSubmit && !isSubmitting ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {isSubmitting ? "Submitting…" : "Confirm & Submit Request"}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
