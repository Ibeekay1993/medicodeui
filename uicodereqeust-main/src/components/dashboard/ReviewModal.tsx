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
import { HospitalReferralField } from "@/components/HospitalReferralField";
import { AlertTriangle, Building2, ChevronDown, ChevronUp, ChevronRight, Trash2, X, Loader2, Copy, Send, Lock, Unlock, XCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { areHospitalNamesMatching } from "@/lib/authorizations-helpers";
import { writeClipboardText } from "@/lib/clipboard";
import { getWhatsAppSendErrorMessage } from "@/lib/whatsappSendError";
import {
  authorizationSlaColor,
  formatAuthorizationSla,
  getAuthorizationDecisionLabel,
  formatNigeriaDateTime,
  getAuthorizationSlaMinutes,
} from "@/lib/authorizationTime";


// Custom Hooks
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useClinicalVerification } from "@/hooks/clinical/useClinicalVerification";
import { useTariffSearch } from "@/hooks/clinical/useTariffSearch";
import { useClinicalActions } from "@/hooks/clinical/useClinicalActions";

// Modular Sub-components
import { PatientVerifyCard } from "./review/PatientVerifyCard";
import { TreatmentCart } from "./review/TreatmentCart";
import { ClinicalHistory } from "./review/ClinicalHistory";
import { PostReviewTemplates } from "./review/PostReviewTemplates";

