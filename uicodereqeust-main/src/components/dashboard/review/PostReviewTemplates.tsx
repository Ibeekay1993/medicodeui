import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  Copy,
  Trash2,
  Send,
  Loader2,
  Building2,
  UserCheck,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { writeClipboardText } from "@/lib/clipboard";
import { getWhatsAppSendErrorMessage } from "@/lib/whatsappSendError";
import type { TariffOption } from "@/lib/clinicalUtils";
import {
  formatNaira,
  itemUnitPrice,
  itemQuantity,
  itemTotal,
} from "@/lib/clinicalUtils";

interface PostReviewTemplatesProps {
  request: any;
  approvalResult: {
    authCode: string;
    patientName: string;
    policyNumber: string;
    hospitalName: string;
    diagnosis: string;
    treatment: string;
    items: ApprovalItem[];
    totalAmount: number;
    authorizedByName: string;
    authorizedByInitials: string;
  } | null;
  declineResult: {
    patientName: string;
    policyNumber: string;
    hospitalName: string;
    diagnosis: string;
    treatment: string;
    reason: string;
  } | null;
  copyApprovalMessage: () => void;
  copyDeclineMessage: () => void;
  setApprovalResult: (value: any) => void;
  setDeclineResult: (value: any) => void;
  onClose: () => void;
  allowDelete: boolean;
  setDeleteConfirmOpen: (value: boolean) => void;
  processing: boolean;
  editReferralHospitalName: string;
  arrivalPin?: string;
  isResendingPin: boolean;
  onResendPin: () => Promise<void>;
}

type ApprovalItem = TariffOption & {
  linePriceKnown?: boolean;
};

