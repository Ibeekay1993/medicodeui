import React, { useState, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HospitalReferralField } from "@/components/HospitalReferralField";
import { AlertTriangle, Building2, ChevronDown, ChevronUp, ChevronRight, Trash2, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";


// Custom Hooks
import { useAuth } from "@/contexts/AuthContext";
import { useClinicalVerification } from "@/hooks/clinical/useClinicalVerification";
import { useTariffSearch } from "@/hooks/clinical/useTariffSearch";
import { useClinicalActions } from "@/hooks/clinical/useClinicalActions";

// Modular Sub-components
import { PatientVerifyCard } from "./review/PatientVerifyCard";
import { TreatmentCart } from "./review/TreatmentCart";
import { ClinicalHistory } from "./review/ClinicalHistory";
import { ClinicalActionControls } from "./review/ClinicalActionControls";
import { PostReviewTemplates } from "./review/PostReviewTemplates";

// Utilities
import {
  cleanPatientName,
  canDeleteRequestRecord,
  recordMatchesHistory,
  normalizePolicyNumber,
} from "@/lib/clinicalUtils";

interface ReviewModalProps {
  request: any;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  otpValue?: string;
}

export function ReviewModal({ request, open, onClose, onUpdated, otpValue }: ReviewModalProps) {
  const { role } = useAuth();
  const [historyPage, setHistoryPage] = useState(1);
  const [activeTab, setActiveTab] = useState("verification");
  const [showStickyName, setShowStickyName] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 1. Determine request metadata
  const isHospitalDirected = ["hospital_portal", "hospital", "portal"].includes(request?.source);
  const isParsedRequest = request?.source === "whatsapp_parser";
  const requestPatientName = cleanPatientName(request?.patient_name || "");
  const requestPolicyNumber = String(request?.policy_number || "").trim();

  // 1b. Look up the patient's registered primary hospital from nhis_beneficiaries
  const [primaryHospital, setPrimaryHospital] = useState<{ hcp_name: string; hcp_code: string } | null>(null);
  const [primaryHospitalLoading, setPrimaryHospitalLoading] = useState(false);

  useEffect(() => {
    if (!open || !requestPolicyNumber) {
      setPrimaryHospital(null);
      return;
    }
    let cancelled = false;
    setPrimaryHospitalLoading(true);
    // The policy_number on a request is the family code (e.g. "3460764").
    // nhis_beneficiaries stores it the same way. We match on the principal's
    // record (member_type = PRINCIPAL) to get the registered hospital.
    supabase
      .from("nhis_beneficiaries")
      .select("hcp_name, hcp_code")
      .eq("policy_number", requestPolicyNumber)
      .in("member_type", ["PRINCIPAL", "MEMBER"])
      .limit(1)
      .single()
      .then(async ({ data }) => {
        if (!cancelled) {
          let hcp_name = data?.hcp_name || "";
          const hcp_code = data?.hcp_code || "";
          
          if (hcp_code) {
            const { data: hospData } = await supabase.from("hospitals").select("name").eq("code", hcp_code).maybeSingle();
            if (hospData?.name) {
              hcp_name = hospData.name;
            }
          }
          
          setPrimaryHospital(data ? { hcp_name, hcp_code } : null);
          setPrimaryHospitalLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [open, requestPolicyNumber]);

  // 1c. Look up the requesting hospital's hcp_code from the hospitals table
  const [requestingHospitalCode, setRequestingHospitalCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !request) {
      setRequestingHospitalCode(null);
      return;
    }
    let cancelled = false;
    
    const fetchHcpCode = async () => {
      // First try to look up by ID
      const hospitalId = request.requesting_hospital_id || request.hospital_id;
      if (hospitalId) {
        const { data } = await supabase.from("hospitals").select("code").eq("id", hospitalId).maybeSingle();
        if (!cancelled && data?.code) {
          setRequestingHospitalCode(data.code);
          return;
        }
      }
      
      // If no ID or code not found, try looking up by name
      const hospitalName = request.hospital_name || request.requesting_hospital_name;
      if (hospitalName) {
        const { data } = await supabase.from("hospitals").select("code").ilike("name", `%${hospitalName.trim()}%`).limit(1).maybeSingle();
        if (!cancelled && data?.code) {
          setRequestingHospitalCode(data.code);
        }
      }
    };
    
    fetchHcpCode();
    return () => { cancelled = true; };
  }, [open, request]);

  // Normalise both hospital names to detect a mismatch
  const requestingHospitalName = String(request?.hospital_name || request?.requesting_hospital_name || "").trim();
  
  const cleanString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  
  const reqNameLower = cleanString(requestingHospitalName);
  const primNameLower = cleanString(primaryHospital?.hcp_name || "");
  
  const codeMatch = Boolean(
    requestingHospitalCode && 
    primaryHospital?.hcp_code && 
    requestingHospitalCode === primaryHospital.hcp_code
  );

  const namesMatch = reqNameLower && primNameLower && (
    reqNameLower === primNameLower ||
    reqNameLower.includes(primNameLower) ||
    primNameLower.includes(reqNameLower)
  );

  const primaryHospitalMismatch = Boolean(
    primaryHospital?.hcp_name &&
    requestingHospitalName &&
    !namesMatch &&
    !codeMatch
  );

  // 2. Add local state for editTreatment
  const [editTreatment, setEditTreatment] = useState("");

  useEffect(() => {
    if (open && request) {
      setEditTreatment(request.treatment || "");
    }
  }, [open, request]);

  // 3. Initialize manual/auto tariff search hook
  const tariffSearch = useTariffSearch(open, editTreatment, request, isParsedRequest && role !== "hospital");

  // 3. Initialize decision & saving actions hook
  const actions = useClinicalActions({
    open,
    request,
    approvedItems: tariffSearch.approvedItems,
    approvedTotal: tariffSearch.approvedTotal,
    onClose,
    onUpdated,
    initialOtpValue: otpValue,
    editTreatment,
    setEditTreatment,
  });

  // 4. Initialize verification validation hook
  const verification = useClinicalVerification(open, request);

  // 5. Build combined history records
  const targetPolicy = useMemo(() => normalizePolicyNumber(request?.policy_number), [request]);
  
  const visibleHistory = useMemo(() => {
    const combined = [...verification.sheetHistory, ...verification.localHistory].filter((record) =>
      recordMatchesHistory(record, targetPolicy)
    );
    return combined.filter((record, index, arr) => {
      const key = `${record?.request_id || ""}|${record?.authorization_code || ""}|${
        record?.date || record?.created_at || ""
      }|${record?.patient_name || ""}`;
      return (
        index ===
        arr.findIndex(
          (item) =>
            `${item?.request_id || ""}|${item?.authorization_code || ""}|${
              item?.date || item?.created_at || ""
            }|${item?.patient_name || ""}` === key
        )
      );
    });
  }, [verification.sheetHistory, verification.localHistory, targetPolicy]);

  const allowDelete = canDeleteRequestRecord(request);

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-[94vw] max-w-[94vw] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[92dvh] rounded-[1.5rem] sm:rounded-[2rem] border-0 bg-white/95 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white to-slate-50/50 backdrop-blur-2xl selection:bg-slate-200 p-0 shadow-[0_8px_40px_rgb(0,0,0,0.08)] ring-1 ring-slate-200 overflow-y-auto overflow-x-hidden min-w-0 [&_*]:min-w-0 [&>button.absolute.right-4]:hidden"
        ref={scrollContainerRef}
        onScroll={(e) => setShowStickyName((e.target as HTMLElement).scrollTop > 60)}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="sticky top-0 z-[100] w-full h-0 pointer-events-none">
          <div 
            className={cn(
              "absolute top-0 left-0 right-0 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 py-2 shadow-sm transition-opacity duration-200 ease-in-out pointer-events-auto rounded-t-[1.5rem] sm:rounded-t-[2rem]",
              showStickyName ? "opacity-100" : "opacity-0"
            )}
          >
            <p className="text-[12px] sm:text-[13px] font-extrabold text-slate-900 uppercase tracking-wider truncate text-center">
              {requestPatientName || "Unknown Patient"}
            </p>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab as any} className="w-full min-w-0">
        {/* Fixed Header */}
        <div className="shrink-0 z-30 px-5 pt-4 pb-2 border-b border-slate-200 shadow-sm relative flex flex-col gap-4 min-w-0 w-full">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors z-40"
          >
            <X className="h-5 w-5 stroke-[2.5]" />
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pr-5 sm:pr-8">
            <div className="min-w-0 flex-1 w-full">
              <div className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-1">
                Clinical Review
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight truncate uppercase">
                {requestPatientName || "Unknown Patient"}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-slate-500 text-[11px]">
                <span>Policy: {requestPolicyNumber || "N/A"}</span>
                <span className="text-slate-300">&bull;</span>
                {role !== "hospital" ? (
                  <span>
                    {actions.otpLoading ? (
                      <span className="animate-pulse">Fetching OTPs...</span>
                    ) : (actions.arrivalOtp || actions.treatmentOtp || otpValue) ? (
                      <>
                        {actions.arrivalOtp && (
                          <span className="tracking-wider">
                            OTP: {actions.arrivalOtp}
                            {actions.arrivalOtpVerified && <span className="text-emerald-500 ml-1">✓</span>}
                          </span>
                        )}
                        {!actions.arrivalOtp && !actions.treatmentOtp && otpValue && <span className="tracking-wider">OTP: {otpValue}</span>}
                      </>
                    ) : ["pending", "pending_authorization", "pending_referral", "info_provided"].includes(request?.status || "") ? (
                      <span>OTP: &bull;&bull;&bull;&bull;&bull;&bull;</span>
                    ) : (
                      <span>OTP: N/A</span>
                    )}
                  </span>
                ) : (
                  <span>OTP: —</span>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right w-full sm:max-w-[200px] shrink-0 sm:self-center flex flex-col items-start sm:items-end mt-2 sm:mt-0">
              <div className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mb-0.5">Contact Details</div>
              <div className="text-xs font-bold text-slate-700 truncate w-full">
                {request?.patient_phone ? `${request.patient_phone}` : "—"}
              </div>
              {request?.patient_email && (
                <div className="text-[11px] font-medium text-slate-500 truncate mt-0.5 leading-none w-full">
                  {request.patient_email === "no-email@medicode.com" ? (
                    <span className="italic opacity-70">No email provided</span>
                  ) : (
                    request.patient_email
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Process Tracker */}
          {request?.referred_hospital_name ? (
            <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2 w-full">
              {/* Step 1: Referral */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_referral"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["pending_referral"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Referral</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["referral_approved", "referral_accepted", "pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 2: Insurer */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral"].includes(request.status) ? "bg-slate-200" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["referral_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Insurer</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["referral_accepted", "pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 3: Hospital */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_accepted"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral", "referral_approved"].includes(request.status) ? "bg-slate-200" : "bg-slate-800")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["referral_accepted"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Hospital</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 4: Review */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_authorization"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["pending_authorization"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Review</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 5: Authorized */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["approved", "authorization_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-200")} />
                <span className={cn("text-[8px] sm:text-[10px] font-bold uppercase tracking-wider", ["approved", "authorization_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Authorized</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white border-[3px] border-slate-800" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-800">Verify</span>
              </div>
              <div className="w-8 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Review</span>
              </div>
              <div className="w-8 sm:w-10 h-[2px] bg-slate-200 mb-4" />
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-slate-300" />
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">Decision</span>
              </div>
            </div>
          )}

          {/* TabsList */}
          <TabsList className="flex w-full h-11 sm:h-12 bg-transparent p-0 gap-2 mt-4">
            <TabsTrigger
              value="verification"
              className="flex-1 rounded-[0.5rem] sm:rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=inactive]:bg-slate-100 data-[state=inactive]:text-slate-400 data-[state=active]:shadow-none transition-all h-full border-0 whitespace-normal leading-tight px-1"
            >
              Patient Verify & History
            </TabsTrigger>
            <TabsTrigger
              value="clinical"
              className="flex-1 rounded-[0.5rem] sm:rounded-lg text-[10px] sm:text-[11px] font-black uppercase tracking-wider sm:tracking-widest data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=inactive]:bg-slate-100 data-[state=inactive]:text-slate-400 data-[state=active]:shadow-none transition-all h-full border-0 whitespace-normal leading-tight px-1"
            >
              Clinical Review
            </TabsTrigger>
          </TabsList>
        </div>

                        {/* Modal body container (Scrollable) */}
        <div className="p-3 sm:p-5 space-y-4 min-w-0 w-full">
          {/* Locked status warning */}
          {request?.deletion_status === "awaiting_admin_approval" && (
            <div className="p-4 rounded-2xl text-xs border bg-rose-50 border-rose-200 flex items-center gap-3 text-rose-900 shadow-xs animate-in fade-in duration-350">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wider text-xs text-rose-800">Awaiting Deletion Approval</p>
                <p className="font-medium opacity-80 mt-0.5">
                  This request has been requested for deletion and is awaiting admin approval. Modifications are disabled.
                </p>
              </div>
            </div>
          )}

          {/* Referral declined status alert */}
          {request?.status === "referral_declined" && (
            <div className="p-4 rounded-2xl text-xs border bg-amber-50 border-amber-200 flex items-center gap-3 text-amber-900 shadow-xs animate-in fade-in duration-350">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-black uppercase tracking-wider text-xs text-amber-800">Referral Declined by Hospital</p>
                <p className="font-medium opacity-90 mt-0.5">
                  Decline Reason: <span className="font-bold text-slate-800">{request.decision_reason || "No reason provided"}</span>
                </p>
                <p className="font-semibold text-amber-800 mt-1">
                  Please select a new referred hospital in the section below and click "Reassign Referral" to route it to another facility.
                </p>
              </div>
            </div>
          )}

          {/* Success template overlays after approval/decline */}
          {actions.approvalResult || actions.declineResult ? (
            <PostReviewTemplates
              request={request}
              approvalResult={actions.approvalResult}
              declineResult={actions.declineResult}
              copyApprovalMessage={actions.copyApprovalMessage}
              copyDeclineMessage={actions.copyDeclineMessage}
              setApprovalResult={actions.setApprovalResult}
              setDeclineResult={actions.setDeclineResult}
              onClose={onClose}
              allowDelete={allowDelete}
              setDeleteConfirmOpen={actions.setDeleteConfirmOpen}
              processing={actions.processing}
              editReferralHospitalName={actions.editReferralHospitalName}
              nurseDisplayName={actions.nurseDisplayName}
              nurseInitials={actions.nurseInitials}
            />
          ) : (
            <>
              {/* ─── Tab 1: Patient Verify & History ─── */}
              <TabsContent value="verification" className="space-y-4 mt-0">
                {/* Patient registry NHIS verify card */}
                <PatientVerifyCard
                  request={request}
                  checking={verification.checking}
                  patientMatchStatus={verification.patientMatchStatus}
                  matchedMemberId={verification.matchedMemberId}
                  policyVerified={verification.policyVerified}
                  nhisVerified={verification.nhisVerified}
                  familyMembers={verification.familyMembers}
                  earlyRefill={verification.earlyRefill}
                  requestPatientName={requestPatientName}
                  requestPolicyNumber={requestPolicyNumber}
                  primaryHospitalLoading={primaryHospitalLoading}
                  primaryHospital={primaryHospital}
                  primaryHospitalMismatch={primaryHospitalMismatch}
                  requestingHospitalName={requestingHospitalName}
                  requestingHospitalCode={requestingHospitalCode}
                />

                {/* Local and spreadsheet claims history */}
                <ClinicalHistory
                  request={request}
                  visibleHistory={visibleHistory}
                  historyPage={historyPage}
                  setHistoryPage={setHistoryPage}
                  requestPatientName={requestPatientName}
                  requestPolicyNumber={requestPolicyNumber}
                />

                {/* Tab 1 footer: Close + Next */}
                <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    className="h-11 sm:h-12 px-6 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                    onClick={onClose}
                  >
                    Close
                  </Button>
                  <Button
                    className="h-11 sm:h-12 px-6 sm:px-8 rounded-xl bg-slate-900 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md hover:bg-slate-950 active:scale-95 transition-all"
                    onClick={() => setActiveTab("clinical")}
                  >
                    Next
                  </Button>
                </div>
              </TabsContent>

              {/* ─── Tab 2: Clinical Review ─── */}
              <TabsContent value="clinical" className="space-y-4 mt-0">
                {/* Referral Banner */}
                {request?.requesting_hospital_name && (
                  <div className="bg-blue-50 rounded-2xl p-4 sm:p-5 mb-4 border border-blue-100 min-w-0">
                    <div className="inline-block bg-blue-500 text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
                      Referral Request
                    </div>
                    <div className="text-[16px] sm:text-[18px] font-extrabold text-slate-800 mt-2 leading-tight break-words [overflow-wrap:anywhere]">
                      {requestingHospitalName || "Unknown Hospital"}
                    </div>
                    <div className="text-[13px] font-medium text-slate-500 mt-1.5 leading-relaxed break-words [overflow-wrap:anywhere]">
                      {request?.clinical_notes || "Patient referred for further clinical evaluation and management."}
                    </div>
                  </div>
                )}

                                {/* Diagnosis Card */}
                <div className="bg-white rounded-2xl p-4 border border-slate-100 mb-3 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide flex flex-wrap items-center gap-2">
                      {request?.referred_hospital_name ? "Original Referral Diagnosis" : "Proposed Diagnosis"}
                      {request?.referred_hospital_name && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest">Referral</span>}
                    </div>
                    <div className="bg-slate-50 px-2.5 py-1 rounded-full text-[9px] font-bold text-slate-500 tracking-wide w-fit">
                      {request?.diagnosis_code || "ICD-10"}
                    </div>
                  </div>
                  
                  <textarea 
                    className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[70px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Diagnosis..."
                    value={actions.editDiagnosis}
                    onChange={(e) => actions.setEditDiagnosis(e.target.value)}
                    readOnly={request?.deletion_status === "awaiting_admin_approval" || role === "hospital" || !!request?.referred_hospital_name}
                  />

                  <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    {request?.referred_hospital_name ? "Current Treatment Request" : "Proposed Treatment"}
                    {request?.referred_hospital_name && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest">Referred Hospital</span>}
                  </div>
                  
                  <textarea 
                    className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[90px] focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    placeholder="Treatment Plan..."
                    value={actions.editTreatment}
                    onChange={(e) => actions.setEditTreatment(e.target.value)}
                    onBlur={() => {
                      if (role === "hospital" || !(["hospital", "hospital_portal"].includes(role))) return;
                      void tariffSearch.parseTreatmentText({ replaceAuto: true, quiet: true });
                    }}
                    readOnly={request?.deletion_status === "awaiting_admin_approval" || role === "hospital"}
                  />
                  
                  {/* Referral details container */}
                  <div className="space-y-3.5 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3 mt-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          Referral Hospital / Claim Owner
                        </div>
                        <p className="mt-1 text-[11px] sm:text-[12px] text-slate-400">
                          {actions.referralCollapsed
                            ? "Tap arrow to view referral details"
                            : "Specify treating hospital details if this authorization requires a referral."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => actions.setReferralCollapsed((current) => !current)}
                        className="h-8 w-8 shrink-0 rounded-xl text-slate-600 hover:bg-slate-100"
                      >
                        {actions.referralCollapsed ? (
                          <ChevronDown className="h-4.5 w-4.5" />
                        ) : (
                          <ChevronUp className="h-4.5 w-4.5" />
                        )}
                      </Button>
                    </div>

                    {!actions.referralCollapsed && (
                      <div className="mt-3.5 space-y-3 animate-in fade-in duration-200">
                        <HospitalReferralField
                          label="Referral Hospital / Claim Owner"
                          value={actions.editReferralHospitalName}
                          selectedId={actions.editReferralHospitalId}
                          excludeHospitalId={request?.requesting_hospital_id || request?.hospital_id}
                          excludeHospitalName={request?.requesting_hospital_name || request?.hospital_name}
                          onChange={(next) => {
                            actions.setEditReferralHospitalId(next.id);
                            actions.setEditReferralHospitalName(next.name);
                          }}
                          helperText="If this is a referral, the authorization code remains visible to the requester, but claim submission and payment belong only to this treating hospital."
                          disabled={request?.deletion_status === "awaiting_admin_approval" || role === "hospital"}
                        />
                        {actions.editReferralHospitalName.trim() ? (
                          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-[11px] sm:text-[12px] font-bold leading-relaxed text-slate-500 shadow-sm break-words">
                            Request raised by: {request.requesting_hospital_name || request.hospital_name || "Original hospital"}
                            <br />
                            Treatment and claims assigned to: {actions.editReferralHospitalName.trim()}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] sm:text-[12px] font-semibold text-slate-400">
                            No referral selected. Claims stay with {request.hospital_name || "the requesting hospital"}.
                          </div>
                        )}
                      </div>
                    )}

                  <div className="flex flex-wrap gap-4 items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Requesting Hospital
                      </span>
                      <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1 break-words [overflow-wrap:anywhere]">
                        {request.hospital_name || "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1 text-right shrink-0">
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Priority
                      </span>
                      <div>
                        <Badge
                          variant={request.urgency === "urgent" ? "destructive" : "outline"}
                          className="px-2 py-0.5 rounded-md uppercase text-[10px] font-black border-slate-200"
                        >
                          {request.urgency || "ROUTINE"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                </div>

                <div className="bg-white rounded-[1.2rem] sm:rounded-[1.5rem] border border-slate-100 shadow-sm p-4 sm:p-5 relative overflow-hidden group mb-3">
                  {/* Treatment Cart Component */}
                  <TreatmentCart
                    request={request}
                    approvedItems={tariffSearch.approvedItems}
                    removeApprovedItem={tariffSearch.removeApprovedItem}
                    updateApprovedItem={tariffSearch.updateApprovedItem}
                    totalApprovedAmount={tariffSearch.approvedTotal}
                    role={role}
                    isHmo={role !== "hospital"}
                    editTreatment={actions.editTreatment}
                    setEditTreatment={actions.setEditTreatment}
                    updateDeclineReason={tariffSearch.updateDeclineReason}
                    tariffSearch={tariffSearch.tariffSearch}
                    setTariffSearch={tariffSearch.setTariffSearch}
                    tariffOptions={tariffSearch.tariffOptions}
                    setTariffOptions={tariffSearch.setTariffOptions}
                    tariffSearchLoading={tariffSearch.tariffSearchLoading}
                    parseLoading={tariffSearch.parseLoading}
                    parseStatus={tariffSearch.parseStatus}
                    parseTreatmentText={tariffSearch.parseTreatmentText}
                    editingQuantities={tariffSearch.editingQuantities}
                    updateApprovedItemQuantity={tariffSearch.updateApprovedItemQuantity}
                    commitQuantity={tariffSearch.commitQuantity}
                    toggleDeclineApprovedItem={tariffSearch.toggleDeclineApprovedItem}
                    addApprovedItem={tariffSearch.addApprovedItem}
                    cartCollapsed={tariffSearch.cartCollapsed}
                    setCartCollapsed={tariffSearch.setCartCollapsed}
                  />
                </div>

                {/* Decision Section */}
                <div className="mt-4 mb-2">
                  <div className="text-[13px] sm:text-[14px] font-extrabold text-slate-800 uppercase tracking-wide mb-3">
                    Review Decision <span className="text-red-500">*</span>
                    <span className="text-[11px] text-slate-400 font-normal float-right lowercase normal-case">required</span>
                  </div>
                  <textarea 
                    className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2" 
                    placeholder="Enter reason for approval or decline..."
                    value={actions.editDecisionNote}
                    onChange={(e) => actions.setEditDecisionNote(e.target.value)}
                  />
                </div>

                {/* Tab 2 footer: Close + Decline + Approve */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-3 sm:pt-4 border-t border-slate-100">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto h-11 sm:h-12 px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all sm:flex-shrink-0 sm:min-w-[100px]"
                    onClick={onClose}
                  >
                    Close
                  </Button>
                  <Button
                    className="w-full sm:w-auto sm:flex-1 h-11 sm:h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                    onClick={() => actions.handleDecline(actions.editDecisionNote)}
                    disabled={actions.processing || !actions.editDecisionNote}
                  >
                    {actions.processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Decline"}
                  </Button>
                  <Button
                    className="w-full sm:w-auto sm:flex-1 h-11 sm:h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                    onClick={actions.handleApprove}
                    disabled={actions.processing}
                  >
                    {actions.processing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve"}
                  </Button>
                </div>
              </TabsContent>
            </>
          )}
        </div>
        </Tabs>
      </DialogContent>
      {/* Delete confirmation modal */}
      <AlertDialog
        open={actions.deleteConfirmOpen}
        onOpenChange={(openState) => {
          actions.setDeleteConfirmOpen(openState);
          if (!openState) actions.setDeleteConfirmText("");
        }}
      >
        <AlertDialogContent className="rounded-2xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
            <AlertDialogDescription>
              This action is permanent and cannot be undone. Type{" "}
              <span className="font-black text-slate-900">DELETE</span> to continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={actions.deleteConfirmText}
            onChange={(e) => actions.setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="h-10 rounded-xl"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.processing} className="rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={actions.processing || actions.deleteConfirmText.trim() !== "DELETE"}
              onClick={actions.handleDeleteRequest}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold"
            >
              {actions.processing ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