// Utilities
import {
  cleanPatientName,
  canDeleteRequestRecord,
  recordMatchesHistory,
  normalizePolicyNumber,
  normalizePatientNameForMatch,
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
  const [isResending, setIsResending] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleResendOtp = async () => {
    if (!request) return;
    setIsResending(true);
    try {
      if (!request.patient_phone) {
         throw new Error("This patient does not have a WhatsApp phone number on record.");
      }

      // Prepare WhatsApp message
      const patientName = cleanPatientName(request.patient_name || "");
      const policyNo = request.policy_number || "N/A";
      const hospitalName = request.hospital_name || "the hospital";
      const diagnosis = request.diagnosis || "Not specified";
      const priority = request.urgency || "ROUTINE";
      const pin = otpValue || request.auth_code || "";
      const approverName = String(request.authorized_by_name || "Ronsberger HMO Utilization Team").trim();
      const approverInitials = String(request.nurse_initials || "").trim();
      const authorizedBy = approverInitials ? `${approverName} (${approverInitials})` : approverName;

      let itemsText = "";
      const itemsList = request.approved_items || request.items;
      if (itemsList && Array.isArray(itemsList) && itemsList.length > 0) {
        itemsText = "\n\n*Approved Treatment / Services*\n\n" + itemsList.map((item: any) => {
          const qty = item.quantity || 1;
          const name = item.name || "Service";
          return `• *${qty}x ${name}*`;
        }).join("\n");
      }

      const messageText = `*Ronsberger HMO*\n\n*AUTHORIZATION APPROVED*\n\nHello *${patientName}*,\n\nWe are pleased to inform you that your treatment request submitted through *${hospitalName}* has been *approved* by Ronsberger HMO.\n\nYour requested treatment has been authorized based on the diagnosis and request details below.\n\n*Request Details*\n\nPatient: *${patientName}*\nPolicy No.: *${policyNo}*\nHospital: *${hospitalName}*\nDiagnosis: *${diagnosis}*\nAuthorized by: *${authorizedBy}*\nPriority: *${priority}*${itemsText}\n\n*Your Patient Arrival PIN*\n\n*${pin}*\n\nPlease provide this PIN to the reception at *${hospitalName}* when you arrive. The PIN will be used to confirm your authorization and finalize your approved treatment.\n\n*Important Notice*\nPlease contact us immediately if these services were not fully rendered to you, or if you are asked to make any additional payments for the approved items listed above.\n\nThank you for choosing Ronsberger HMO.`;

      // Format phone number
      const phoneStr = String(request.patient_phone || "");
      const cleanNumber = phoneStr.replace(/\D/g, "");
      let formattedNumber = cleanNumber;
      if (cleanNumber.length === 11 && cleanNumber.startsWith("0")) {
        formattedNumber = "234" + cleanNumber.substring(1);
      } else if (cleanNumber.length === 10) {
        formattedNumber = "234" + cleanNumber;
      }

      // Direct background send via Evolution API (send-whatsapp Edge Function)
      const { data: sendResult, error: sendError } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          phone_number: formattedNumber,
          message: messageText,
        },
      });

      if (sendError || !sendResult?.success) {
        const reason = await getWhatsAppSendErrorMessage(sendResult, sendError);
        toast({ variant: "destructive", title: "WhatsApp not sent", description: reason });
      } else {
        toast({ title: "WhatsApp Sent!", description: `Arrival PIN sent to ${formattedNumber}` });
      }
    } catch (err: any) {
      console.error(err);
      toast({ variant: "destructive", title: "Error", description: err.message || "An unexpected error occurred." });
    } finally {
      setIsResending(false);
    }
  };

  // 1. Determine request metadata
  const isHospitalDirected = ["hospital_portal", "hospital", "portal"].includes(request?.source);
  const isParsedRequest = ["whatsapp_parser", "whatsapp"].includes(request?.source);
  const requestPatientName = cleanPatientName(request?.patient_name || "");
  const requestPolicyNumber = String(request?.policy_number || "").trim();

  const formattedNotes = useMemo(() => {
    const sourceNotes = request?.decision_reason || request?.clinical_notes;
    if (!sourceNotes || typeof sourceNotes !== "string") return null;
    const trimmed = sourceNotes.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        const parts: string[] = [];
        if (parsed.review_decision || parsed.decision_reason) {
          parts.push(parsed.review_decision || parsed.decision_reason);
        }
        if (parsed.patient_id_free_text) parts.push(`Patient ID: ${parsed.patient_id_free_text}`);
        if (parsed.referral_to) parts.push(`Referral To: ${parsed.referral_to}`);
        if (parsed.notes) parts.push(parsed.notes);
        return parts.length > 0 ? parts.join(" • ") : null;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }, [request?.clinical_notes, request?.decision_reason]);

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
    // Fast indexed query instead of slow unindexed RPC to prevent database statement timeouts
    const root = requestPolicyNumber.includes("-") ? requestPolicyNumber.split("-")[0] : requestPolicyNumber;
    const conds = [`policy_number.eq.${requestPolicyNumber}`];
    if (root && root !== requestPolicyNumber) {
      conds.push(`policy_number.eq.${root}`);
      conds.push(`policy_number.ilike.${root}-%`);
    }

    supabase
      .from("nhis_beneficiaries")
      .select("id, hcp_name, hcp_code, member_type, policy_number, beneficiary_number")
      .or(conds.join(","))
      .limit(20)
      .then(async ({ data, error }: { data: any[] | null; error: unknown }) => {
        if (error) {
          console.error("Primary hospital family lookup error:", error);
          if (!cancelled) {
            setPrimaryHospital(null);
            setPrimaryHospitalLoading(false);
          }
          return;
        }
        const principal = (data || []).find((member) =>
          ["PRINCIPAL", "MEMBER"].includes(String(member.member_type || "").toUpperCase())
        );
        if (!cancelled) {
          let hcp_name = principal?.hcp_name || "";
          const hcp_code = principal?.hcp_code || "";
          
          if (hcp_code) {
            const { data: hospData } = await supabase.from("hospitals").select("name").eq("code", hcp_code).maybeSingle();
            if (hospData?.name) {
              hcp_name = hospData.name;
            }
          }
          
          setPrimaryHospital(principal ? { hcp_name, hcp_code } : null);
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

      const hospitalName = request.hospital_name || request.requesting_hospital_name;

      // If the requesting hospital matches the patient's registered primary hospital, link the HCP code directly
      if (primaryHospital?.hcp_code && areHospitalNamesMatching(hospitalName, primaryHospital.hcp_name)) {
        if (!cancelled) {
          setRequestingHospitalCode(primaryHospital.hcp_code);
          return;
        }
      }

      // If no ID or code not found, try looking up in hospitals table
      if (hospitalName) {
        const { data } = await supabase.from("hospitals").select("code, name").limit(100);
        if (!cancelled && data && data.length > 0) {
          const match = data.find((h: any) => areHospitalNamesMatching(h.name, hospitalName));
          if (match?.code) {
            setRequestingHospitalCode(match.code);
            return;
          }
        }
      }
    };

    fetchHcpCode();
    return () => { cancelled = true; };
  }, [open, request, primaryHospital?.hcp_code, primaryHospital?.hcp_name]);

  // Normalise both hospital names to detect a mismatch
  const requestingHospitalName = String(request?.hospital_name || request?.requesting_hospital_name || "").trim();

  const codeMatch = Boolean(
    requestingHospitalCode &&
    primaryHospital?.hcp_code &&
    requestingHospitalCode === primaryHospital.hcp_code
  );

  // Use canonical hospital name matching (handles UI, UHS, Jaja Clinic, UCH, etc.)
  const namesMatch = areHospitalNamesMatching(requestingHospitalName, primaryHospital?.hcp_name);

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

  useEffect(() => {
    if (!open || !request) return;
    setActiveTab("verification");
    setHistoryPage(1);
    setShowStickyName(false);

    const resetScroll = () => {
      scrollContainerRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    resetScroll();
    const frame = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(frame);
  }, [open, request?.id]);

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
  const visibleOtpValue = otpValue || actions.arrivalOtp || actions.treatmentOtp;

  useEffect(() => {
    if (actions.approvalResult || actions.declineResult) {
      // Small timeout to allow the DOM to render the new elements before scrolling
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 50);
    }
  }, [actions.approvalResult, actions.declineResult]);

  // 4. Initialize verification validation hook
  const verification = useClinicalVerification(open, request);

  // 5. Build combined history records
  const targetPolicy = useMemo(() => normalizePolicyNumber(request?.policy_number), [request]);
  
  const visibleHistory = useMemo(() => {
    const getRecordTime = (r: any) => {
      const d = r.date || r.decided_at || r.created_at;
      return d ? new Date(d).getTime() : 0;
    };

    const combined = [...verification.sheetHistory, ...verification.localHistory].filter((record) => {
      if (recordMatchesHistory(record, targetPolicy)) return true;
      if (request?.patient_name && (record?.patient_name || record?.name)) {
        const reqName = normalizePatientNameForMatch(request.patient_name);
        const recName = normalizePatientNameForMatch(record.patient_name || record.name);
        if (reqName && recName && (reqName === recName || reqName.includes(recName) || recName.includes(reqName))) return true;
      }
      return false;
    });

    // Robust deduplication: ensure no record with the same auth code or ID is shown twice
    const seen = new Set<string>();
    const deduped: any[] = [];

    for (const record of combined) {
      const authCode = String(record?.authorization_code || "").trim().toUpperCase();
      const id = String(record?.id || "").trim();
      const requestId = String(record?.request_id || "").trim();

      // Primary key is the official authorization code; secondary is id/request_id
      const primaryKey = authCode && !["-", "PENDING", "NONE", "NULL"].includes(authCode)
        ? `code:${authCode}`
        : id
        ? `id:${id}`
        : requestId
        ? `req:${requestId}`
        : `${record?.patient_name || ""}|${record?.date || record?.created_at || ""}|${record?.diagnosis || ""}`;

      if (seen.has(primaryKey)) continue;
      seen.add(primaryKey);
      deduped.push(record);
    }

    // Sort newest first
    deduped.sort((a, b) => getRecordTime(b) - getRecordTime(a));
    return deduped;
  }, [verification.sheetHistory, verification.localHistory, targetPolicy]);

  const allowDelete = canDeleteRequestRecord(request);
  const isPending = ["pending", "pending_referral", "pending_authorization", "info_provided"].includes(request?.status || "");
  const isDecided = !isPending;
  const isLocked = isDecided && !request?.is_unlocked;
  const authorizationSlaMinutes = request && (isPending || request.decided_at)
    ? getAuthorizationSlaMinutes(request)
    : null;
  const decisionLabel = getAuthorizationDecisionLabel(request?.status) || "Decision";

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="h-[calc(100dvh_-_0.5rem)] w-[calc(100vw_-_0.5rem)] max-w-[calc(100vw_-_0.5rem)] max-h-[calc(100dvh_-_0.5rem)] rounded-xl border border-slate-200 bg-white p-0 shadow-xl ring-1 ring-slate-200 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0 sm:h-[92dvh] sm:w-[94vw] sm:max-w-4xl sm:max-h-[92dvh] sm:rounded-2xl md:max-w-4xl lg:max-h-[48rem] lg:max-w-4xl [&_*]:min-w-0 [&>button.absolute.right-4]:hidden"
        ref={scrollContainerRef}
        onScroll={(e) => setShowStickyName((e.target as HTMLElement).scrollTop > 60)}
      >
        <div className="sticky top-0 z-[100] w-full h-0 pointer-events-none">
          <div 
            className={cn(
              "absolute top-0 left-0 right-0 rounded-t-xl border-b border-slate-200 bg-white px-5 py-2 transition-opacity duration-200 ease-in-out pointer-events-auto sm:rounded-t-2xl",
              showStickyName ? "opacity-100" : "opacity-0"
            )}
          >
            <p className="break-words text-center text-xs font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere] sm:text-[13px]">
              {requestPatientName || "Unknown Patient"}
            </p>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab as any} className="w-full min-w-0">
        {/* Fixed Header */}
        <div className="relative z-30 flex w-full min-w-0 shrink-0 flex-col gap-2 border-b border-slate-200 px-2.5 pb-2 pt-2.5 sm:px-4 sm:pt-3">
          <button 
            onClick={onClose}
            type="button"
            aria-label="Close authorization review"
            className="absolute right-3 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="flex min-w-0 flex-col gap-2 pr-14 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:pr-14">
            <div className="min-w-0 flex-1 w-full">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-[11px] sm:tracking-widest">
                Clinical Review
              </div>
              <h2 className="break-words text-base font-semibold leading-tight text-slate-900 [overflow-wrap:anywhere] sm:text-xl">
                {requestPatientName || "Unknown Patient"}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>Policy: {requestPolicyNumber || "N/A"}</span>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-left text-[11px] sm:mt-0 sm:w-full sm:max-w-[200px] sm:shrink-0 sm:flex-col sm:items-end sm:text-right sm:text-xs">
              <div className="font-medium text-slate-600">Contact</div>
              <div className="min-w-0 break-words font-semibold text-slate-700 [overflow-wrap:anywhere]" title={request?.patient_phone || undefined}>
                {request?.patient_phone ? `${request.patient_phone}` : "—"}
              </div>
              {request?.patient_email && (
                <div className="min-w-0 break-words text-[10px] font-medium leading-tight text-slate-500 [overflow-wrap:anywhere] sm:mt-0.5 sm:text-[11px]" title={request.patient_email}>
                  {request.patient_email === "no-email@medicode.com" ? (
                    <span className="italic opacity-70">No email provided</span>
                  ) : (
                    request.patient_email
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={cn(
            "grid grid-cols-3 gap-x-2 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2 sm:gap-x-4 sm:px-3",
            request.treatment_submitted_at ? "sm:grid-cols-4" : "sm:grid-cols-3",
          )}>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Submitted</div>
              <div className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-800">{formatNigeriaDateTime(request.created_at)}</div>
            </div>
            {request.treatment_submitted_at && (
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Treatment submitted</div>
                <div className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-800">{formatNigeriaDateTime(request.treatment_submitted_at)}</div>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{decisionLabel}</div>
              <div className="mt-0.5 break-words text-xs font-medium leading-4 text-slate-800">
                {request.decided_at
                  ? formatNigeriaDateTime(request.decided_at)
                  : isPending ? "Awaiting decision" : "Decision time unavailable"}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{request.decided_at || !isPending ? "Turnaround" : "SLA elapsed"}</div>
              <div className={cn(
                "mt-0.5 text-xs font-bold leading-4",
                authorizationSlaMinutes === null ? "text-slate-500" : authorizationSlaColor(authorizationSlaMinutes),
              )}>
                {authorizationSlaMinutes === null
                  ? "—"
                  : `${formatAuthorizationSla(authorizationSlaMinutes)}${request.decided_at || !isPending ? "" : " so far"}`}
              </div>
            </div>
          </div>

          {/* Process Tracker */}
          {!(actions.approvalResult || actions.declineResult) && (
            <>
              {request?.referred_hospital_name ? (
            <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2 w-full">
              {/* Step 1: Referral */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_referral"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-800")} />
                <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["pending_referral"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Referral</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["referral_approved", "referral_accepted", "pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 2: Insurer */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral"].includes(request.status) ? "bg-slate-200" : "bg-slate-800")} />
                <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["referral_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Insurer</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["referral_accepted", "pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 3: Hospital */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["referral_accepted"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["pending_referral", "referral_approved"].includes(request.status) ? "bg-slate-200" : "bg-slate-800")} />
                <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["referral_accepted"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Hospital</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["pending_authorization", "approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 4: Review */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["pending_authorization"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
                <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["pending_authorization"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Review</span>
              </div>
              <div className={cn("h-0.5 sm:h-1 w-2 sm:w-4 flex-shrink-0 transition-colors duration-300", ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "bg-slate-800" : "bg-slate-200")} />
              
              {/* Step 5: Authorized */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-800" : "bg-slate-200")} />
                <span className={cn("text-[10px] sm:text-xs font-medium normal-case", ["approved", "partially_approved", "authorization_approved"].includes(request.status) ? "text-slate-800" : "text-slate-400")}>Authorized</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2">
              {/* Step 1: Verify */}
              <button
                type="button"
                aria-pressed={activeTab === "verification"}
                className="flex min-w-0 flex-col items-center gap-1 rounded-md bg-transparent p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setActiveTab("verification")}
              >
                <div className={cn(
                  "rounded-full transition-all flex items-center justify-center font-bold text-[9px]",
                  isDecided
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-600 text-white"
                    : activeTab === "verification"
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-900 text-slate-900"
                    : "w-2.5 h-2.5 sm:w-3 sm:h-3 bg-slate-800"
                )}>
                  {isDecided ? "✓" : null}
                </div>
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium normal-case",
                  isDecided
                    ? "text-emerald-700"
                    : activeTab === "verification"
                    ? "text-slate-900"
                    : "text-slate-500"
                )}>
                  Verify
                </span>
              </button>

              {/* Line 1-2 */}
              <div className={cn(
                "w-8 sm:w-10 h-[2px] mb-4 transition-colors duration-300",
                isDecided
                  ? "bg-emerald-600"
                  : activeTab === "clinical"
                  ? "bg-slate-800"
                  : "bg-slate-200"
              )} />

              {/* Step 2: Review */}
              <button
                type="button"
                aria-pressed={activeTab === "clinical"}
                className="flex min-w-0 flex-col items-center gap-1 rounded-md bg-transparent p-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setActiveTab("clinical")}
              >
                <div className={cn(
                  "rounded-full transition-all flex items-center justify-center font-bold text-[9px]",
                  isDecided
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-600 text-white"
                    : activeTab === "clinical"
                    ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-white border-[3px] border-slate-900 text-slate-900"
                    : "w-2.5 h-2.5 sm:w-3 sm:h-3 bg-slate-300"
                )}>
                  {isDecided ? "✓" : null}
                </div>
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium normal-case",
                  isDecided
                    ? "text-emerald-700"
                    : activeTab === "clinical"
                    ? "text-slate-900"
                    : "text-slate-400"
                )}>
                  Review
                </span>
              </button>

              {/* Line 2-3 */}
              <div className={cn(
                "w-8 sm:w-10 h-[2px] mb-4 transition-colors duration-300",
                isDecided
                  ? (request?.status === "rejected" ? "bg-rose-600" : "bg-emerald-600")
                  : "bg-slate-200"
              )} />

              {/* Step 3: Decision */}
              <div className="flex flex-col items-center gap-1">
                <div className={cn(
                  "rounded-full transition-all flex items-center justify-center font-bold text-[9px]",
                  isDecided
                    ? (request?.status === "rejected" ? "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-rose-600 text-white" : "w-3.5 h-3.5 sm:w-4 sm:h-4 bg-emerald-600 text-white")
                    : "w-2.5 h-2.5 sm:w-3 sm:h-3 bg-slate-300"
                )}>
                  {isDecided ? (request?.status === "rejected" ? "✗" : "✓") : null}
                </div>
                <span className={cn(
                  "text-[10px] sm:text-xs font-medium normal-case",
                  isDecided
                    ? (request?.status === "rejected" ? "text-rose-700" : "text-emerald-700")
                    : "text-slate-400"
                )}>
                  {isDecided
                    ? (request?.status === "rejected" ? "Declined" : request?.status === "partially_approved" ? "Partially Approved" : "Approved")
                    : "Decision"}
                </span>
              </div>
            </div>
          )}

          {/* TabsList */}
          <TabsList className="flex w-full h-10 bg-slate-100/80 p-1 gap-1 mt-3 sm:h-11">
            <TabsTrigger
              value="verification"
              className="flex-1 rounded-md text-[11px] sm:text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=active]:shadow-sm transition-colors h-full border-0 whitespace-normal leading-tight px-1"
            >
              Patient Verify & History
            </TabsTrigger>
            <TabsTrigger
              value="clinical"
              className="flex-1 rounded-md text-[11px] sm:text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=active]:shadow-sm transition-colors h-full border-0 whitespace-normal leading-tight px-1"
            >
              Clinical Review
            </TabsTrigger>
          </TabsList>
            </>
          )}
        </div>

                        {/* Modal body container (Scrollable) */}
        <div className="w-full min-w-0 space-y-2.5 p-2 sm:space-y-3 sm:p-3.5">
          {/* Locked status warning */}
          {request?.deletion_status === "awaiting_admin_approval" && (
            <div className="rounded-lg border border-slate-200 border-l-4 border-l-rose-700 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertTriangle className="mt-0.5 w-4 h-4 text-rose-800 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-slate-900">Awaiting deletion approval</p>
                <p className="font-normal text-slate-600 mt-0.5">
                  This request has been requested for deletion and is awaiting admin approval. Modifications are disabled.
                </p>
              </div>
            </div>
          )}

          {/* Referral declined status alert */}
          {request?.status === "referral_declined" && (
            <div className="rounded-lg border border-slate-200 border-l-4 border-l-amber-700 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertTriangle className="mt-0.5 w-4 h-4 text-amber-800 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-slate-900">Referral declined by hospital</p>
                <p className="font-normal text-slate-600 mt-0.5">
                  Reason: <span className="font-medium text-slate-900">{request.decision_reason || "No reason provided"}</span>
                </p>
                <p className="font-medium text-slate-700 mt-1">
                  Please select a new referred hospital in the section below and click "Reassign Referral" to route it to another facility.
                </p>
              </div>
            </div>
          )}

          {/* OTP Banner on Approved View */}
          {actions.approvalResult && visibleOtpValue && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 sm:mb-3 sm:px-3">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Patient OTP / Arrival PIN
                </div>
                <div className="font-mono text-base font-semibold tracking-wider text-slate-900 sm:text-lg">
                  {visibleOtpValue}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0 border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                  aria-label="Copy patient OTP"
                  onClick={async () => {
                    try {
                      await writeClipboardText(visibleOtpValue);
                      toast({ title: "OTP Copied!" });
                    } catch {
                      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the OTP manually." });
                    }
                  }}
                  title="Copy OTP"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="default"
                  className="h-10 min-w-0 bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                  onClick={handleResendOtp}
                  disabled={isResending}
                  title="Resend OTP"
                >
                  {isResending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Resend
                </Button>
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
            />
          ) : (
            <>
              {/* ─── Tab 1: Patient Verify & History ─── */}
              <TabsContent value="verification" className="space-y-4 mt-0">
                {/* Patient registry NHIS verify card */}
                <PatientVerifyCard
                  request={request}
                  checking={verification.checking}
                  verificationLoadFailed={verification.verificationLoadFailed}
                  onRetryVerification={() => void verification.runVerificationSuite()}
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
                  requestingHospitalCode={requestingHospitalCode ?? undefined}
                />

                {/* Local and spreadsheet claims history */}
                <ClinicalHistory
                  request={request}
                  visibleHistory={visibleHistory}
                  historyPage={historyPage}
                  setHistoryPage={setHistoryPage}
                  requestPatientName={requestPatientName}
                  requestPolicyNumber={requestPolicyNumber}
                  requestBeneficiaryNumber={verification.matchedBeneficiaryNumber || request?.beneficiary_number || null}
                  checking={verification.historyChecking}
                  historyLoadFailed={verification.historyLoadFailed}
                  onRetryHistory={() => void verification.runHistoryLookup()}
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
                {/* Locked status banner */}
                {isLocked && (
                  <div className="p-4 rounded-2xl text-xs border bg-slate-100/90 border-slate-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-800 shadow-xs animate-in fade-in duration-300">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                        <Lock className="w-4 h-4 text-slate-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black uppercase tracking-wider text-xs text-slate-900 flex items-center gap-2">
                          <span>Record Locked</span>
                          <Badge variant="outline" className="text-[10px] font-black uppercase bg-slate-200 text-slate-700 border-0 px-1.5 py-0">
                            {request?.status?.replace("_", " ")}
                          </Badge>
                        </p>
                        <p className="font-medium text-slate-500 text-[11px] mt-0.5">
                          This authorization has been decided and is locked for clinical data integrity.
                          {role === "admin" || role === "utilization_manager_lead" ? " A Utilization Manager Lead or Admin can unlock this record for revision." : " A Utilization Manager Lead must unlock this record before it can be revised."}
                        </p>
                      </div>
                    </div>
                    {(role === "admin" || role === "utilization_manager_lead") && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={actions.handleUnlockRecord}
                        disabled={actions.unlockLoading}
                        className="shrink-0 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider gap-1.5 shadow-sm h-9 px-4"
                      >
                        {actions.unlockLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                        Unlock Record
                      </Button>
                    )}
                  </div>
                )}

                {/* Unlocked status banner */}
                {isDecided && request?.is_unlocked && (
                  <div className="p-4 rounded-2xl text-xs border bg-amber-50 border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950 shadow-xs animate-in fade-in duration-300">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800 shrink-0">
                        <Unlock className="w-4 h-4 text-amber-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black uppercase tracking-wider text-xs text-amber-900">
                          Record Unlocked for Revision
                        </p>
                        <p className="font-medium text-amber-700 text-[11px] mt-0.5">
                          Amendments are enabled. Submitting an approval or decline will re-lock the record and notify the hospital with the updated details.
                        </p>
                      </div>
                    </div>
                    {(role === "admin" || role === "utilization_manager_lead") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={actions.handleLockRecord}
                        disabled={actions.unlockLoading}
                        className="shrink-0 rounded-xl border-amber-300 bg-white hover:bg-amber-100 text-amber-900 text-xs font-black uppercase tracking-wider gap-1.5 h-9 px-4"
                      >
                        {actions.unlockLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        Re-lock Record
                      </Button>
                    )}
                  </div>
                )}

                {/* OTP Banner */}
                {visibleOtpValue && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 sm:mb-3 sm:px-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Patient OTP / Arrival PIN
                      </div>
                      <div className="font-mono text-base font-semibold tracking-wider text-slate-900 sm:text-lg">
                        {visibleOtpValue}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                        aria-label="Copy patient OTP"
                        onClick={async () => {
                          try {
                            await writeClipboardText(visibleOtpValue);
                            toast({ title: "OTP Copied!" });
                          } catch {
                            toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the OTP manually." });
                          }
                        }}
                        title="Copy OTP"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        className="h-10 min-w-0 bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                        onClick={handleResendOtp}
                        disabled={isResending}
                        title="Resend OTP"
                      >
                        {isResending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Resend
                      </Button>
                    </div>
                  </div>
                )}

                {/* Standard Request Facility Banner (Non-Referral) */}
                {!request?.referred_hospital_name && (request?.requesting_hospital_name || requestingHospitalName) && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 mb-3 min-w-0">
                    <div className="text-[11px] font-medium text-slate-500">
                      Requesting Facility
                    </div>
                    <div className="text-sm sm:text-base font-semibold text-slate-900 mt-1 leading-snug break-words [overflow-wrap:anywhere]">
                      {areHospitalNamesMatching(requestingHospitalName, primaryHospital?.hcp_name) && primaryHospital?.hcp_name
                        ? primaryHospital.hcp_name
                        : requestingHospitalName || "Unknown Hospital"}
                    </div>
                    {formattedNotes && (
                      <div className="text-xs font-normal text-slate-600 mt-1 leading-relaxed break-words [overflow-wrap:anywhere]">
                        <span className="font-medium text-slate-700">Clinical notes:</span> {formattedNotes}
                      </div>
                    )}
                  </div>
                )}

                {/* Referral Banner */}
                {request?.referred_hospital_name && (
                  <div className="rounded-lg border border-slate-200 border-l-4 border-l-sky-700 bg-slate-50/60 px-3 py-2.5 mb-3 min-w-0">
                    <div className="text-[11px] font-medium text-slate-500">
                      Referral Request
                    </div>
                    <div className="text-sm sm:text-base font-semibold text-slate-900 mt-1 leading-snug break-words [overflow-wrap:anywhere]">
                      Referred to: {request.referred_hospital_name}
                    </div>
                    <div className="text-xs font-normal text-slate-600 mt-1 leading-relaxed break-words [overflow-wrap:anywhere]">
                      {formattedNotes ? `Notes from ${requestingHospitalName}: ${formattedNotes}` : `Patient referred by ${requestingHospitalName} for further clinical evaluation and management.`}
                    </div>
                  </div>
                )}

                                {/* Diagnosis Card */}
                <div className="bg-white rounded-lg p-3 border border-slate-200 mb-2.5 space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div className="text-[11px] sm:text-xs font-medium text-slate-600 flex flex-wrap items-center gap-2">
                      {request?.referred_hospital_name ? "Original Referral Diagnosis" : "Proposed Diagnosis"}
                      {request?.referred_hospital_name && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">Referral</span>}
                    </div>
                    <div className="w-fit rounded-md bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {request?.diagnosis_code || "ICD-10"}
                    </div>
                  </div>
                  
                  <textarea 
                    className="w-full p-2.5 border border-slate-100 rounded-lg text-xs sm:text-[13px] font-semibold text-slate-800 bg-slate-50 min-h-[60px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                    placeholder="Diagnosis..."
                    value={actions.editDiagnosis}
                    onChange={(e) => actions.setEditDiagnosis(e.target.value)}
                    readOnly={isLocked || request?.deletion_status === "awaiting_admin_approval" || role === "hospital" || !!request?.referred_hospital_name}
                  />

                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    {request?.referred_hospital_name ? "Current Treatment Request" : "Proposed Treatment"}
                    {request?.referred_hospital_name && <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">Referred Hospital</span>}
                  </div>
                  
                  <textarea 
                    className="w-full p-2.5 border border-slate-100 rounded-lg text-xs sm:text-[13px] font-semibold text-slate-800 bg-slate-50 min-h-[76px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                    placeholder="Treatment Plan..."
                    value={actions.editTreatment}
                    onChange={(e) => actions.setEditTreatment(e.target.value)}
                    onBlur={() => {
                      if (isLocked || role === "hospital" || !(["hospital", "hospital_portal"].includes(role ?? ""))) return;
                      void tariffSearch.parseTreatmentText({ replaceAuto: true, quiet: true });
                    }}
                    readOnly={isLocked || request?.deletion_status === "awaiting_admin_approval" || role === "hospital"}
                  />
                  
                  {/* Referral details container */}
                  <div className="space-y-2.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2.5 mt-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] sm:text-xs font-medium text-slate-500">
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
                          disabled={isLocked || request?.deletion_status === "awaiting_admin_approval" || role === "hospital"}
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
                      <span className="text-[11px] sm:text-xs font-medium text-slate-500">
                        Requesting Hospital
                      </span>
                      <p className="text-[13px] sm:text-[14px] font-bold text-slate-800 mt-1 break-words [overflow-wrap:anywhere]">
                        {request.hospital_name || "N/A"}
                      </p>
                    </div>
                    <div className="space-y-1 text-right shrink-0">
                      <span className="text-[11px] sm:text-xs font-medium text-slate-500">
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
                    approvedTotal={tariffSearch.approvedTotal}
                    totalApprovedAmount={tariffSearch.approvedTotal}
                    changeItemQuantity={tariffSearch.changeItemQuantity}
                    isHospitalDirected={isHospitalDirected}
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
                    readOnly={isLocked}
                  />
                </div>

                {/* Decision Section */}
                <div className="mt-4 mb-2">
                  <div className="text-[13px] sm:text-[14px] font-extrabold text-slate-800 uppercase tracking-wide mb-2 flex items-center justify-between">
                    <span>
                      {isLocked ? "Decision Note (Saved)" : "Review Decision"} {!isLocked && <span className="text-red-500">*</span>}
                    </span>
                    {!isLocked && (
                      <span className="text-[11px] text-slate-400 font-normal lowercase normal-case">required for decision</span>
                    )}
                  </div>
                  <textarea 
                    className="w-full p-3 border border-slate-100 rounded-xl text-[13px] sm:text-[14px] font-bold text-slate-800 bg-slate-50 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-500 mt-1 disabled:opacity-80" 
                    placeholder={isLocked ? "No decision note recorded" : "Enter reason for approval or decline..."}
                    value={actions.editDecisionNote}
                    onChange={(e) => actions.setEditDecisionNote(e.target.value)}
                    readOnly={isLocked || request?.deletion_status === "awaiting_admin_approval"}
                  />
                </div>

                {/* Tab 2 footer */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 sm:pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    {isLocked ? (
                      <Badge variant="outline" className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 border-slate-200 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-slate-500" /> Record Locked ({request?.status?.replace("_", " ")})
                      </Badge>
                    ) : isDecided && request?.is_unlocked ? (
                      <Badge variant="outline" className="px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border-amber-300 flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5 text-amber-700" /> Unlocked for Revision
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto h-11 sm:h-12 px-6 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition-all sm:flex-shrink-0 sm:min-w-[100px]"
                      onClick={onClose}
                    >
                      Close
                    </Button>

                    {isLocked ? (
                      (role === "admin" || role === "utilization_manager_lead") && (
                        <Button
                          onClick={actions.handleUnlockRecord}
                          disabled={actions.unlockLoading}
                          className="w-full sm:w-auto h-11 sm:h-12 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                        >
                          {actions.unlockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                          Unlock Record
                        </Button>
                      )
                    ) : (
                      <>
                        <Button
                          className="w-full sm:w-auto sm:flex-1 h-11 sm:h-12 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                          onClick={actions.handleDecline}
                          disabled={actions.processing || !actions.editDecisionNote}
                        >
                          {actions.processingAction === "decline" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          {isDecided ? "Update & Decline" : "Decline"}
                        </Button>
                        <Button
                          className="w-full sm:w-auto sm:flex-1 h-11 sm:h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5"
                          onClick={actions.handleApprove}
                          disabled={actions.processing}
                        >
                          {actions.processingAction === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          {isDecided ? "Update & Re-Approve" : "Approve"}
                        </Button>
                      </>
                    )}
                  </div>
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
            <AlertDialogTitle>Request Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              This sends the authorization to the Utilization Manager Lead for review. It will only be permanently deleted after approval. Type{" "}
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
              {actions.processing ? "Submitting..." : "Submit Request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
