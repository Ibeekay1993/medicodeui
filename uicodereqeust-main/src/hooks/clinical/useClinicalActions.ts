import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { writeClipboardText } from "@/lib/clipboard";
import { useAuth } from "@/contexts/AuthContext";
import {
  TariffOption,
  itemQuantity,
  itemTotal,
  itemUnitPrice,
  getInitials,
  formatNaira,
  cleanPatientName,
  parseReferralTreatment,
} from "@/lib/clinicalUtils";
import { normalizeHospitalName, areHospitalNamesMatching } from "@/lib/authorizations-helpers";

function formatWhatsAppPhone(value: unknown): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

/**
 * Extracts a human-readable string from a clinical_notes or decision_reason value.
 * WhatsApp-sourced requests store a JSON blob in clinical_notes like:
 *   {"source":"whatsapp","captured_at":"...","review_decision":"..."}
 * This helper parses that JSON and returns the review_decision / decision_reason
 * field, or other human-readable parts, rather than the raw JSON string.
 */
function parseClinicalNote(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      const parts: string[] = [];
      if (parsed.review_decision) parts.push(parsed.review_decision);
      else if (parsed.decision_reason) parts.push(parsed.decision_reason);
      if (parsed.notes) parts.push(parsed.notes);
      if (parsed.patient_id_free_text) parts.push(`Patient ID: ${parsed.patient_id_free_text}`);
      if (parsed.referral_to) parts.push(`Referral To: ${parsed.referral_to}`);
      return parts.join(" • ");
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function getApprovalClosing(isPartial: boolean): string {
  return isPartial
    ? "Please proceed only with the approved services listed above. Declined services must not be provided under this authorization. For clarification, please contact Ronsberger HMO before treatment."
    : "Please proceed with the approved services listed above. For clarification, please contact Ronsberger HMO before treatment.";
}

function formatApprovalServices(items: any[], treatment: string): string {
  if (!items.length) return `Approved Services:\n${treatment}`;
  const approvedLines = items
    .filter((item) => !item.declined)
    .map((item) => `${item.code || "NHIA"} - ${item.name}: ${itemQuantity(item)}`)
    .join("\n");
  const declinedLines = items
    .filter((item) => item.declined)
    .map((item) => {
      const line = `${item.code || "NHIA"} - ${item.name}: ${itemQuantity(item)}`;
      return `~${line}~${item.decline_reason ? ` (Reason: ${item.decline_reason})` : ""}`;
    })
    .join("\n");
  return `Approved Services:\n${approvedLines || "None"}${
    declinedLines ? `\n\nDeclined Services:\n${declinedLines}` : ""
  }`;
}

async function resolvePatientPhone(request: any): Promise<string> {
  if (request?.patient_phone) {
    const formatted = formatWhatsAppPhone(request.patient_phone);
    if (formatted) return formatted;
  }
  const notes = request?.clinical_notes;
  if (notes) {
    try {
      const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
      if (parsed?.patient_phone) return formatWhatsAppPhone(parsed.patient_phone);
    } catch {
      // Non-JSON notes
    }
  }
  if (request?.policy_number) {
    try {
      const { data } = await supabase
        .from("patients" as any)
        .select("phone_number")
        .eq("policy_number", request.policy_number)
        .maybeSingle();
      if (data?.phone_number) return formatWhatsAppPhone(data.phone_number);
    } catch (e) {
      console.warn("Could not resolve patient phone from patients table:", e);
    }
  }
  return "";
}

async function resolveRequestingHospitalPhone(request: any): Promise<string> {
  // 1. Check clinical_notes for WhatsApp sender phone
  const notes = request?.clinical_notes;
  if (notes) {
    try {
      const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
      if (parsed?.whatsapp_sender_phone) return formatWhatsAppPhone(parsed.whatsapp_sender_phone);
    } catch {
      // Non-JSON notes
    }
  }

  // 2. Check whatsapp_messages linked to this authorization request
  if (request?.id) {
    try {
      const { data } = await supabase
        .from("whatsapp_messages" as any)
        .select("phone_number")
        .eq("authorization_request_id", request.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.phone_number) return formatWhatsAppPhone(data.phone_number);
    } catch (e) {
      console.warn("Error looking up whatsapp_messages for hospital phone:", e);
    }
  }

  const hospitalId = request?.requesting_hospital_id || request?.hospital_id;

  // 3. Check hospital_whatsapp_contacts table for this hospital
  if (hospitalId) {
    try {
      const { data: contact } = await supabase
        .from("hospital_whatsapp_contacts" as any)
        .select("phone_number")
        .eq("hospital_id", hospitalId)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contact?.phone_number) return formatWhatsAppPhone(contact.phone_number);
    } catch (e) {
      console.warn("Error looking up hospital_whatsapp_contacts:", e);
    }
  }

  // 4. Check hospitals table by hospital_id
  if (hospitalId) {
    try {
      const { data: hosp } = await supabase
        .from("hospitals")
        .select("phone")
        .eq("id", hospitalId)
        .maybeSingle();
      if (hosp?.phone) return formatWhatsAppPhone(hosp.phone);
    } catch (e) {
      console.warn("Error looking up hospitals table by ID:", e);
    }
  }

  // 5. Check hospitals table by hospital_name
  if (request?.hospital_name) {
    try {
      const { data: hosp } = await supabase
        .from("hospitals")
        .select("phone")
        .ilike("name", String(request.hospital_name).trim())
        .maybeSingle();
      if (hosp?.phone) return formatWhatsAppPhone(hosp.phone);
    } catch (e) {
      console.warn("Error looking up hospitals table by name:", e);
    }
  }

  return "";
}

