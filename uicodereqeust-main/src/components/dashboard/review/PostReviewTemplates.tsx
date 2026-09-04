import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  XCircle,
  Copy,
  Sparkles,
  Trash2,
  Send,
  Loader2,
  Building2,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
    items: any[];
    totalAmount: number;
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
  nurseDisplayName: string;
  nurseInitials: string;
}

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
  nurseDisplayName,
  nurseInitials,
}: PostReviewTemplatesProps) {
  const { toast } = useToast();
  const [sendingHospital, setSendingHospital] = useState(false);
  const [sendingPatient, setSendingPatient] = useState(false);
  const [sendingDecline, setSendingDecline] = useState(false);

  const handleCopyCodeOnly = () => {
    if (!approvalResult) return;
    navigator.clipboard.writeText(approvalResult.authCode);
    toast({
      title: "Code Copied",
      description: "Authorization code copied to clipboard.",
    });
  };

  const formatPhoneNumber = (raw: string) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("234")) return digits;
    if (digits.length === 10) return "234" + digits;
    if (digits.length === 11 && digits.startsWith("0")) return "234" + digits.slice(1);
    return digits;
  };

  const handleSendToHospital = async () => {
    if (!approvalResult) return;
    setSendingHospital(true);
    try {
      const rawPhone = request?.patient_phone || request?.phone_number || "";
      const formatted = formatPhoneNumber(rawPhone);
      const reqRef = request?.request_id || request?.id?.slice(0, 8) || "REQ";
      const dateStr = new Date().toLocaleDateString("en-GB");

      const itemLines = approvalResult.items.length
        ? approvalResult.items
            .map((item) =>
              item.declined
                ? `[DECLINED] ${item.code || "NHIA"} - ${item.name}${item.decline_reason ? ` (Reason: ${item.decline_reason})` : ""}`
                : `${item.code || "NHIA"} - ${item.name}: ${itemQuantity(item)}`
            )
            .join("\n")
        : approvalResult.treatment;

      const requester = request?.requesting_hospital_name || request?.hospital_name || approvalResult.hospitalName;
      const referralLine = editReferralHospitalName.trim()
        ? `\nRequest Raised By: ${requester}\nReferral To: ${editReferralHospitalName.trim()}\nClaim Rights: ${editReferralHospitalName.trim()} only`
        : "";

      const msg = `AUTHORIZATION APPROVED\n\nPatient: ${approvalResult.patientName}\nPolicy No: ${approvalResult.policyNumber}\nAuth Code: ${approvalResult.authCode}\nHospital: ${approvalResult.hospitalName}${referralLine}\nDiagnosis: ${approvalResult.diagnosis}\n\nApproved Items:\n${itemLines}\nDate: ${dateStr}\n\nPlease present this code at the hospital reception.\nRonsberger HMO UI Desk`;

      if (!formatted) {
        navigator.clipboard.writeText(msg);
        toast({ title: "Copied!", description: "No phone on record. Copied response to clipboard." });
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone_number: formatted, message: msg },
      });

      if (error || !data?.success) {
        const url = `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
        toast({ title: "Opening WhatsApp...", description: "Switched to direct WhatsApp web" });
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
      const rawPhone = request?.patient_phone || "";
      const formatted = formatPhoneNumber(rawPhone);
      const priorityStr = (request?.urgency || "ROUTINE").toUpperCase();

      const approvedItemsList = approvalResult.items.length
        ? approvalResult.items
            .filter((item) => !item.declined)
            .map((item) => `• *${itemQuantity(item)}x ${item.name}*`)
            .join("\n")
        : (approvalResult.treatment ? `• *${approvalResult.treatment}*` : "• *Approved as prescribed*");

      const msg = `*Ronsberger HMO*\n\n*AUTHORIZATION APPROVED*\n\nHello *${approvalResult.patientName}*,\n\nWe are pleased to inform you that your treatment request submitted through *${approvalResult.hospitalName}* has been *approved* by Ronsberger HMO.\n\nYour requested treatment has been authorized based on the diagnosis and request details below.\n\n*Request Details*\n\nPatient: *${approvalResult.patientName}*\nPolicy No.: *${approvalResult.policyNumber}*\nHospital: *${approvalResult.hospitalName}*\nDiagnosis: *${approvalResult.diagnosis}*\nPriority: *${priorityStr}*\n\n*Approved Treatment / Services*\n\n${approvedItemsList}\n\n*Important Notice*\nPlease contact us immediately if these services were not fully rendered to you, or if you are asked to make any additional payments for the approved items listed above.\n\nThank you for choosing Ronsberger HMO.`;

      if (!formatted) {
        navigator.clipboard.writeText(msg);
        toast({ title: "Copied!", description: "No patient phone on record. Copied patient notice to clipboard." });
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone_number: formatted, message: msg },
      });

      if (error || !data?.success) {
        const url = `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
        toast({ title: "Opening WhatsApp...", description: "Switched to direct WhatsApp web" });
      } else {
        toast({ title: "Patient Notified!", description: `Approval PIN sent to patient (${formatted})` });
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
      const rawPhone = request?.patient_phone || request?.phone_number || "";
      const formatted = formatPhoneNumber(rawPhone);
      const reqRef = request?.request_id || request?.id?.slice(0, 8) || "REQ";

      const msg = `*Ronsberger HMO*\n\n*AUTHORIZATION DECLINED*\n\n*Reference:* ${reqRef}\n*Patient:* ${declineResult.patientName}\n*Policy No:* ${declineResult.policyNumber}\n*Hospital:* ${declineResult.hospitalName}\n*Diagnosis:* ${declineResult.diagnosis}\n\n*Reason for Decline:*\n${declineResult.reason}\n\nIf you need clarification, please reply to this message.\n\n— Ronsberger HMO Medical Desk`;

      if (!formatted) {
        navigator.clipboard.writeText(msg);
        toast({ title: "Copied!", description: "No phone on record. Copied decline note to clipboard." });
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone_number: formatted, message: msg },
      });

      if (error || !data?.success) {
        const url = `https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
        toast({ title: "Opening WhatsApp...", description: "Switched to direct WhatsApp web" });
      } else {
        toast({ title: "Decline Sent via WhatsApp!", description: `Decline notice sent to ${formatted}` });
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: e.message || "Failed to send decline notice." });
    } finally {
      setSendingDecline(false);
    }
  };

  if (approvalResult) {
    return (
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center p-6 sm:p-8 bg-emerald-50/70 rounded-3xl border border-emerald-100 relative overflow-hidden shadow-xs">
          <CheckCircle className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 text-emerald-600" />
          <p className="text-xs uppercase font-black tracking-widest text-emerald-800/60 mb-2">Approved Auth Code</p>
          <p className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tighter tabular-nums break-all">
            {approvalResult.authCode}
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-800/40">
            Authorized by {nurseDisplayName} ({nurseInitials})
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 text-xs space-y-3 font-sans border border-slate-100 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-emerald-600 hover:bg-emerald-700 border-0 text-xs font-black uppercase tracking-wider">Clinical Record</Badge>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <p className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Patient:</strong>
            <span className="font-bold text-slate-800 text-right">{approvalResult.patientName}</span>
          </p>
          <p className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Policy No:</strong>
            <span className="font-mono text-emerald-700 font-bold break-all">{approvalResult.policyNumber}</span>
          </p>
          <p className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Hospital:</strong>
            <span className="font-bold text-slate-800 text-right">{approvalResult.hospitalName}</span>
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

          <p className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Diagnosis:</strong>
            <span className="font-bold text-slate-800 text-right">{approvalResult.diagnosis}</span>
          </p>

          <div className="space-y-2 border-b border-slate-100 pb-3">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Approved Items:</strong>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 overflow-hidden divide-y divide-slate-100">
              {approvalResult.items.length ? (
                approvalResult.items.map((item) => {
                  const isDeclined = !!item.declined;
                  return (
                    <div
                      key={`${item.code}-${item.name}`}
                      className={`flex flex-col gap-1 px-3 py-2 ${isDeclined ? "bg-rose-50/50" : "bg-white/40"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className={`block text-xs font-bold break-words ${isDeclined ? "line-through text-rose-900/60" : "text-slate-800"}`}>
                            {item.code || "NHIA"} - {item.name}
                            {isDeclined && (
                              <Badge variant="outline" className="ml-1.5 border-rose-200 bg-rose-100/50 text-xs font-black uppercase tracking-wider text-rose-700 px-1 py-0 h-4">
                                Declined
                              </Badge>
                            )}
                          </span>
                          <span className={`block text-xs font-semibold uppercase tracking-wider mt-0.5 ${isDeclined ? "text-rose-900/40" : "text-slate-400"}`}>
                            {item.category || "NHIA item"} · Qty {itemQuantity(item)} · Unit {formatNaira(itemUnitPrice(item))}
                          </span>
                        </span>
                        <span className={`shrink-0 font-black text-xs mt-0.5 ${isDeclined ? "text-rose-700 line-through" : "text-emerald-700"}`}>
                          {formatNaira(itemTotal(item))}
                        </span>
                      </div>
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
                  {approvalResult.treatment}
                </p>
              )}
            </div>
          </div>

          <p className="flex flex-wrap justify-between gap-1 border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Total Approved:</strong>
            <span className="font-black text-emerald-700 text-sm">{formatNaira(approvalResult.totalAmount)}</span>
          </p>
          <p className="flex flex-wrap justify-between gap-1 pb-1">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Registry Date:</strong>
            <span className="font-bold text-slate-800">{new Date(request?.created_at || new Date()).toLocaleDateString("en-GB")}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {/* Primary Action 1: Send Response to Hospital via WhatsApp */}
          <Button
            onClick={handleSendToHospital}
            disabled={sendingHospital}
            className="w-full h-13 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm gap-2 shadow-lg shadow-emerald-100 uppercase tracking-widest transition-transform hover:scale-[1.01]"
          >
            {sendingHospital ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4.5 h-4.5" />}
            Send Response to Hospital (WhatsApp)
          </Button>

          {/* Primary Action 2: Notify Patient via WhatsApp */}
          <Button
            onClick={handleNotifyPatient}
            disabled={sendingPatient}
            className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs gap-2 shadow-md uppercase tracking-wider transition-transform hover:scale-[1.01]"
          >
            {sendingPatient ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4 text-emerald-400" />}
            Notify Patient via WhatsApp (PIN)
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
            <Sparkles className="w-4 h-4 text-primary" /> Modify Record
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
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center p-6 sm:p-8 bg-rose-50/70 rounded-3xl border border-rose-100 relative overflow-hidden shadow-xs">
          <XCircle className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 text-rose-600" />
          <p className="text-xs uppercase font-black tracking-widest text-rose-800/60 mb-2">Decline Note</p>
          <p className="text-xl sm:text-2xl font-black text-rose-700 tracking-tight">
            {declineResult.reason}
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 text-xs space-y-3 font-sans border border-rose-100 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="destructive" className="border-0 text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-700">Clinical Record</Badge>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <p className="flex justify-between border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Patient:</strong>
            <span className="font-bold text-slate-800">{declineResult.patientName}</span>
          </p>
          <p className="flex justify-between border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Policy No:</strong>
            <span className="font-mono text-rose-700 font-bold break-all">{declineResult.policyNumber}</span>
          </p>
          <p className="flex justify-between border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Hospital:</strong>
            <span className="font-bold text-slate-800">{declineResult.hospitalName}</span>
          </p>
          <p className="flex justify-between border-b border-slate-100 pb-2.5">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Requested For:</strong>
            <span className="font-semibold text-slate-700 text-right leading-snug">
              {declineResult.diagnosis} - {declineResult.treatment}
            </span>
          </p>
          <p className="flex justify-between pb-1">
            <strong className="text-slate-500 uppercase tracking-wider text-xs">Reason:</strong>
            <span className="font-bold text-rose-700">{declineResult.reason}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button
            onClick={handleSendDeclineToHospital}
            disabled={sendingDecline}
            className="w-full h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-sm gap-2 shadow-lg shadow-rose-100 uppercase tracking-widest transition-transform hover:scale-[1.01]"
          >
            {sendingDecline ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Send className="w-4.5 h-4.5" />}
            Send Decline Response via WhatsApp
          </Button>

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
            <Sparkles className="w-4 h-4 text-primary" /> Modify Record
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
