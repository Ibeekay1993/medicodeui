import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { resetIbadanWorkbookHistoryCache } from "@/lib/ibadanWorkbook";
import {
  TariffOption,
  itemQuantity,
  itemTotal,
  itemUnitPrice,
  getInitials,
  formatNaira,
  cleanPatientName,
} from "@/lib/clinicalUtils";
import { normalizeHospitalName } from "@/lib/authorizations-helpers";

interface UseClinicalActionsProps {
  open: boolean;
  request: any;
  approvedItems: TariffOption[];
  approvedTotal: number;
  onClose: () => void;
  onUpdated: () => void;
}

export function useClinicalActions({
  open,
  request,
  approvedItems,
  approvedTotal,
  onClose,
  onUpdated,
}: UseClinicalActionsProps) {
  const { toast } = useToast();
  const { user, fullName } = useAuth();

  const [processing, setProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<
    "approve" | "decline" | "defer" | "save" | "delete" | null
  >(null);

  const [editDiagnosis, setEditDiagnosis] = useState("");
  const [editTreatment, setEditTreatment] = useState("");
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

  const [otpValue, setOtpValue] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const nurseDisplayName = fullName || user?.user_metadata?.full_name || user?.email || "Unknown Utilization Manager";
  const nurseInitials = getInitials(nurseDisplayName);

  // Initialize form fields when modal opens/changes
  useEffect(() => {
    if (open && request) {
      setEditDiagnosis(request.diagnosis || "");
      setEditTreatment(request.treatment || "");
      setEditReferralHospitalId(request.referred_hospital_id || null);
      setEditReferralHospitalName(request.referred_hospital_name || "");
      setReferralCollapsed(!request.referred_hospital_name);
      setEditStatus(request.status || "pending");
      setEditDecisionNote(request.decision_reason || request.clinical_notes || "");
      setRejectReason("");
      setApprovalResult(null);
      setDeclineResult(null);

      const parsedItems = Array.isArray(request.approved_items)
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

      if (request.status === "approved") {
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
          totalAmount: Number(request.total_amount || 0),
        });
      } else if (request.status === "rejected") {
        setDeclineResult({
          patientName: cleanPatientName(request.patient_name),
          policyNumber: request.policy_number || "N/A",
          hospitalName: request.hospital_name || "N/A",
          diagnosis: request.diagnosis || "",
          treatment: request.treatment || "",
          reason: request.decision_reason || request.clinical_notes || "Declined",
        });
      }
    }
  }, [open, request]);

  // Fetch OTP if request is pending/under-review and has a patient email.
  // Rule: Only show "Generating OTP..." when a new OTP is actually being created.
  //       If an OTP already exists in the DB, show it immediately (no loading flash).
  useEffect(() => {
    const isPendingOrReview = request && (
      request.status === "pending" ||
      request.status === "pending_referral" ||
      request.status === "pending_authorization"
    );
    if (!open || !request || !(isPendingOrReview && request.patient_email)) return;

    // If we already have the OTP value in local state, show it immediately — no fetch needed.
    if (otpValue) {
      setOtpLoading(false);
      return;
    }

    // Do NOT set otpLoading=true here yet — first check if an OTP already exists.
    // We only set loading=true if there is truly no existing OTP (i.e. a new one must be generated).
    let cancelled = false;

    (async () => {
      try {
        // Determine otp_type based on request status
        const otpType = request.status === "pending_referral" ? "ARRIVAL" : "ARRIVAL";

        const { data, error } = await supabase.rpc("get_otp_value" as any, {
          p_request_id: request.id,
          p_otp_type: otpType,
        });

        if (cancelled) return;

        if (!error && data) {
          const row = Array.isArray(data) ? data[0] : data;
          const otpVal = row?.otp_value;
          if (otpVal) {
            // OTP found in DB — display immediately, no loading state needed
            setOtpValue(otpVal);
            setOtpLoading(false);
            return;
          }
        }

        // No existing OTP found — a new one needs to be generated.
        // Only NOW do we set loading=true (this is "Generating OTP..." state).
        if (!cancelled) {
          setOtpLoading(true);
        }
      } catch (err) {
        console.error("OTP value fetch error:", err);
        if (!cancelled) setOtpLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, request?.id]);

  // Auto-save draft changes every 1.5 seconds if request is pending
  useEffect(() => {
    if (open && request && request.status === "pending" && !approvalResult && !declineResult) {
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
        return;
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
        let finalReferredHospitalName = editReferralHospitalName.trim()
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
            treatment:
              dbStatus === "approved" && approvedSummary ? approvedSummary : editTreatment,
            requesting_hospital_id: request.requesting_hospital_id || request.hospital_id || null,
            requesting_hospital_name: request.requesting_hospital_name || request.hospital_name || null,
            referring_hospital_id: request.referring_hospital_id || request.hospital_id || null,
            referring_hospital_name: request.referring_hospital_name || request.hospital_name || null,
            referred_hospital_id: finalReferredHospitalId,
            referred_hospital_name: finalReferredHospitalName,
            claiming_hospital_id:
              dbStatus === "approved"
                ? treatingHospitalId
                : request.claiming_hospital_id || request.hospital_id || null,
            claiming_hospital_name:
              dbStatus === "approved"
                ? treatingHospitalName
                : request.claiming_hospital_name || request.hospital_name || null,
            authorization_code: currentCode,
            decision_reason: decisionReason,
            clinical_notes: clinicalNotes,
            decided_at: decidedAt,
            decided_by: user?.id,
            approved_by: (dbStatus === "approved" || dbStatus === "referral_approved") ? user?.id : null,
            nurse_initials: (dbStatus === "approved" || dbStatus === "referral_approved") ? nurseInitials : null,
            authorized_by_name: (dbStatus === "approved" || dbStatus === "referral_approved") ? nurseDisplayName : null,
            authorized_by_email: (dbStatus === "approved" || dbStatus === "referral_approved") ? user?.email ?? null : null,
            updated_at: decidedAt,
            approved_tariff_code: dbStatus === "approved" ? firstApprovedItem?.code ?? null : null,
            approved_tariff_name: dbStatus === "approved" ? firstApprovedItem?.name ?? null : null,
            approved_tariff_category:
              dbStatus === "approved" ? firstApprovedItem?.category ?? null : null,
            approved_tariff_amount:
              dbStatus === "approved" && firstApprovedItem ? itemTotal(firstApprovedItem) : null,
            approved_items: dbStatus === "approved" ? approvedPayload : [],
            total_amount: dbStatus === "approved" ? approvedTotal : 0,
          } as any)
          .eq("id", request.id);

        if (updateError) throw updateError;

        // Audit Log for Security
        await supabase.from("authorization_logs").insert({
          request_id: request.id,
          action: `SET_STATUS_${dbStatus.toUpperCase()}`,
          performed_by: user?.id,
          details: {
            previous_status: request.status,
            new_status: dbStatus,
            diagnosis: editDiagnosis,
            auth_code: currentCode,
            referral_to: editReferralHospitalName.trim() || null,
            claiming_hospital_id: (dbStatus === "approved" || dbStatus === "referral_approved") ? treatingHospitalId : null,
            nurse_initials: (dbStatus === "approved" || dbStatus === "referral_approved") ? nurseInitials : null,
            authorized_by_name: (dbStatus === "approved" || dbStatus === "referral_approved") ? nurseDisplayName : null,
            authorized_by_user_id: (dbStatus === "approved" || dbStatus === "referral_approved") ? user?.id : null,
            ip: "client-side",
            timestamp: new Date().toISOString(),
          },
        });

        resetIbadanWorkbookHistoryCache();

        if (dbStatus === "approved" || dbStatus === "referral_approved") {
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

        // Send approval email to patient (standard treatment approval)
        if (targetStatus === "approved" && request.patient_email) {
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
        if (dbStatus === "referral_approved" && request.patient_email) {
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
      } catch (err: any) {
        toast({ variant: "destructive", title: "Action failed", description: err.message });
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
    if (!editDecisionNote.trim()) {
      toast({
        variant: "destructive",
        title: "Decision note required",
        description: "Please enter the decline reason before declining.",
      });
      return;
    }
    setProcessingAction("decline");
    await persistRequestUpdate("rejected", "DECLINED");

    // Send rejection email to patient if email on file
    if (request?.patient_email) {
      supabase.functions
        .invoke("send-rejection-email", {
          method: "POST",
          body: { authorization_id: request.id },
        })
        .then(({ data, error }: { data?: any; error?: any }) => {
          if (error) {
            console.error("Rejection email failed:", error);
          } else if (data?.email_status === "sent") {
            toast({
              title: "Rejection email sent",
              description: `Patient notified at ${request.patient_email}`,
            });
          }
        })
        .catch((err: any) => {
          console.error("Rejection email error:", err);
        });
    }
  };

  const handleDefer = async () => {
    if (processing) return;
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
    if (!editReferralHospitalId) {
      toast({
        variant: "destructive",
        title: "New referred hospital required",
        description: "Please select a new referred hospital before reassigning.",
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

      await supabase.from("authorization_logs").insert({
        request_id: request.id,
        action: "REFERRAL_REASSIGNED",
        performed_by: user?.id,
        details: {
          previous_status: request.status,
          new_status: "pending_referral",
          new_referred_hospital_id: editReferralHospitalId,
          new_referred_hospital_name: editReferralHospitalName,
        },
      });

      await supabase.functions.invoke("send-otp", {
        method: "POST",
        body: {
          authorization_id: request.id,
          patient_email: request.patient_email,
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
    if (deleteConfirmText.trim() !== "DELETE") {
      return;
    }
    setProcessingAction("delete");
    setProcessing(true);
    try {
      const { error } = await supabase.from("authorization_requests").delete().eq("id", request.id);
      if (error) throw error;

      localStorage.removeItem(`review_draft_${request.id}`);
      toast({ title: "Deleted", description: "Request removed from the list." });
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
    if (editStatus === "approved") {
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
      rejected: "DECLINED",
      deferred: "DEFERRED",
      pending: "Pending",
    };
    setProcessingAction("save");
    await persistRequestUpdate(editStatus, statusMap[editStatus] || editStatus, { closeAfter: true });
  };

  const copyApprovalMessage = () => {
    if (!approvalResult) return;
    const dateStr = new Date().toLocaleDateString("en-GB");
    const itemLines = approvalResult.items.length
      ? approvalResult.items
          .map((item) =>
            item.declined
              ? `[DECLINED] ${item.code || "NHIA"} - ${item.name}${item.decline_reason ? ` (Reason: ${item.decline_reason})` : ""}`
              : `${item.code || "NHIA"} - ${item.name}: ${itemQuantity(item)} x ${formatNaira(
                  itemUnitPrice(item)
                )} = ${formatNaira(itemTotal(item))}`
          )
          .join("\n")
      : approvalResult.treatment;
    const requester = request.requesting_hospital_name || request.hospital_name || approvalResult.hospitalName;
    const referralLine = editReferralHospitalName.trim()
      ? `\nRequest Raised By: ${requester}\nReferral To: ${editReferralHospitalName.trim()}\nClaim Rights: ${editReferralHospitalName.trim()} only`
      : "";
    const msg = `AUTHORIZATION APPROVED\n\nPatient: ${approvalResult.patientName}\nPolicy No: ${approvalResult.policyNumber}\nAuth Code: ${approvalResult.authCode}\nHospital: ${approvalResult.hospitalName}${referralLine}\nDiagnosis: ${approvalResult.diagnosis}\n\nApproved Items:\n${itemLines}\n\nTotal Approved: ${formatNaira(
      approvalResult.totalAmount
    )}\nDate: ${dateStr}\n\nPlease present this code at the hospital reception.\nRonsberger HMO UI Desk`;
    navigator.clipboard.writeText(msg);
    toast({ title: "Copied! Ready to paste to WhatsApp" });
  };

  const copyDeclineMessage = () => {
    if (!declineResult) return;
    const dateStr = new Date().toLocaleDateString("en-GB");
    const msg = `AUTHORIZATION DECLINED\n\nPatient: ${declineResult.patientName}\nPolicy No: ${declineResult.policyNumber}\nHospital: ${declineResult.hospitalName}\nRequested For: ${declineResult.diagnosis} - ${declineResult.treatment}\nReason: ${declineResult.reason}\nDate: ${dateStr}\n\nPlease contact the HMO registry for clarification.\nRonsberger HMO UI Desk`;
    navigator.clipboard.writeText(msg);
    toast({ title: "Copied! Ready to send to hospital" });
  };

const findHospitalIdByName = async (name: string) => {
  if (!name || !name.trim()) return null;
  const normalizedInput = normalizeHospitalName(name);
  try {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .ilike("name", `%${name}%`)
      .limit(1);
    if (error) throw error;
    if (data && data.length > 0) {
      const hospital = data[0];
      const hospitalName = normalizeHospitalName(hospital.name);
      if (hospitalName === normalizedInput) {
        return hospital.id;
      }
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
    otpValue,
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
  };
}
