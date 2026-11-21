import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cleanPatientName } from "@/lib/clinicalUtils";
import { getWhatsAppSendErrorMessage } from "@/lib/whatsappSendError";

interface UsePatientArrivalPinResendProps {
  request: any;
  visibleOtpValue: string | null | undefined;
}

export function usePatientArrivalPinResend({
  request,
  visibleOtpValue,
}: UsePatientArrivalPinResendProps) {
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  const handleResendOtp = useCallback(async () => {
    if (!request) return;
    setIsResending(true);
    try {
      if (!request.patient_phone) {
        throw new Error("This patient does not have a WhatsApp phone number on record.");
      }

      // Strictly source the verified Arrival PIN (never fall back to auth_code or treatment PIN)
      const arrivalPinToResend = (visibleOtpValue || "").trim();
      if (!arrivalPinToResend) {
        throw new Error(
          "No verified Arrival PIN is available to resend for this authorization. Please ensure the PIN is generated."
        );
      }

      // Prepare WhatsApp message
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
        itemsText =
          "\n\n*Approved Treatment / Services*\n\n" +
          itemsList
            .map((item: any) => {
              const qty = item.quantity || 1;
              const name = item.name || "Service";
              return `• *${qty}x ${name}*`;
            })
            .join("\n");
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
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setIsResending(false);
    }
  }, [request, visibleOtpValue, toast]);

  return {
    isResending,
    handleResendOtp,
  };
}