export const PostReviewTemplates = React.memo(function PostReviewTemplates({
  request,
  approvalResult,
  declineResult,
  copyApprovalMessage,
  copyDeclineMessage,
  setApprovalResult,
  setDeclineResult,
  onClose,
  allowDelete,
  setDeleteConfirmOpen,
  processing,
  editReferralHospitalName,
  arrivalPin,
  isResendingPin,
  onResendPin,
}: PostReviewTemplatesProps) {
  const { toast } = useToast();
  const [sendingHospital, setSendingHospital] = useState(false);
  const [sendingPatient, setSendingPatient] = useState(false);
  const [sendingDecline, setSendingDecline] = useState(false);
  const [hospitalPhone, setHospitalPhone] = useState("");
  const [loadingHospitalPhone, setLoadingHospitalPhone] = useState(false);
  const [hospitalContacts, setHospitalContacts] = useState<Array<{ phone_number: string; contact_name?: string | null; hospital_id?: string | null }>>([]);

  const formatPhoneNumber = (raw: string) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("234")) return digits;
    if (digits.length === 10) return "234" + digits;
    if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
    return digits;
  };

  const isWhatsAppRequest = () => {
    if (String(request?.source || "").toLowerCase() === "whatsapp") return true;
    const notes = request?.clinical_notes;
    if (!notes) return false;
    try {
      const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
      return String(parsed?.source || "").toLowerCase() === "whatsapp" ||
        Boolean(parsed?.whatsapp_message_id || parsed?.whatsapp_sender_phone);
    } catch {
      return false;
    }
  };

  const getRequestSenderPhone = async () => {
    if (!isWhatsAppRequest()) return "";
    const notes = request?.clinical_notes;
    if (notes) {
      try {
        const parsed = typeof notes === "string" ? JSON.parse(notes) : notes;
        if (parsed?.whatsapp_sender_phone) return formatPhoneNumber(parsed.whatsapp_sender_phone);
      } catch {
        // Older requests may contain plain-text clinical notes.
      }
    }
    if (!request?.id) return "";
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("phone_number")
      .eq("authorization_request_id", request.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return formatPhoneNumber(data?.phone_number || "");
  };

  const handleCopyCodeOnly = async () => {
    if (!approvalResult) return;
    try {
      await writeClipboardText(approvalResult.authCode);
      toast({ title: "Code Copied", description: "Authorization code copied to clipboard." });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the authorization code manually." });
    }
  };

  const getRequestingHospitalPhone = async () => {
    const senderPhone = await getRequestSenderPhone();
    if (senderPhone) return senderPhone;

    const hospitalId = request?.requesting_hospital_id || request?.hospital_id;
    if (hospitalId) {
      try {
        const { data: contact } = await supabase
          .from("hospital_whatsapp_contacts")
          .select("phone_number")
          .eq("hospital_id", hospitalId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (contact?.phone_number) return formatPhoneNumber(contact.phone_number);

        const { data: hosp } = await supabase
          .from("hospitals")
          .select("phone")
          .eq("id", hospitalId)
          .maybeSingle();
        if (hosp?.phone) return formatPhoneNumber(hosp.phone);
      } catch (e) {
        console.warn("Could not resolve hospital phone from database:", e);
      }
    }

    if (request?.hospital_name) {
      try {
        const { data: hosp } = await supabase
          .from("hospitals")
          .select("phone")
          .ilike("name", String(request.hospital_name).trim())
          .maybeSingle();
        if (hosp?.phone) return formatPhoneNumber(hosp.phone);
      } catch (e) {
        console.warn("Could not resolve hospital phone by name:", e);
      }
    }

    return "";
  };

  const getAutomaticNoticeStatus = async (recipientType: "hospital" | "patient") => {
    if (!request?.id || !request?.decided_at) return null;
    const notificationType = request.status === "rejected"
      ? "REJECTION"
      : request.status === "partially_approved"
        ? "PARTIAL_APPROVAL"
        : "APPROVAL";
    const { data, error } = await supabase
      .from("whatsapp_notifications" as any)
      .select("status")
      .eq("authorization_request_id", request.id)
      .eq("notification_type", notificationType)
      .filter("recipient_type", "eq", recipientType)
      .filter("decision_at", "eq", request.decided_at)
      .maybeSingle();
    if (error) throw error;
    const notice = data as unknown as { status?: unknown } | null;
    const status = notice?.status;
    return typeof status === "string" ? status : null;
  };

  const stopIfAutomaticNoticeExists = async (recipientType: "hospital" | "patient") => {
    const status = await getAutomaticNoticeStatus(recipientType);
    if (!status || !["queued_v2", "processing_v2", "retry_v2", "sent_v2"].includes(status)) return false;

    const sent = status === "sent_v2";
    toast({
      title: sent ? "Already sent automatically" : "Automatic WhatsApp queued",
      description: sent
        ? `The ${recipientType} already has the notification for this decision. No duplicate was sent.`
        : `The ${recipientType} notification is ${status === "retry_v2" ? "being retried" : "in the delivery queue"}. No duplicate was sent.`,
    });
    return true;
  };

  const getApprovalClosing = (isPartial: boolean) =>
    isPartial
      ? "Please proceed only with the approved services listed above. Declined services must not be provided under this authorization. For clarification, please contact Ronsberger HMO before treatment."
      : "Please proceed with the approved services listed above. For clarification, please contact Ronsberger HMO before treatment.";

  const formatApprovalServices = (items: any[], treatment: string) => {
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
  };

  useEffect(() => {
    if (!approvalResult && !declineResult) return;
    let cancelled = false;
    setLoadingHospitalPhone(true);
    Promise.all([
      getRequestingHospitalPhone(),
      !isWhatsAppRequest()
        ? Promise.all([
            supabase
              .from("hospital_whatsapp_contacts")
              .select("phone_number,contact_name,hospital_id")
              .eq("status", "active")
              .order("updated_at", { ascending: false }),
            supabase
              .from("hospitals")
              .select("id, name, phone")
              .not("phone", "is", null)
              .order("name"),
          ])
        : Promise.resolve([{ data: [], error: null }, { data: [], error: null }]),
    ])
      .then(([phoneResult, [contactsResult, hospitalsResult]]) => {
        if (contactsResult?.error) console.warn("Contacts query warning:", contactsResult.error);
        if (!cancelled) {
          if (phoneResult) {
            setHospitalPhone(phoneResult);
          }
          const allContacts: Array<{ phone_number: string; contact_name?: string | null; hospital_id?: string | null }> = [];
          (contactsResult?.data || []).forEach((c: any) => {
            if (c.phone_number) allContacts.push(c);
          });
          (hospitalsResult?.data || []).forEach((h: any) => {
            if (h.phone && !allContacts.some((existing) => existing.phone_number === h.phone)) {
              allContacts.push({ phone_number: h.phone, contact_name: h.name, hospital_id: h.id });
            }
          });
          setHospitalContacts(allContacts);
        }
      })
      .catch((error) => {
        console.error("Could not load hospital WhatsApp number", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingHospitalPhone(false);
      });
    return () => {
      cancelled = true;
    };
  }, [approvalResult, declineResult, request?.id, request?.clinical_notes]);

  const handleSendToHospital = async () => {
    if (!approvalResult) return;
    setSendingHospital(true);
    try {
      if (await stopIfAutomaticNoticeExists("hospital")) return;
      const formatted = formatPhoneNumber(hospitalPhone) || await getRequestingHospitalPhone();
      if (!formatted) throw new Error("Enter or select the hospital WhatsApp number before sending.");
      const dateStr = new Date().toLocaleDateString("en-GB");
      const isPartial = request?.status === "partially_approved";
      const serviceLines = formatApprovalServices(approvalResult.items, approvalResult.treatment);

      const requester = request?.requesting_hospital_name || request?.hospital_name || approvalResult.hospitalName;
      const referralLine = editReferralHospitalName.trim()
        ? `\nRequest Raised By: ${requester}\nReferral To: ${editReferralHospitalName.trim()}\nClaim Rights: ${editReferralHospitalName.trim()} only`
        : "";

      const approvalHeading = isPartial
        ? "AUTHORIZATION PARTIALLY APPROVED"
        : "AUTHORIZATION APPROVED";
      const authorizedBy = approvalResult.authorizedByInitials
        ? `${approvalResult.authorizedByName} (${approvalResult.authorizedByInitials})`
        : approvalResult.authorizedByName;
      const msg = `${approvalHeading}\n\nPatient: ${approvalResult.patientName}\nPolicy No: ${approvalResult.policyNumber}\nAuth Code: ${approvalResult.authCode}\nAuthorized by: ${authorizedBy}\nHospital: ${approvalResult.hospitalName}${referralLine}\nDiagnosis: ${approvalResult.diagnosis}\n\n${serviceLines}\nDate: ${dateStr}\n\n${getApprovalClosing(isPartial)}\n\nRonsberger HMO UI Desk`;

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone_number: formatted, message: msg },
      });

      if (error || !data?.success) {
        throw new Error(await getWhatsAppSendErrorMessage(data, error));
      } else {
        toast({ title: "WhatsApp Sent to Hospital!", description: `Response sent to ${formatted}` });
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: e.message || "Failed to send WhatsApp." });
    } finally {
      setSendingHospital(false);
    }
  };

  const handleNotifyPatient = async () => {
    if (!approvalResult) return;
    setSendingPatient(true);
    try {
      if (await stopIfAutomaticNoticeExists("patient")) return;
      const rawPhone = request?.patient_phone || "";
      const formatted = formatPhoneNumber(rawPhone);
      const priorityStr = (request?.urgency || "ROUTINE").toUpperCase();
      const patientApprovalHeading = request?.status === "partially_approved"
        ? "PARTIALLY APPROVED"
        : "APPROVED";

      const approvedItemsList = approvalResult.items.length
        ? approvalResult.items
            .filter((item) => !item.declined)
            .map((item) => `• *${itemQuantity(item)}x ${item.name}*`)
            .join("\n")
        : (approvalResult.treatment ? `• *${approvalResult.treatment}*` : "• *Approved as prescribed*");

      const authorizedBy = approvalResult.authorizedByInitials
        ? `${approvalResult.authorizedByName} (${approvalResult.authorizedByInitials})`
        : approvalResult.authorizedByName;
      const msg = `*Ronsberger HMO*\n\n*AUTHORIZATION ${patientApprovalHeading}*\n\nHello *${approvalResult.patientName}*,\n\nWe are pleased to inform you that your treatment request submitted through *${approvalResult.hospitalName}* has been *${patientApprovalHeading.toLowerCase()}* by Ronsberger HMO.\n\nThe approved services are listed below.\n\n*Request Details*\n\nPatient: *${approvalResult.patientName}*\nPolicy No.: *${approvalResult.policyNumber}*\nHospital: *${approvalResult.hospitalName}*\nDiagnosis: *${approvalResult.diagnosis}*\nAuthorized by: *${authorizedBy}*\nPriority: *${priorityStr}*\n\n*Approved Treatment / Services*\n\n${approvedItemsList}\n\n*Important Notice*\nPlease contact us immediately if these services were not fully rendered to you, or if you are asked to make any additional payments for the approved items listed above.\n\nThank you for choosing Ronsberger HMO.`;

      if (!formatted) {
        if (isWhatsAppRequest()) {
          throw new Error("The WhatsApp sender number could not be verified for this request. The response was not sent.");
        }
        await writeClipboardText(msg);
        toast({ title: "Copied!", description: "No patient phone on record. Copied patient notice to clipboard." });
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone_number: formatted, message: msg },
      });

      if (error || !data?.success) {
        throw new Error(await getWhatsAppSendErrorMessage(data, error));
      } else {
        toast({ title: "Patient notified", description: `Approval notice sent to ${formatted}` });
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: e.message || "Failed to notify patient." });
    } finally {
      setSendingPatient(false);
    }
  };

  const handleSendDeclineToHospital = async () => {
    if (!declineResult) return;
    setSendingDecline(true);
    try {
      const formatted = await getRequestingHospitalPhone();
      if (!formatted && !hospitalPhone) throw new Error("Enter or select the hospital WhatsApp number before sending.");
      const recipient = formatPhoneNumber(hospitalPhone) || formatted;
      const reqRef = request?.request_id || request?.id?.slice(0, 8) || "REQ";

      const msg = `*Ronsberger HMO*\n\n*AUTHORIZATION DECLINED*\n\n*Reference:* ${reqRef}\n*Patient:* ${declineResult.patientName}\n*Policy No:* ${declineResult.policyNumber}\n*Hospital:* ${declineResult.hospitalName}\n*Diagnosis:* ${declineResult.diagnosis}\n\n*Reason for Decline:*\n${declineResult.reason}\n\nIf you need clarification, please reply to this message.\n\n— Ronsberger HMO Medical Desk`;

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone_number: recipient, message: msg },
      });

      if (error || !data?.success) {
        throw new Error(await getWhatsAppSendErrorMessage(data, error));
      } else {
        toast({ title: "Decline Sent via WhatsApp!", description: `Decline notice sent to ${recipient}` });
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: e.message || "Failed to send decline notice." });
    } finally {
      setSendingDecline(false);
    }
  };

  if (approvalResult) {
    const isPartiallyApproved = request?.status === "partially_approved";
    const authorizationCodeTone = isPartiallyApproved ? "text-sky-700" : "text-emerald-700";
    const approvedItems: ApprovalItem[] = approvalResult.items.length
      ? approvalResult.items
      : String(approvalResult.treatment || request?.treatment || "")
          .split(/;\s*|\r?\n/)
          .map((entry: string) => entry.trim().replace(/^[•*-]\s*/, ""))
          .filter(Boolean)
          .map((entry: string) => {
            const match = entry.match(/^((?:NHIA[-/])?[\w./-]+)\s*[-–]\s*(.+)$/i);
            return {
              code: match?.[1] || null,
              name: match?.[2] || entry,
              category: null,
              price: 0,
              linePriceKnown: false,
            };
          });
    return (
      <div className="space-y-3">
        <div className={`grid items-stretch rounded-xl border border-slate-200 bg-white shadow-sm ${arrivalPin ? "sm:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.8fr)]" : "grid-cols-1"}`}>
          <div className="min-w-0 px-3 py-2.5 sm:px-3.5 sm:py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium leading-snug text-slate-700">
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              Authorization status:
              <span className={`font-semibold ${isPartiallyApproved ? "text-sky-800" : "text-emerald-800"}`}>
                {isPartiallyApproved ? "Partially approved" : "Approved"}
              </span>
            </p>
            <div className="mt-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Authorization code</div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1">
                <span className={`min-w-0 break-all font-mono text-xl font-bold leading-tight tracking-wide sm:text-2xl ${authorizationCodeTone}`}>
                  {approvalResult.authCode}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyCodeOnly}
                  aria-label={`Copy authorization code ${approvalResult.authCode}`}
                  title="Copy authorization code"
                  className="h-7 w-7 shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="mt-1.5 break-words text-xs leading-snug text-slate-600">
              Authorized by: <span className="font-medium text-slate-800">{approvalResult.authorizedByName}{approvalResult.authorizedByInitials ? ` (${approvalResult.authorizedByInitials})` : ""}</span>
            </p>
          </div>
          {arrivalPin && (
            <div className="flex min-w-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-2.5 py-1.5 sm:border-l sm:border-t-0 sm:px-2.5">
              <div className="min-w-0">
                <div className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  Patient OTP / Arrival PIN
                </div>
                <div className="mt-0.5 break-all font-mono text-xs font-semibold tracking-wider text-slate-800">
                  {arrivalPin}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-6 w-6 shrink-0 border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                  aria-label="Copy patient OTP"
                  onClick={async () => {
                    try {
                      await writeClipboardText(arrivalPin);
                      toast({ title: "OTP Copied!" });
                    } catch {
                      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the OTP manually." });
                    }
                  }}
                  title="Copy OTP"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  className="h-6 min-w-0 rounded-full border border-slate-300 bg-white px-2 text-[10px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  onClick={onResendPin}
                  disabled={isResendingPin}
                  title="Resend OTP"
                >
                  {isResendingPin ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                  Resend
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 font-sans text-xs sm:space-y-2.5 sm:p-4">
          <div className="flex items-center gap-2 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Clinical record</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Patient:</strong>
            <span className="min-w-0 break-words font-bold text-slate-800 sm:text-right">{approvalResult.patientName}</span>
          </p>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Policy No:</strong>
            <span className="min-w-0 break-all font-mono font-semibold text-slate-800 sm:text-right">{approvalResult.policyNumber}</span>
          </p>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Hospital:</strong>
            <span className="min-w-0 break-words font-bold text-slate-800 sm:max-w-[75%] sm:text-right">{approvalResult.hospitalName}</span>
          </p>

          {editReferralHospitalName.trim() && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs font-semibold leading-relaxed text-slate-800 shadow-inner">
              Referral To: {editReferralHospitalName.trim()}
              <br />
              Request Raised By: {request?.requesting_hospital_name || request?.hospital_name || "Original hospital"}
              <br />
              <span className="text-xs text-slate-500 font-bold">Claim and payment rights belong to the referred hospital only.</span>
            </div>
          )}

          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Diagnosis:</strong>
            <span className="min-w-0 break-words font-bold text-slate-800 sm:max-w-[75%] sm:text-right">{approvalResult.diagnosis}</span>
          </p>

          <div className="space-y-2 border-b border-slate-100 pb-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Approved Items:</strong>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden divide-y divide-slate-100">
              {approvedItems.length ? (
                approvedItems.map((item: ApprovalItem, index: number) => {
                  const isDeclined = !!item.declined;
                  const hasQuantity = item.quantity !== null && item.quantity !== undefined;
                  const hasLinePrice = item.linePriceKnown !== false &&
                    (item.unitPrice !== null && item.unitPrice !== undefined ||
                      item.price !== null && item.price !== undefined);
                  return (
                    <div
                      key={`${item.code || "item"}-${item.name}-${index}`}
                      className={`flex items-start justify-between gap-3 px-3 py-2.5 ${isDeclined ? "bg-rose-50/50" : "bg-white"}`}
                    >
                      <div className="min-w-0 flex-1">
                        {item.code && (
                          <p className="font-mono text-[10px] font-semibold leading-tight text-slate-500">{item.code}</p>
                        )}
                        <p className={`mt-0.5 break-words text-xs font-semibold leading-snug ${isDeclined ? "line-through text-rose-900/60" : "text-slate-800"}`}>
                          {item.name || "Approved item"}
                          {isDeclined && (
                            <Badge variant="outline" className="ml-1.5 h-4 border-rose-200 bg-rose-100/50 px-1 py-0 text-[9px] font-bold uppercase text-rose-700">
                              Declined
                            </Badge>
                          )}
                        </p>
                        <p className={`mt-1 text-[10px] font-medium leading-snug ${isDeclined ? "text-rose-900/50" : "text-slate-500"}`}>
                          {hasQuantity && hasLinePrice
                            ? <>Qty {itemQuantity(item)} <span className="px-1 text-slate-300">·</span> Unit {formatNaira(itemUnitPrice(item))}</>
                            : "Quantity and line price not recorded"}
                        </p>
                      </div>
                      {hasLinePrice && (
                        <span className={`shrink-0 pt-0.5 text-xs font-semibold tabular-nums ${isDeclined ? "text-rose-700 line-through" : "text-slate-700"}`}>
                          {formatNaira(itemTotal(item))}
                        </span>
                      )}
                      {isDeclined && item.decline_reason && (
                        <div className="text-xs text-rose-700 font-medium bg-rose-100/30 rounded-md px-2 py-1 border border-rose-200/40 mt-1">
                          <span className="font-bold text-rose-800">Reason:</span> {item.decline_reason}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-xs font-semibold text-slate-600 break-words bg-white/40">
                  {approvalResult.treatment?.trim() || request?.treatment?.trim() || "Approved as prescribed"}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-3 border-b border-slate-100 pb-2">
            <p className="flex min-w-0 flex-col gap-0.5">
              <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Registry Date:</strong>
              <span className="font-semibold text-slate-800">{new Date(request?.created_at || new Date()).toLocaleDateString("en-GB")}</span>
            </p>
            <p className="flex min-w-0 flex-col items-end gap-0.5 text-right">
              <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Total Approved:</strong>
              <span className="text-sm font-bold text-slate-900">
                {formatNaira(
                  (approvalResult.items.length
                    ? approvalResult.items
                        .filter((i) => !i.declined)
                        .reduce((sum, i) => sum + itemTotal(i), 0)
                    : 0) ||
                  approvalResult.totalAmount ||
                  Number(request?.total_amount || request?.approved_tariff_amount || 0)
                )}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <p role="status" className="text-xs leading-relaxed text-slate-500">
            Hospital and patient notices are queued automatically after the decision. Resend only if a recipient confirms they did not receive the message.
          </p>
          {/* Primary Action 1: Send Response to Hospital via WhatsApp */}
          <Button
            onClick={handleSendToHospital}
          disabled={sendingHospital || loadingHospitalPhone || (!isWhatsAppRequest() && !formatPhoneNumber(hospitalPhone))}
            aria-busy={sendingHospital}
            className="h-11 w-full rounded-xl bg-emerald-700 text-xs font-semibold text-white shadow-none hover:bg-emerald-800 sm:w-auto sm:px-4"
          >
            {sendingHospital ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4.5 h-4.5" />}
            {sendingHospital ? "Sending…" : "Resend response to hospital"}
          </Button>
          {!loadingHospitalPhone && !isWhatsAppRequest() && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
            <label htmlFor="hospital-approval-phone" className="text-xs font-black uppercase tracking-wider text-slate-600">
              Select or enter hospital WhatsApp number
            </label>
            <Input
              id="hospital-approval-phone"
              list="hospital-whatsapp-contacts-approval"
              value={hospitalPhone}
              onChange={(event) => setHospitalPhone(event.target.value)}
              placeholder="Search contacts or enter a number"
              inputMode="tel"
              className="h-10 rounded-lg bg-white"
            />
            <datalist id="hospital-whatsapp-contacts-approval">
              {hospitalContacts.map((contact) => (
                <option key={`${contact.phone_number}-${contact.hospital_id || ""}`} value={contact.phone_number}>
                  {contact.contact_name || "Hospital contact"}
                </option>
              ))}
            </datalist>
            <p className="text-xs font-medium text-slate-500">
              No sender was identified for this request. Choose a listed contact or type the hospital number manually.
            </p>
          </div>
          )}

          {/* Primary Action 2: Notify Patient via WhatsApp */}
          <Button
            onClick={handleNotifyPatient}
            disabled={sendingPatient}
            aria-busy={sendingPatient}
            className="h-11 w-full rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-none hover:bg-slate-800 sm:w-auto sm:px-4"
          >
            {sendingPatient ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4 text-emerald-400" />}
            {sendingPatient ? "Sending…" : "Resend patient WhatsApp notice"}
          </Button>

          {/* Copy Options */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              onClick={copyApprovalMessage}
              variant="outline"
              className="h-11 rounded-xl border-slate-200 text-slate-700 font-bold text-xs gap-1.5 hover:bg-slate-50 uppercase tracking-wider"
            >
              <Copy className="w-4 h-4 text-slate-500" /> Copy Signature
            </Button>
            <Button
              onClick={handleCopyCodeOnly}
              variant="outline"
              className="h-11 rounded-xl border-slate-200 text-slate-600 font-bold text-xs gap-1.5 hover:bg-slate-50 uppercase tracking-wider"
            >
              <Copy className="w-4 h-4 text-slate-500" /> Copy Code Only
            </Button>
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-slate-100 pt-4">
          <Button
            variant="outline"
            onClick={() => setApprovalResult(null)}
            className="flex-1 h-12 rounded-xl border-slate-200 hover:bg-slate-50 font-black gap-1.5 text-xs uppercase tracking-wider"
          >
            <Eye className="w-4 h-4 text-primary" /> Review Record
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl text-slate-500 hover:bg-slate-100/50 font-black text-xs uppercase tracking-wider"
          >
            Dismiss
          </Button>
          {allowDelete && (
            <Button
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={processing}
              className="flex-1 h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (declineResult) {
    return (
      <div className="space-y-4 animate-in fade-in duration-200">
        <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-slate-700">
              Authorization status: <span className="font-semibold text-rose-900">Declined</span>
            </p>
            <p className="mt-1 break-words text-xs leading-snug text-slate-700 sm:text-sm">
              Reason: <span className="font-medium text-slate-900">{declineResult.reason}</span>
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-rose-200 bg-white p-3 font-sans text-xs shadow-xs sm:space-y-2.5 sm:p-4">
          <div className="flex items-center gap-2 pb-1">
            <Badge variant="destructive" className="border-0 bg-rose-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide hover:bg-rose-700">Clinical Record</Badge>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Patient:</strong>
            <span className="min-w-0 break-words font-bold text-slate-800 sm:text-right">{declineResult.patientName}</span>
          </p>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Policy No:</strong>
            <span className="min-w-0 break-all font-mono font-bold text-rose-700 sm:text-right">{declineResult.policyNumber}</span>
          </p>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Hospital:</strong>
            <span className="min-w-0 break-words font-bold text-slate-800 sm:max-w-[75%] sm:text-right">{declineResult.hospitalName}</span>
          </p>
          <p className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 pb-2 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Requested For:</strong>
            <span className="min-w-0 break-words font-semibold leading-snug text-slate-700 sm:max-w-[75%] sm:text-right">
              {declineResult.diagnosis} - {declineResult.treatment}
            </span>
          </p>
          <p className="flex min-w-0 flex-col gap-0.5 pb-1 sm:flex-row sm:justify-between sm:gap-3">
            <strong className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Reason:</strong>
            <span className="min-w-0 break-words font-bold text-rose-700 sm:max-w-[75%] sm:text-right">{declineResult.reason}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button
            onClick={handleSendDeclineToHospital}
            disabled={sendingDecline || loadingHospitalPhone || (!isWhatsAppRequest() && !formatPhoneNumber(hospitalPhone))}
            className="h-12 w-full gap-2 rounded-lg bg-rose-700 text-sm font-semibold text-white transition-colors hover:bg-rose-800"
          >
            {sendingDecline ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Send className="w-4.5 h-4.5" />}
            Send Decline Response via WhatsApp
          </Button>
          {!loadingHospitalPhone && !isWhatsAppRequest() && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5">
              <label htmlFor="hospital-decline-phone" className="text-xs font-black uppercase tracking-wider text-slate-600">
                Select or enter hospital WhatsApp number
              </label>
              <Input
                id="hospital-decline-phone"
                list="hospital-whatsapp-contacts-decline"
                value={hospitalPhone}
                onChange={(event) => setHospitalPhone(event.target.value)}
                placeholder="Search contacts or enter a number"
                inputMode="tel"
                className="h-10 rounded-lg bg-white"
              />
              <datalist id="hospital-whatsapp-contacts-decline">
                {hospitalContacts.map((contact) => (
                  <option key={`${contact.phone_number}-${contact.hospital_id || ""}`} value={contact.phone_number}>
                    {contact.contact_name || "Hospital contact"}
                  </option>
                ))}
              </datalist>
              <p className="text-xs font-medium text-slate-500">
                No sender was identified for this request. Choose a listed contact or type the hospital number manually.
              </p>
            </div>
          )}

          <Button
            onClick={copyDeclineMessage}
            variant="outline"
            className="w-full h-11 rounded-xl border-slate-200 text-slate-700 font-bold text-xs gap-2 hover:bg-slate-50 uppercase tracking-wider"
          >
            <Copy className="w-4 h-4 text-slate-500" /> Copy Decline Message
          </Button>
        </div>

        <div className="flex gap-2.5 border-t border-slate-100 pt-4">
          <Button
            variant="outline"
            onClick={() => setDeclineResult(null)}
            className="flex-1 h-12 rounded-xl border-slate-200 hover:bg-slate-50 font-black gap-1.5 text-xs uppercase tracking-wider"
          >
            <Eye className="w-4 h-4 text-primary" /> Review Record
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl text-slate-500 hover:bg-slate-100/50 font-black text-xs uppercase tracking-wider"
          >
            Dismiss
          </Button>
          {allowDelete && (
            <Button
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={processing}
              className="flex-1 h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
});
