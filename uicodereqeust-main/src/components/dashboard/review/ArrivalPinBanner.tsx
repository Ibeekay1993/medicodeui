import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Copy, Send } from "lucide-react";
import { writeClipboardText } from "@/lib/clipboard";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cleanPatientName } from "@/lib/clinicalUtils";
import { getWhatsAppSendErrorMessage } from "@/lib/whatsappSendError";

interface ArrivalPinBannerProps {
  visibleOtpValue: string | null | undefined;
  request: any;
  hasApprovalResult: boolean;
}

export function ArrivalPinBanner({ visibleOtpValue, request, hasApprovalResult }: ArrivalPinBannerProps) {
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  if (!visibleOtpValue || hasApprovalResult) {
    return null;
  }

  const handleResendOtp = async () => {
    if (!request) return;
    setIsResending(true);
    try {
      if (!request.patient_phone) {
        throw new Error("This patient does not have a WhatsApp phone number on record.");
      }

      const arrivalPinToResend = visibleOtpValue.trim();
      if (!arrivalPinToResend) {
        throw new Error("No verified Arrival PIN is available to resend for this authorization. Please ensure the PIN is generated.");
      }

      // Format clean message for patient
      const patientName = cleanPatientName(request.patient_name || "");
      const policyNo = request.policy_number || "N/A";
      const hospitalName = request.hospital_name || "the hospital";
      const diagnosis = request.diagnosis || "Not specified";
      const priority = request.urgency || "ROUTINE";
      const pin = arrivalPinToResend;
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

      // Clean telephone formatting
      const phoneStr = String(request.patient_phone || "");
      const cleanNumber = phoneStr.replace(/\D/g, "");
      let formattedNumber = cleanNumber;
      if (cleanNumber.length === 11 && cleanNumber.startsWith("0")) {
        formattedNumber = "234" + cleanNumber.substring(1);
      } else if (cleanNumber.length === 10) {
        formattedNumber = "234" + cleanNumber;
      }

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

  const handleCopy = async () => {
    try {
      await writeClipboardText(visibleOtpValue);
      toast({ title: "OTP Copied!" });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the OTP manually." });
    }
  };

  return (
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
          onClick={handleCopy}
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
          {isResending ? <BrandSpinner className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Resend
        </Button>
      </div>
    </div>
  );
}
