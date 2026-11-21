import { useMemo } from "react";
import {
  recordMatchesHistory,
  normalizePolicyNumber,
  normalizePatientNameForMatch,
} from "@/lib/clinicalUtils";

/**
 * Parses a clinical_notes or decision_reason value that may contain a JSON blob
 * (from WhatsApp intake) into a human-readable string for display.
 */
export function formatClinicalNotes(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
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
}

/**
 * Builds, filters, deduplicates, and sorts the combined history records
 * (local + spreadsheet) for a given request.
 */
export function useVisibleHistory(
  request: any,
  sheetHistory: any[],
  localHistory: any[]
) {
  const targetPolicy = useMemo(
    () => normalizePolicyNumber(request?.policy_number),
    [request?.policy_number]
  );

  const visibleHistory = useMemo(() => {
    const getRecordTime = (r: any) => {
      const d = r.date || r.decided_at || r.created_at;
      return d ? new Date(d).getTime() : 0;
    };

    const combined = [...sheetHistory, ...localHistory].filter((record) => {
      if (recordMatchesHistory(record, targetPolicy)) return true;
      if (request?.patient_name && (record?.patient_name || record?.name)) {
        const reqName = normalizePatientNameForMatch(request.patient_name);
        const recName = normalizePatientNameForMatch(record.patient_name || record.name);
        if (
          reqName &&
          recName &&
          (reqName === recName || reqName.includes(recName) || recName.includes(reqName))
        ) {
          return true;
        }
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

      const primaryKey =
        authCode && !["-", "PENDING", "NONE", "NULL"].includes(authCode)
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
  }, [sheetHistory, localHistory, targetPolicy, request?.patient_name]);

  return { visibleHistory, targetPolicy };
}
