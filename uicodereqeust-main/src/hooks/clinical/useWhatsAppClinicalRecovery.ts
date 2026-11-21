import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Helper: extract treatment/services text from a request even when treatment
 * field is empty. WhatsApp requests may have "Services: ..." in clinical_notes
 * or the worker may have failed to map it — this recovers those cases.
 */
export function extractTreatmentText(req: any): string {
  if (req?.treatment?.trim()) return req.treatment.trim();
  const cn = req?.clinical_notes;
  if (cn) {
    let parsed: any = cn;
    if (typeof cn === "string") {
      try {
        parsed = JSON.parse(cn);
      } catch {
        /* ignore */
      }
    }
    if (typeof parsed === "object" && parsed !== null) {
      const candidates = [
        parsed.raw_text,
        parsed.services,
        parsed.treatment,
        parsed.requested_service,
        parsed.requestedService,
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.trim();
      }
    }
    if (typeof parsed === "string" && /services?\s*:/i.test(parsed)) {
      return parsed.trim();
    }
  }
  return "";
}

interface UseWhatsAppClinicalRecoveryProps {
  open: boolean;
  request: any;
  requestDetailsLoaded: boolean;
  editDiagnosis: string;
  setEditDiagnosis: (val: string) => void;
}

export function useWhatsAppClinicalRecovery({
  open,
  request,
  requestDetailsLoaded,
  editDiagnosis,
  setEditDiagnosis,
}: UseWhatsAppClinicalRecoveryProps) {
  const [editTreatment, setEditTreatment] = useState("");
  const [recoveredDiagnosis, setRecoveredDiagnosis] = useState<{
    requestId: string;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (open && request) {
      setEditTreatment(extractTreatmentText(request));
    }
  }, [open, request]);

  // Recover missing WhatsApp diagnosis/treatment values from the source message.
  useEffect(() => {
    if (!open || !request) return;
    if (request.source !== "whatsapp") return; // only WhatsApp requests need this
    const needsDiagnosis = !request.diagnosis?.trim();
    const needsTreatment = !request.treatment?.trim() && !extractTreatmentText(request);
    if (!needsDiagnosis && !needsTreatment) return;
    const msgId = request.whatsapp_message_id;
    if (!msgId) return;

    let cancelled = false;
    const recoverClinicalText = async () => {
      const { data, error } = await supabase.functions.invoke("get-whatsapp-clinical-details", {
        body: { request_id: request.id },
      });
      if (error) throw error;
      if (cancelled || !data) return;

      const diagnosis = typeof data.diagnosis === "string" ? data.diagnosis.trim() : "";
      if (needsDiagnosis && diagnosis) setRecoveredDiagnosis({ requestId: request.id, text: diagnosis });

      const treatment = typeof data.treatment === "string" ? data.treatment.trim() : "";
      if (needsTreatment && treatment) {
        setEditTreatment((current) => (cancelled || current.trim() ? current : treatment));
      }
    };
    void recoverClinicalText().catch((error) => {
      if (!cancelled) {
        console.warn("Could not recover missing WhatsApp clinical details from the source message:", error);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    request?.id,
    request?.source,
    request?.whatsapp_message_id,
    request?.diagnosis,
    request?.treatment,
    request?.clinical_notes,
  ]);

  useEffect(() => {
    if (
      !open ||
      !requestDetailsLoaded ||
      !request ||
      request.source !== "whatsapp" ||
      request.diagnosis?.trim() ||
      !recoveredDiagnosis ||
      recoveredDiagnosis.requestId !== request.id ||
      !recoveredDiagnosis.text.trim() ||
      editDiagnosis.trim()
    ) {
      return;
    }
    setEditDiagnosis(recoveredDiagnosis.text);
  }, [
    open,
    requestDetailsLoaded,
    request?.id,
    request?.source,
    request?.diagnosis,
    recoveredDiagnosis,
    editDiagnosis,
    setEditDiagnosis,
  ]);

  return {
    editTreatment,
    setEditTreatment,
  };
}