interface UseClinicalActionsProps {
  open: boolean;
  request: any;
  approvedItems: TariffOption[];
  approvedTotal: number;
  onClose: () => void;
  onUpdated: () => void;
  initialOtpValue?: string;
  editTreatment: string;
  setEditTreatment: (value: string) => void;
}

export function useClinicalActions({
  open,
  request,
  approvedItems,
  approvedTotal,
  onClose,
  onUpdated,
  initialOtpValue,
  editTreatment,
  setEditTreatment,
}: UseClinicalActionsProps) {
  const { toast } = useToast();
  const { user, fullName, role } = useAuth();

  const [processing, setProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<
    "approve" | "decline" | "defer" | "save" | "delete" | null
  >(null);

  const [editDiagnosis, setEditDiagnosis] = useState("");
  const [editCurrentDiagnosis, setEditCurrentDiagnosis] = useState("");
  const [editReferralHospitalId, setEditReferralHospitalId] = useState<string | null>(null);
  const [editReferralHospitalName, setEditReferralHospitalName] = useState("");
  const [referralCollapsed, setReferralCollapsed] = useState(true);
  const [editStatus, setEditStatus] = useState("pending");
  const [editDecisionNote, setEditDecisionNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const [approvalResult, setApprovalResult] = useState<{
    authCode: string;
    patientName: string;
    policyNumber: string;
    hospitalName: string;
    diagnosis: string;
    currentDiagnosis?: string;
    treatment: string;
    items: TariffOption[];
    totalAmount: number;
  } | null>(null);

  const [declineResult, setDeclineResult] = useState<{
    patientName: string;
    policyNumber: string;
    hospitalName: string;
    diagnosis: string;
    treatment: string;
    reason: string;
  } | null>(null);

  const [otpValue, setOtpValue] = useState<string | null>(initialOtpValue || null);
  const [otpLoading, setOtpLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const nurseDisplayName = fullName || user?.user_metadata?.full_name || user?.email || "Unknown Utilization Manager";
  const nurseInitials = getInitials(nurseDisplayName);

  const lastRequestIdRef = useRef<string | null>(null);

  // Initialize form fields and decision template when modal opens/changes
  useEffect(() => {
    if (!open || !request) {
      lastRequestIdRef.current = null;
      setApprovalResult(null);
      setDeclineResult(null);
      return;
    }

    // Only run initial setup when opening a new request or re-opening modal
    if (lastRequestIdRef.current !== request.id) {
      lastRequestIdRef.current = request.id;

      setEditDiagnosis(request.diagnosis || "");
      setEditCurrentDiagnosis(request.current_treatment_diagnosis || "");
      setEditReferralHospitalId(request.referred_hospital_id || null);
      setEditReferralHospitalName(request.referred_hospital_name || "");
      setReferralCollapsed(!request.referred_hospital_name);
      setEditStatus(request.status || "pending");
      setEditDecisionNote(
        parseClinicalNote(request.decision_reason) ||
        parseClinicalNote(request.clinical_notes) ||
        parseClinicalNote(request.rejection_reason) ||
        ""
      );
      setRejectReason("");
      if (initialOtpValue) setOtpValue(initialOtpValue);

      let parsedItems = Array.isArray(request.approved_items)
        ? request.approved_items.map((item: any) => ({
            code: item.code,
            name: item.name,
            category: item.category,
            price: Number(item.amount || item.price || 0),
            unitPrice: Number(item.unit_price || item.unitPrice || item.price || item.amount || 0),
            quantity: Number(item.quantity || 1),
            frequency: item.frequency || null,
            duration: item.duration || null,
            declined: Boolean(item.declined),
          }))
        : [];

      // Fallback: If approved_items is empty but single tariff was saved
      if (parsedItems.length === 0 && (request.approved_tariff_name || request.approved_tariff_code)) {
        parsedItems = [{
          code: request.approved_tariff_code || "NHIA",
          name: request.approved_tariff_name || request.treatment || "Approved Service",
          category: request.approved_tariff_category || "Tariff Item",
          price: Number(request.approved_tariff_amount || request.total_amount || 0),
          unitPrice: Number(request.approved_tariff_amount || request.total_amount || 0),
          quantity: 1,
          frequency: null,
          duration: null,
          declined: false,
        }];
      }

      // Compute total accurately from line items (excluding declined)
      const computedItemsTotal = parsedItems
        .filter((item: any) => !item.declined)
        .reduce((sum: number, item: any) => sum + (Number(item.price || (item.unitPrice * item.quantity)) || 0), 0);

      const resolvedTotal = computedItemsTotal > 0
        ? computedItemsTotal
        : Number(request.total_amount || request.approved_tariff_amount || 0);

      // If opening an already decided request, show the post-review template first
      if (request.status === "approved" || request.status === "partially_approved") {
        setApprovalResult({
          authCode: request.authorization_code || "Pending",
          patientName: cleanPatientName(request.patient_name),
          policyNumber: request.policy_number || "N/A",
          hospitalName:
            request.claiming_hospital_name ||
            request.referred_hospital_name ||
            request.hospital_name ||
            "N/A",
          diagnosis: request.diagnosis || "",
          treatment: request.treatment || "",
          items: parsedItems,
          totalAmount: resolvedTotal,
        });
        setDeclineResult(null);
      } else if (request.status === "rejected") {
        setDeclineResult({
          patientName: cleanPatientName(request.patient_name),
          policyNumber: request.policy_number || "N/A",
          hospitalName: request.hospital_name || "N/A",
          diagnosis: request.diagnosis || "",
          treatment: request.treatment || "",
          reason: parseClinicalNote(request.decision_reason) || parseClinicalNote(request.clinical_notes) || parseClinicalNote(request.rejection_reason) || "Declined",
        });
        setApprovalResult(null);
      } else {
        setApprovalResult(null);
        setDeclineResult(null);
      }
    }
  }, [open, request?.id]);

  // Fetch PIN if request is pending/under-review and has a patient email.
  // Rule: Only show "Generating PIN..." when a new PIN is actually being created.
  //       If a PIN already exists in the DB, show it immediately (no loading flash).
  const [arrivalOtp, setArrivalOtp] = useState<string | null>(null);
  const [arrivalOtpVerified, setArrivalOtpVerified] = useState<boolean>(false);
  const [treatmentOtp, setTreatmentOtp] = useState<string | null>(null);
  const [treatmentOtpVerified, setTreatmentOtpVerified] = useState<boolean>(false);

  // Re-run fetching whenever request changes.
  useEffect(() => {
    const isPendingOrReview = request && (
      request.status === "pending" ||
      request.status === "pending_referral" ||
      request.status === "pending_authorization" ||
      request.status === "referral_accepted" ||
      request.status === "referral_approved" ||
      request.status === "approved"
    );
    if (!open || !request || !isPendingOrReview) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: otpData, error: otpError } = await supabase.rpc("get_otp_value" as any, {
          p_request_id: request.id,
          p_otp_type: "ARRIVAL"
        });

        if (cancelled) return;

        let foundOtp = null;
        let foundOtpVerified = false;

        if (!otpError && otpData) {
          const row = Array.isArray(otpData) ? otpData[0] : otpData;
          if (row?.otp_value) {
            foundOtp = row.otp_value;
            foundOtpVerified = Boolean(row.verified);
          }
        }

        setArrivalOtp(foundOtp);
        setTreatmentOtp(foundOtp);
        setArrivalOtpVerified(foundOtpVerified);
        setTreatmentOtpVerified(foundOtpVerified);
        setOtpLoading(false);
      } catch (err) {
        console.error("OTP value fetch error:", err);
        if (!cancelled) setOtpLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, request?.id]);

  // Auto-save draft changes every 1.5 seconds — only while the request is genuinely pending.
  // We guard against ALL decided statuses (not just "pending") because the local
  // approvalResult/declineResult state can briefly lag behind on re-open, which would otherwise
  // write ghost auto-saves over already-decided records.
  const DECIDED_STATUSES = ["approved", "partially_approved", "rejected", "referral_approved", "referral_accepted", "deferred"];
  useEffect(() => {
    if (
      open &&
      request &&
      !DECIDED_STATUSES.includes(request.status) &&
      !approvalResult &&
      !declineResult
    ) {
      if (request.deletion_status === "awaiting_admin_approval") return;
      const timer = setTimeout(async () => {
        const approvedPayload = approvedItems.map((item) => ({
          code: item.code,
          name: item.name,
          category: item.category,
          unit_price: itemUnitPrice(item),
          quantity: itemQuantity(item),
          amount: itemTotal(item),
          frequency: item.frequency || null,
          duration: item.duration || null,
          matched_via: item.matched_via,
          matched_text: item.matched_text,
          confidence: item.confidence,
          declined: Boolean(item.declined),
          decline_reason: item.decline_reason || null,
        }));

        await supabase
          .from("authorization_requests")
          .update({
            diagnosis: editDiagnosis,
            treatment: editTreatment,
            referred_hospital_id: editReferralHospitalId,
            referred_hospital_name: editReferralHospitalName.trim() || null,
            claiming_hospital_id:
              editReferralHospitalId || request.claiming_hospital_id || request.hospital_id || null,
            claiming_hospital_name:
              editReferralHospitalName.trim() || request.claiming_hospital_name || request.hospital_name || null,
            approved_items: approvedPayload,
          } as any)
          .eq("id", request.id);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [
    editDiagnosis,
    editTreatment,
    editReferralHospitalId,
    editReferralHospitalName,
    approvedItems,
    open,
    request,
    approvalResult,
    declineResult,
  ]);

  const persistRequestUpdate = useCallback(
    async (targetStatus: string, officialLabel: string, options?: { closeAfter?: boolean }) => {
      if (request?.deletion_status === "awaiting_admin_approval") {
        toast({
          variant: "destructive",
          title: "Request locked",
          description: "This request is awaiting deletion approval and cannot be modified.",
        });
        setProcessingAction(null);
        return false;
      }
      setProcessing(true);
      try {
        let currentCode: string | null = null;
        let dbStatus = targetStatus;

        if (targetStatus === "approved") {
          const isStage2 = request.status === "pending_referral" && request.source === "hospital_portal";
          if (isStage2) {
            dbStatus = "referral_approved";
            if (request.authorization_code) {
              currentCode = request.authorization_code;
            } else {
              const { data: newCode, error: codeErr } = await supabase.rpc("generate_referral_code" as any, {
                nurse_initials: nurseInitials,
              } as any);
              if (codeErr) throw codeErr;
              currentCode = String(newCode || "");
            }
          } else {
            if (request.authorization_code && !request.authorization_code.startsWith("REF/")) {
              currentCode = request.authorization_code;
            } else {
              const { data: newCode, error: codeErr } = await supabase.rpc("generate_auth_code" as any, {
                nurse_initials: nurseInitials,
              } as any);
              if (codeErr) throw codeErr;
              currentCode = String(newCode || "");
            }
          }

          if (dbStatus === "approved") {
            const hasApproved = approvedItems.some(i => !i.declined);
            const hasDeclined = approvedItems.some(i => i.declined);
            if (!hasApproved && hasDeclined) {
              dbStatus = "rejected";
            } else if (hasApproved && hasDeclined) {
              dbStatus = "partially_approved";
            }
          }
        }

        const decisionReason = editDecisionNote.trim() || null;
        const clinicalNotes = editDecisionNote.trim() || null;
        const decidedAt = new Date().toISOString();
        const approvedPayload = approvedItems.map((item) => ({
          code: item.code,
          name: item.name,
          category: item.category,
          unit_price: itemUnitPrice(item),
          quantity: itemQuantity(item),
          amount: itemTotal(item),
          frequency: item.frequency || null,
          duration: item.duration || null,
          matched_via: item.matched_via,
          matched_text: item.matched_text,
          confidence: item.confidence,
          declined: Boolean(item.declined),
          decline_reason: item.decline_reason || null,
        }));
        const firstApprovedItem = approvedItems.find((item) => !item.declined) || null;
        const approvedSummary = approvedPayload
          .filter((item) => !item.declined)
          .map((item) => `${item.code || "NHIA"} - ${item.name}`)
          .join("; ");
        const treatingHospitalId =
          editReferralHospitalId || request.claiming_hospital_id || request.hospital_id || null;
        const treatingHospitalName =
          editReferralHospitalName.trim() ||
          request.claiming_hospital_name ||
          request.hospital_name ||
          null;

        // Determine referral assignment:
        // - If user explicitly selected a referral hospital in the form, use that
        // - Otherwise (stage 2 approval), preserve the existing referral assignment
        let finalReferredHospitalId = editReferralHospitalName.trim()
          ? editReferralHospitalId
          : request.referred_hospital_id || null;
        const finalReferredHospitalName = editReferralHospitalName.trim()
          ? editReferralHospitalName.trim()
          : request.referred_hospital_name || null;

        // If we have a name but no ID, try to look up the ID by name
        if (!finalReferredHospitalId && finalReferredHospitalName) {
          const foundId = await findHospitalIdByName(finalReferredHospitalName);
          if (foundId) {
            finalReferredHospitalId = foundId;
          }
          // If not found, we leave the ID as null and keep the name; the hospital will need to be matched by name in the query (which we will also fix later)
        }

        const { error: updateError } = await supabase
          .from("authorization_requests")
          .update({
            status: dbStatus,
            diagnosis: editDiagnosis,
            current_treatment_diagnosis: editCurrentDiagnosis,
            treatment:
              (dbStatus === "approved" || dbStatus === "partially_approved") && approvedSummary
                ? approvedSummary
                : (request.referred_hospital_name && !editTreatment.includes("[PROPOSED TREATMENT PLAN"))
                ? `[ORIGINAL REFERRAL REASON (From ${request.requesting_hospital_name || request.hospital_name || "Referring Hospital"})]:\n${parseReferralTreatment(request.treatment || "").original || "Not specified"}\n\n[PROPOSED TREATMENT PLAN (From ${request.referred_hospital_name})]:\n${editTreatment}`
                : editTreatment,
            requesting_hospital_id: request.requesting_hospital_id || request.hospital_id || null,
            requesting_hospital_name: request.requesting_hospital_name || request.hospital_name || null,
            referring_hospital_id: request.referring_hospital_id || request.hospital_id || null,
            referring_hospital_name: request.referring_hospital_name || request.hospital_name || null,
            referred_hospital_id: finalReferredHospitalId,
            referred_hospital_name: finalReferredHospitalName,
            claiming_hospital_id:
              (dbStatus === "approved" || dbStatus === "partially_approved")
                ? treatingHospitalId
                : request.claiming_hospital_id || request.hospital_id || null,
            claiming_hospital_name:
              (dbStatus === "approved" || dbStatus === "partially_approved")
                ? treatingHospitalName
                : request.claiming_hospital_name || request.hospital_name || null,
            authorization_code: currentCode,
            decision_reason: decisionReason,
            clinical_notes: clinicalNotes,
            decided_at: decidedAt,
            decided_by: user?.id,
            approved_by: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? user?.id : null,
            nurse_initials: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? nurseInitials : null,
            authorized_by_name: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? nurseDisplayName : null,
            authorized_by_email: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? user?.email ?? null : null,
            updated_at: decidedAt,
            approved_tariff_code: (dbStatus === "approved" || dbStatus === "partially_approved") ? firstApprovedItem?.code ?? null : null,
            approved_tariff_name: (dbStatus === "approved" || dbStatus === "partially_approved") ? firstApprovedItem?.name ?? null : null,
            approved_tariff_category:
              (dbStatus === "approved" || dbStatus === "partially_approved") ? firstApprovedItem?.category ?? null : null,
            approved_tariff_amount:
              (dbStatus === "approved" || dbStatus === "partially_approved") && firstApprovedItem ? itemTotal(firstApprovedItem) : null,
            approved_items: (dbStatus === "approved" || dbStatus === "partially_approved") ? approvedPayload : [],
            total_amount: (dbStatus === "approved" || dbStatus === "partially_approved") ? approvedTotal : 0,
            is_unlocked: false,
          } as any)
          .eq("id", request.id);

        if (updateError) throw updateError;

        // Audit Log for Security (asynchronous)
        supabase.from("authorization_logs").insert({
          request_id: request.id,
          action: `SET_STATUS_${dbStatus.toUpperCase()}`,
          performed_by: user?.id,
          details: {
            previous_status: request.status,
            new_status: dbStatus,
            diagnosis: editDiagnosis,
            auth_code: currentCode,
            referral_to: editReferralHospitalName.trim() || null,
            claiming_hospital_id: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? treatingHospitalId : null,
            nurse_initials: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? nurseInitials : null,
            authorized_by_name: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? nurseDisplayName : null,
            authorized_by_user_id: (dbStatus === "approved" || dbStatus === "partially_approved" || dbStatus === "referral_approved") ? user?.id : null,
            ip: "client-side",
            timestamp: new Date().toISOString(),
          },
        }).then(({ error }) => { if (error) console.error("Async log error:", error); });

        if (dbStatus === "approved" || dbStatus === "referral_approved" || dbStatus === "partially_approved") {
          setApprovalResult({
            authCode: currentCode || "Pending",
            patientName: cleanPatientName(request.patient_name),
            policyNumber: request.policy_number || "N/A",
            hospitalName: treatingHospitalName || request.hospital_name || "N/A",
            diagnosis: editDiagnosis,
            treatment: approvedSummary || editTreatment,
            items: approvedItems,
            totalAmount: approvedTotal,
          });
          setDeclineResult(null);
        }

        if (dbStatus === "rejected") {
          setDeclineResult({
            patientName: cleanPatientName(request.patient_name),
            policyNumber: request.policy_number || "N/A",
            hospitalName: request.hospital_name || "N/A",
            diagnosis: editDiagnosis,
            treatment: editTreatment,
            reason: decisionReason || "Not covered",
          });
          setApprovalResult(null);
        }

        if (dbStatus === "deferred") {
          setApprovalResult(null);
          setDeclineResult({
            patientName: cleanPatientName(request.patient_name),
            policyNumber: request.policy_number || "N/A",
            hospitalName: request.hospital_name || "N/A",
            diagnosis: editDiagnosis,
            treatment: editTreatment,
            reason: decisionReason || "Deferred for further review",
          });
        }

        resolvePatientPhone(request).then((patientWhatsApp) => {
          if (!patientWhatsApp) return;
          const patientLabel = cleanPatientName(request.patient_name);
          const policyLabel = request.policy_number || "N/A";
          const hospitalLabel = request.hospital_name || "the hospital";
          const diagnosisLabel = editDiagnosis || "Not specified";
          const whatsappStatus =
            dbStatus === "rejected"
              ? "DECLINED"
              : dbStatus === "partially_approved"
                ? "PARTIALLY APPROVED"
                : "APPROVED";
          const serviceText =
            approvedItems.length > 0
              ? approvedItems
                  .filter((item) => !item.declined)
                  .map((item) => `- ${itemQuantity(item)}x ${item.name}`)
                  .join("\n")
              : editTreatment || "Approved as prescribed";
          const reasonText = decisionReason || "Please contact your hospital or Ronsberger HMO for more information.";
          const message =
            `Ronsberger HMO\n\n` +
            `AUTHORIZATION ${whatsappStatus}\n\n` +
            `Hello ${patientLabel},\n\n` +
            `Your treatment request submitted through ${hospitalLabel} has been ${whatsappStatus.toLowerCase()}.\n\n` +
            `Policy No: ${policyLabel}\nDiagnosis: ${diagnosisLabel}\n\n` +
            (dbStatus === "rejected"
              ? `Reason:\n${reasonText}\n`
              : `Approved services:\n${serviceText}\n`) +
            `\nPlease contact your hospital or Ronsberger HMO if you have any questions.`;

          // Fire-and-forget: do not await — modal must not block on WhatsApp delivery
          supabase.functions.invoke("send-whatsapp", {
            body: { phone_number: patientWhatsApp, message },
          }).then(({ data, error }) => {
            if (error || !data?.success) {
              console.error("Automatic patient decision WhatsApp failed:", error || data);
              toast({
                variant: "destructive",
                title: "Patient WhatsApp failed",
                description: "The decision was saved, but the patient WhatsApp message could not be delivered.",
              });
            } else {
              toast({
                title: "Patient WhatsApp sent",
                description: `Decision sent to patient (${patientLabel}).`,
              });
            }
          }).catch((error) => {
            console.error("Automatic patient decision WhatsApp error:", error);
            toast({
              variant: "destructive",
              title: "Patient WhatsApp error",
              description: "Could not reach WhatsApp gateway for patient notification.",
            });
          });
        });

        // Resolve hospital phone in background — do NOT await so the UI completes instantly.
        // A small stagger (3s) is enough to prevent simultaneous message burst on WhatsApp.
        resolveRequestingHospitalPhone(request).then((hospitalWhatsApp) => {
          if (!hospitalWhatsApp) return;
          const wasPreviouslyUnlocked = Boolean(request?.is_unlocked);
          const hospitalStatus =
            dbStatus === "rejected"
              ? (wasPreviouslyUnlocked ? "RECORD UPDATED - DECLINED" : "DECLINED")
              : dbStatus === "partially_approved"
                ? (wasPreviouslyUnlocked ? "RECORD UPDATED - PARTIALLY APPROVED" : "PARTIALLY APPROVED")
                : (wasPreviouslyUnlocked ? "RECORD UPDATED - RE-APPROVED" : "APPROVED");
          const hospitalItems = approvedItems.length
            ? formatApprovalServices(approvedItems, approvedSummary || editTreatment)
            : editTreatment || "No service details recorded";
          const updateNotice = wasPreviouslyUnlocked
            ? "⚠️ *NOTICE: PREVIOUS AUTHORIZATION RECORD HAS BEEN UPDATED*\nPlease note that the previously issued decision for this patient has been revised with the details below.\n\n"
            : "";
          const hospitalMessage =
            `Ronsberger HMO\n\n` +
            updateNotice +
            `AUTHORIZATION ${hospitalStatus}\n\n` +
            `Patient: ${cleanPatientName(request.patient_name)}\n` +
            `Policy No: ${request.policy_number || "N/A"}\n` +
            `Auth Code: ${currentCode || request.authorization_code || "N/A"}\n` +
            `Hospital: ${treatingHospitalName || request.hospital_name || "N/A"}\n` +
            `Diagnosis: ${editDiagnosis || "Not specified"}\n\n` +
            (dbStatus === "rejected"
              ? `Reason for Decline:\n${decisionReason || "Not covered"}\n`
              : `${hospitalItems}\n`) +
            `\nDate: ${new Date().toLocaleDateString("en-GB")}\n\n` +
            (dbStatus === "rejected"
              ? "Please contact Ronsberger HMO for clarification before proceeding."
              : getApprovalClosing(dbStatus === "partially_approved")) +
            "\n\nRonsberger HMO UI Desk";

          supabase.functions.invoke("send-whatsapp", {
            body: { phone_number: hospitalWhatsApp, message: hospitalMessage },
          }).then(({ data, error }) => {
            if (error || !data?.success) {
              console.error("Automatic hospital WhatsApp failed:", error || data);
              toast({
                variant: "destructive",
                title: "Hospital WhatsApp notification failed",
                description: "The decision was saved, but the verified hospital message was not delivered.",
              });
            }
          }).catch((error) => {
            console.error("Automatic hospital WhatsApp error:", error);
          });
        });

        // Send approval email to patient (standard treatment approval)
        if ((targetStatus === "approved" || targetStatus === "partially_approved" || dbStatus === "partially_approved") && request.patient_email && !request.patient_email.startsWith("no-email")) {
          supabase.functions
            .invoke("send-approval-email", {
              method: "POST",
              body: { authorization_id: request.id },
            })
            .then(({ data, error }: { data?: any; error?: any }) => {
              if (error) {
                console.error("Approval email failed:", error);
                toast({
                  variant: "destructive",
                  title: "Approval email failed",
                  description: `Could not send approval email to ${request.patient_email}: ${error.message || error}`,
                });
              } else if (data?.email_status === "skipped" || data?.email_status === "failed") {
                console.warn("Approval email skipped:", data?.message, data?.error_message);
                toast({
                  title: "Approval email not sent",
                  description:
                    data?.error_message ||
                    data?.message ||
                    "Email service may not be configured. The authorization is still approved.",
                });
              } else {
                toast({
                  title: "Approval email sent",
                  description: `Approval email sent to ${request.patient_email}`,
                });
              }
            })
            .catch((err: any) => {
              console.error("Approval email error:", err);
              toast({
                variant: "destructive",
                title: "Approval email error",
                description: "Could not send email notification to patient.",
              });
            });
        }

        // Send referral notification email to patient (when a referral is approved)
        if (dbStatus === "referral_approved" && request.patient_email && !request.patient_email.startsWith("no-email")) {
          supabase.functions
            .invoke("send-referral-notification", {
              method: "POST",
              body: { authorization_id: request.id },
            })
            .then(({ data, error }: { data?: any; error?: any }) => {
              if (error) {
                console.error("Referral notification email failed:", error);
              } else if (data?.email_status === "sent") {
                toast({
                  title: "Referral notification sent",
                  description: `Patient notified of referral at ${request.patient_email}`,
                });
              }
            })
            .catch((err: any) => {
              console.error("Referral notification email error:", err);
            });
        }

        toast({ title: "Saved", description: `Request updated to ${officialLabel}.` });
        onUpdated();
        if (options?.closeAfter) onClose();
        return true;
      } catch (err: any) {
        toast({ variant: "destructive", title: "Action failed", description: err.message });
        return false;
      } finally {
        setProcessing(false);
        setProcessingAction(null);
      }
    },
    [
      request,
      editDiagnosis,
      editTreatment,
      editReferralHospitalId,
      editReferralHospitalName,
      approvedItems,
      approvedTotal,
      editDecisionNote,
      nurseInitials,
      nurseDisplayName,
      user,
      onUpdated,
      onClose,
      toast,
    ]
  );

  const handleApprove = async () => {
    if (processing) return;
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot approve requests." });
      return;
    }
    const isStage2 = request?.status === "pending_referral" && request?.source === "hospital_portal";
    if (!isStage2 && approvedItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Treatment cart required",
        description: "Add at least one NHIA service, treatment, drug, lab, or radiology item before approving.",
      });
      return;
    }
    const itemsMissingReason = approvedItems.filter(
      (item) => item.declined && (!item.decline_reason || !item.decline_reason.trim())
    );
    if (itemsMissingReason.length > 0) {
      toast({
        variant: "destructive",
        title: "Decline reason required",
        description: `Please enter a decline reason for the item: "${itemsMissingReason[0].name}".`,
      });
      return;
    }
    if (editReferralHospitalName.trim() && !editReferralHospitalId) {
      toast({
        variant: "destructive",
        title: "Referral hospital required",
        description: "Select the referral hospital before approval so claim and payment rights are assigned correctly.",
      });
      return;
    }
    const requestingHospId = request?.requesting_hospital_id || request?.hospital_id;
    const requestingHospName = request?.requesting_hospital_name || request?.hospital_name || "";
    if (
      editReferralHospitalName.trim() &&
      ((editReferralHospitalId && requestingHospId && editReferralHospitalId === requestingHospId) ||
       (requestingHospName.trim() && editReferralHospitalName.toLowerCase().trim() === requestingHospName.toLowerCase().trim()))
    ) {
      toast({
        variant: "destructive",
        title: "Invalid Referral",
        description: "You cannot refer a patient to the requesting facility itself.",
      });
      return;
    }
    if (!editDecisionNote.trim()) {
      toast({
        variant: "destructive",
        title: "Decision note required",
        description: "Enter a decision note before approving this request.",
      });
      return;
    }
    setProcessingAction("approve");
    await persistRequestUpdate("approved", "APPROVED");
  };

  const handleDecline = async () => {
    if (processing) return;
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot decline requests." });
      return;
    }
    if (!editDecisionNote.trim()) {
      toast({
        variant: "destructive",
        title: "Decision note required",
        description: "Please enter the decline reason before declining.",
      });
      return;
    }
    setProcessingAction("decline");
    const persisted = await persistRequestUpdate("rejected", "DECLINED");
    if (!persisted) return;

    // Send rejection email to patient if email on file
    if (request?.patient_email && !request.patient_email.startsWith("no-email")) {
      try {
        const { data, error } = await supabase.functions.invoke("send-rejection-email", {
          method: "POST",
          body: { authorization_id: request.id },
        });
        if (error || data?.email_status !== "sent") {
          toast({
            variant: "destructive",
            title: "Decline saved; notification failed",
            description: "The request is declined, but the patient email was not confirmed. Follow up with the patient through your usual communication channel.",
          });
        } else {
          toast({ title: "Rejection email sent", description: `Patient notified at ${request.patient_email}` });
        }
      } catch {
        toast({
          variant: "destructive",
          title: "Decline saved; notification failed",
          description: "The request is declined, but the patient email was not confirmed. Follow up with the patient through your usual communication channel.",
        });
      }
    }
  };

  const handleDefer = async () => {
    if (processing) return;
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot defer requests." });
      return;
    }
    if (!editDecisionNote.trim()) {
      toast({
        variant: "destructive",
        title: "Decision note required",
        description: "Please enter a decision note before deferring this request.",
      });
      return;
    }
    setProcessingAction("defer");
    await persistRequestUpdate("deferred", "DEFERRED");
  };

  const handleReassign = async () => {
    if (processing) return;
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot reassign requests." });
      return;
    }
    if (!editReferralHospitalId) {
      toast({
        variant: "destructive",
        title: "New referred hospital required",
        description: "Please select a new referred hospital before reassigning.",
      });
      return;
    }
    const requestingHospId = request?.requesting_hospital_id || request?.hospital_id;
    const requestingHospName = request?.requesting_hospital_name || request?.hospital_name || "";
    if (
      (editReferralHospitalId && requestingHospId && editReferralHospitalId === requestingHospId) ||
      (requestingHospName.trim() && editReferralHospitalName.toLowerCase().trim() === requestingHospName.toLowerCase().trim())
    ) {
      toast({
        variant: "destructive",
        title: "Invalid Referral",
        description: "You cannot refer a patient to the requesting facility itself.",
      });
      return;
    }
    setProcessingAction("reassign" as any);
    setProcessing(true);
    try {
      const { error: updateError } = await supabase
        .from("authorization_requests")
        .update({
          status: "pending_referral",
          referred_hospital_id: editReferralHospitalId,
          referred_hospital_name: editReferralHospitalName,
          claiming_hospital_id: editReferralHospitalId,
          claiming_hospital_name: editReferralHospitalName,
          decision_reason: null,
          clinical_notes: editDecisionNote || "Reassigned to " + editReferralHospitalName,
        } as any)
        .eq("id", request.id);

      if (updateError) throw updateError;

      // Audit log (asynchronous)
      supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "REFERRAL_REASSIGNED",
        performed_by: user?.id,
        details: {
          previous_status: request.status,
          new_status: "pending_referral",
          new_referred_hospital_id: editReferralHospitalId,
          new_referred_hospital_name: editReferralHospitalName,
        },
      }).then(({ error }) => { if (error) console.error("Async log error:", error); });

      await supabase.functions.invoke("send-otp", {
        method: "POST",
        body: {
          authorization_id: request.id,
          patient_email: request.patient_email || "no-email@medicode.com",
          policy_number: request.policy_number,
          otp_type: "ARRIVAL",
          hospital_id: editReferralHospitalId,
        },
      });

      toast({ title: "Referral Reassigned", description: `Referral successfully reassigned to ${editReferralHospitalName}.` });
      onUpdated();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Reassignment failed", description: err.message });
    } finally {
      setProcessing(false);
      setProcessingAction(null);
    }
  };

  const handleDeleteRequest = async () => {
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot delete requests." });
      return;
    }
    if (deleteConfirmText.trim() !== "DELETE") {
      return;
    }
    setProcessingAction("delete");
    setProcessing(true);
    try {
      const { error } = await supabase.rpc("rpc_request_deletion_approval" as any, {
        p_request_id: request.id,
        p_reason: `Deletion requested from authorization review by ${nurseDisplayName}.`,
      });
      if (error) throw error;

      localStorage.removeItem(`review_draft_${request.id}`);
      toast({ title: "Deletion Requested", description: "The request was sent to the Utilization Manager Lead for review." });
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
      onUpdated();
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    } finally {
      setProcessing(false);
      setProcessingAction(null);
    }
  };

  const saveRecordEdits = async () => {
    if (processing) return;
    if (role === "hospital") {
      toast({ variant: "destructive", title: "Unauthorized", description: "Hospitals cannot save clinical edits." });
      return;
    }
    if (editStatus === "approved" || editStatus === "partially_approved") {
      const itemsMissingReason = approvedItems.filter(
        (item) => item.declined && (!item.decline_reason || !item.decline_reason.trim())
      );
      if (itemsMissingReason.length > 0) {
        toast({
          variant: "destructive",
          title: "Decline reason required",
          description: `Please enter a decline reason for the item: "${itemsMissingReason[0].name}".`,
        });
        return;
      }
    }
    const statusMap: Record<string, string> = {
      approved: "APPROVED",
      partially_approved: "PARTIALLY APPROVED",
      rejected: "DECLINED",
      deferred: "DEFERRED",
      pending: "Pending",
    };
    setProcessingAction("save");
    await persistRequestUpdate(editStatus, statusMap[editStatus] || editStatus, { closeAfter: true });
  };

  const copyApprovalMessage = async () => {
    if (!approvalResult) return;
    const dateStr = new Date().toLocaleDateString("en-GB");
    const isPartial = request.status === "partially_approved";
    const approvedLines = approvalResult.items
      .filter((item) => !item.declined)
      .map((item) => `${item.code || "NHIA"} - ${item.name}: ${itemQuantity(item)}`)
      .join("\n");
    const declinedLines = approvalResult.items
      .filter((item) => item.declined)
      .map((item) => `~${item.code || "NHIA"} - ${item.name}: ${itemQuantity(item)}~${item.decline_reason ? ` (Reason: ${item.decline_reason})` : ""}`)
      .join("\n");
    const serviceLines = approvalResult.items.length
      ? `Approved Services:\n${approvedLines || "None"}${
          declinedLines ? `\n\nDeclined Services:\n${declinedLines}` : ""
        }`
      : `Approved Services:\n${approvalResult.treatment}`;
    const requester = request.requesting_hospital_name || request.hospital_name || approvalResult.hospitalName;
    const approvalHeading =
      request.status === "partially_approved"
        ? "AUTHORIZATION PARTIALLY APPROVED"
        : "AUTHORIZATION APPROVED";
    const referralLine = editReferralHospitalName.trim()
      ? `\nRequest Raised By: ${requester}\nReferral To: ${editReferralHospitalName.trim()}\nClaim Rights: ${editReferralHospitalName.trim()} only`
      : "";
    const closing = isPartial
      ? "Please proceed only with the approved services listed above. Declined services must not be provided under this authorization. For clarification, please contact Ronsberger HMO before treatment."
      : "Please proceed with the approved services listed above. For clarification, please contact Ronsberger HMO before treatment.";
    const msg = `${approvalHeading}\n\nPatient: ${approvalResult.patientName}\nPolicy No: ${approvalResult.policyNumber}\nAuth Code: ${approvalResult.authCode}\nHospital: ${approvalResult.hospitalName}${referralLine}\nDiagnosis: ${approvalResult.diagnosis}\n\n${serviceLines}\nDate: ${dateStr}\n\n${closing}\n\nRonsberger HMO UI Desk`;
    try {
      await writeClipboardText(msg);
      toast({ title: "Copied! Ready to paste to WhatsApp" });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the message manually." });
    }
  };

  const copyDeclineMessage = async () => {
    if (!declineResult) return;
    const dateStr = new Date().toLocaleDateString("en-GB");
    const msg = `AUTHORIZATION DECLINED\n\nPatient: ${declineResult.patientName}\nPolicy No: ${declineResult.policyNumber}\nHospital: ${declineResult.hospitalName}\nRequested For: ${declineResult.diagnosis} - ${declineResult.treatment}\nReason: ${declineResult.reason}\nDate: ${dateStr}\n\nPlease contact the HMO registry for clarification.\nRonsberger HMO UI Desk`;
    try {
      await writeClipboardText(msg);
      toast({ title: "Copied! Ready to send to hospital" });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the message manually." });
    }
  };

  const [unlockLoading, setUnlockLoading] = useState(false);

  const handleUnlockRecord = async () => {
    if (role !== "admin" && role !== "utilization_manager_lead") {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "A Utilization Manager Lead or Super Admin is required to unlock decided records.",
      });
      return;
    }
    if (!request?.id) return;
    setUnlockLoading(true);
    try {
      const { error } = await supabase.rpc("rpc_set_authorization_lock" as any, {
        p_request_id: request.id,
        p_is_unlocked: true,
      });

      if (error) throw error;

      toast({
        title: "Record Unlocked",
        description: "This authorization is unlocked for revision. Clinical staff can now update the decision.",
      });

      onUpdated();
    } catch (err: any) {
      console.error("Unlock failed:", err);
      toast({
        variant: "destructive",
        title: "Unlock Failed",
        description: err.message || "Failed to unlock record.",
      });
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleLockRecord = async () => {
    if (role !== "admin" && role !== "utilization_manager_lead") return;
    if (!request?.id) return;
    setUnlockLoading(true);
    try {
      const { error } = await supabase.rpc("rpc_set_authorization_lock" as any, {
        p_request_id: request.id,
        p_is_unlocked: false,
      });

      if (error) throw error;

      toast({
        title: "Record Re-locked",
        description: "This authorization is now locked as read-only.",
      });

      onUpdated();
    } catch (err: any) {
      console.error("Lock failed:", err);
      toast({
        variant: "destructive",
        title: "Lock Failed",
        description: err.message || "Failed to re-lock record.",
      });
    } finally {
      setUnlockLoading(false);
    }
  };

const findHospitalIdByName = async (name: string) => {
  if (!name || !name.trim()) return null;
  try {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .limit(100);
    if (error) throw error;
    if (data && data.length > 0) {
      const match = data.find((h: any) => areHospitalNamesMatching(h.name, name));
      if (match) return match.id;
    }
  } catch (err) {
    console.error("Error looking up hospital by name:", err);
  }
  return null;
};
  return {
    processing,
    processingAction,
    editDiagnosis,
    setEditDiagnosis,
    editCurrentDiagnosis,
    setEditCurrentDiagnosis,
    editTreatment,
    setEditTreatment,
    editReferralHospitalId,
    setEditReferralHospitalId,
    editReferralHospitalName,
    setEditReferralHospitalName,
    referralCollapsed,
    setReferralCollapsed,
    editStatus,
    setEditStatus,
    editDecisionNote,
    setEditDecisionNote,
    rejectReason,
    setRejectReason,
    approvalResult,
    setApprovalResult,
    declineResult,
    setDeclineResult,
    arrivalOtp,
    arrivalOtpVerified,
    treatmentOtp,
    treatmentOtpVerified,
    otpLoading,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deleteConfirmText,
    setDeleteConfirmText,
    nurseDisplayName,
    nurseInitials,
    handleApprove,
    handleDecline,
    handleDefer,
    handleReassign,
    handleDeleteRequest,
    saveRecordEdits,
    copyApprovalMessage,
    copyDeclineMessage,
    handleUnlockRecord,
    handleLockRecord,
    unlockLoading,
  };
}
