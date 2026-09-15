import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadIbadanWorkbookHistory } from "@/lib/ibadanWorkbook";
import {
  normalizePolicyNumber,
  normalizePolicyRoot,
  recordMatchesPolicy,
} from "@/lib/clinicalUtils";

const VERIFICATION_TIMEOUT_MS = 12_000;
const VERIFICATION_RETRY_DELAY_MS = 350;
const FAMILY_LOOKUP_CACHE_TTL_MS = 60_000;
const familyLookupCache = new Map<string, { expiresAt: number; promise: Promise<any[]> }>();

async function withVerificationTimeout<T>(operation: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${VERIFICATION_TIMEOUT_MS / 1000} seconds`)),
      VERIFICATION_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

}

async function withVerificationRetry<T>(
    operationFactory: () => Promise<T>,
    label: string,
    attempts = 2,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await withVerificationTimeout(operationFactory(), label);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, VERIFICATION_RETRY_DELAY_MS));
        }

      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export function prefetchClinicalFamilyPolicy(policyNumber: unknown): void {
  const policy = normalizePolicyNumber(policyNumber);
  if (!policy) return;

  const cached = familyLookupCache.get(policy);
  if (cached && cached.expiresAt > Date.now()) return;

  const promise = withVerificationRetry(
    async () => {
      const result = await (supabase as any).rpc("resolve_nhis_family_members", { _policy: policy });
      if (result.error) throw result.error;
      return result.data || [];
    },
    "NHIS family registry lookup",
  ).catch((error) => {
    familyLookupCache.delete(policy);
    throw error;
  });
  // Background warmups must not create unhandled promise rejections. The
  // cached promise still rejects for a foreground verifier to surface.
  void promise.catch(() => undefined);

  familyLookupCache.set(policy, {
    expiresAt: Date.now() + FAMILY_LOOKUP_CACHE_TTL_MS,
    promise,
  });
}

export function useClinicalVerification(
  open: boolean,
  request: any,
  authReady = true,
) {
  const [checking, setChecking] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const [nhisVerified, setNhisVerified] = useState<boolean | null>(null);
  const [policyVerified, setPolicyVerified] = useState<boolean | null>(null);
  const [patientVerified, setPatientVerified] = useState<boolean | null>(null);
  const [patientMatchStatus, setPatientMatchStatus] = useState<"exact" | "partial" | "none" | null>(null);
  const [matchedMemberId, setMatchedMemberId] = useState<string | null>(null);
  const [earlyRefill, setEarlyRefill] = useState<{ isEarly: boolean; daysSince: number; lastDate: string } | null>(null);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [sheetHistory, setSheetHistory] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const lastAutoRunKeyRef = useRef<string | null>(null);



  const fetchGoogleSheetHistory = useCallback(async (runId: number) => {
    try {
      if (!request.policy_number) {
        if (runId === runIdRef.current) setSheetHistory([]);
        return;
      }

      const policy = normalizePolicyNumber(request.policy_number);
      const workbookHistory = await withVerificationTimeout(
        loadIbadanWorkbookHistory(policy),
        "Historical workbook lookup",
      );
      const filteredHistory = workbookHistory
        .filter((record: any) => {
          return recordMatchesPolicy(record, policy);
        })
        .map((record: any) => ({
          id: record.id,
          date: record.date || record.created_at,
          patient_name: record.patient_name,
          policy_number: record.policy_number,
          authorization_code: record.authorization_code,
          diagnosis: record.diagnosis,
          treatment: record.treatment,
          requesting_officer: record.requesting_officer,
          note: record.note,
          status: record.status,
          source: "ibadan_workbook",
        }));

      if (filteredHistory.length > 0) {
        if (runId === runIdRef.current) setSheetHistory(filteredHistory);
        return;
      }
      if (runId === runIdRef.current) setSheetHistory([]);
    } catch (err) {
      console.error("Workbook history error:", err);
    }
  }, [request]);

  const fetchLocalHistory = useCallback(async (runId: number) => {
    if (!request.policy_number) return;

    try {
      const policy = normalizePolicyNumber(request.policy_number);
      const policyRoot = normalizePolicyRoot(policy);
      let historyQuery = supabase
        .from("authorization_requests")
        .select("id, request_id, patient_name, policy_number, diagnosis, treatment, hospital_name, status, authorization_code, decision_reason, clinical_notes, decided_at, created_at, source")
        .in("status", ["approved", "partially_approved"])
        .neq("source", "sheet_history")
        .order("decided_at", { ascending: false });
      if (policyRoot) {
        historyQuery = historyQuery.or(
          `policy_number.eq.${policy},policy_number.ilike.${policyRoot}-%`,
        );
      }

      const { data: history } = await withVerificationTimeout(
        historyQuery,
        "Authorization history lookup",
      );
      const matchingHistory = (history || []).filter((record: any) =>
        recordMatchesPolicy(record, policy)
      );
      if (runId !== runIdRef.current) return;
      setLocalHistory(matchingHistory);

      const latest = matchingHistory[0];
      if (latest?.decided_at) {
        const daysSince = Math.floor((Date.now() - new Date(latest.decided_at).getTime()) / (1000 * 60 * 60 * 24));
        setEarlyRefill(
          daysSince < 30
            ? { isEarly: true, daysSince, lastDate: latest.decided_at }
            : null,
        );
      } else {
        setEarlyRefill(null);
      }
    } catch (err) {
      // History is secondary enrichment; do not turn a valid registry result into
      // a verification error when this separate query is slow or unavailable.
      console.error("Authorization history error:", err);
    }
  }, [request]);

  const runVerificationSuite = useCallback(async () => {
    const runId = ++runIdRef.current;
    setChecking(true);
    setVerificationError(null);
    
    // Fire off Google Sheet History in parallel to avoid blocking the main DB checks
    void fetchGoogleSheetHistory(runId);
    // History is useful context but must not delay the authoritative registry result.
    void fetchLocalHistory(runId);

    try {
      const policy = normalizePolicyNumber(request.policy_number);
      const patientName = String(request.patient_name || "").trim();
      let matchedRows: any[] = [];
      let hasPolicyMatch = false;
      let hasNameMatch = false;

      // 1. Resolve the complete family through the canonical database policy
      // resolver. This supports both suffixed and base-only registry records.
      if (policy || patientName) {
        if (policy) {
          const cachedLookup = familyLookupCache.get(policy);
          if (cachedLookup && cachedLookup.expiresAt <= Date.now()) {
            familyLookupCache.delete(policy);
          }
          if (!familyLookupCache.has(policy)) prefetchClinicalFamilyPolicy(policy);
          matchedRows = await familyLookupCache.get(policy)!.promise;
        }
        
        hasPolicyMatch = matchedRows.length > 0;

        if (!hasPolicyMatch && patientName) {
          const { data } = await withVerificationRetry(
            () => supabase.from("nhis_beneficiaries")
                .select("id, full_name, surname, first_name, policy_number")
              .or(`full_name.ilike.%${patientName}%,surname.ilike.%${patientName}%,first_name.ilike.%${patientName}%`)
              .limit(50),
            "NHIS name lookup",
          );
          matchedRows = data || [];
        }
        
        hasNameMatch = matchedRows.length > 0 && !hasPolicyMatch;
      }
      
      // 2. NHIS matching logic 
      let matchStatus: "exact" | "partial" | "none" = "none";
      let bestMatchMemberId: string | null = null;
      
      if (hasNameMatch || hasPolicyMatch) {
        const normalizedRequestedName = patientName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .sort()
          .join(" ");
        const exactNameMatch = matchedRows.find((row) => {
          const rowName = String(row.full_name || `${row.surname || ""} ${row.first_name || ""}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .sort()
            .join(" ");
          return rowName === normalizedRequestedName;
        });

        if (exactNameMatch) {
          matchStatus = "exact";
          bestMatchMemberId = exactNameMatch.id;
        } else {
          matchStatus = "none";
          bestMatchMemberId = null;
        }
      }

      if (runId !== runIdRef.current) return;
      setMatchedMemberId(bestMatchMemberId);
      setPatientMatchStatus(matchStatus);
      setPolicyVerified(hasPolicyMatch);
      setNhisVerified(hasPolicyMatch || hasNameMatch);
      
      // 3. Fallback logic for patients table
      if (matchedRows.length > 0) {
        if (runId !== runIdRef.current) return;
        setPatientVerified(true);
        setFamilyMembers(matchedRows);
      } else if (request.policy_number) {
        const { data: patients } = await withVerificationTimeout(
          supabase.from("patients").select("id, policy_number, role, expiry_date, full_name, first_name, surname").eq("policy_number", request.policy_number),
          "Patient registry fallback lookup",
        );
        if (patients && patients.length > 0) {
          if (runId !== runIdRef.current) return;
          setPatientVerified(true);
          setFamilyMembers(patients);
          const principal = patients.find((p: any) => p.role === "PRINCIPAL") || patients[0];
          if (principal.expiry_date && new Date(principal.expiry_date) < new Date()) {
            setPatientVerified(false);
          }
        } else {
          if (runId !== runIdRef.current) return;
          setPatientVerified(false);
          setFamilyMembers([]);
        }
      } else {
         if (runId !== runIdRef.current) return;
         setPatientVerified(false);
         setFamilyMembers([]);
      }

    } catch (err) {
      console.error("Verification error:", {
        error: err,
        policy: normalizePolicyNumber(request.policy_number),
        patientName: String(request.patient_name || "").trim(),
      });
      if (runId === runIdRef.current) {
        setVerificationError("NHIS registry verification could not be completed. Please retry.");
        setNhisVerified(null);
        setPolicyVerified(null);
        setPatientVerified(null);
        setPatientMatchStatus(null);
        setMatchedMemberId(null);
        setFamilyMembers([]);
      }
    } finally {
      if (runId === runIdRef.current) {
        setChecking(false);
      }
    }
  }, [request, fetchGoogleSheetHistory, fetchLocalHistory]);

  useEffect(() => {
    if (open && request && authReady) {
      const runKey = [
        request.id || "",
        request.policy_number || "",
        request.patient_name || "",
      ].join("|");
      if (lastAutoRunKeyRef.current === runKey) return;
      lastAutoRunKeyRef.current = runKey;

      setNhisVerified(null);
      setPolicyVerified(null);
      setPatientVerified(null);
      setPatientMatchStatus(null);
      setMatchedMemberId(null);
      setEarlyRefill(null);
      setLocalHistory([]);
      setSheetHistory([]);
      setFamilyMembers([]);
      setVerificationError(null);

      void runVerificationSuite();
    } else if (!open) {
      lastAutoRunKeyRef.current = null;
    }
  }, [open, request?.id, request?.policy_number, request?.patient_name, authReady, runVerificationSuite]);

  return {
    checking,
    verificationError,
    nhisVerified,
    policyVerified,
    patientVerified,
    patientMatchStatus,
    matchedMemberId,
    earlyRefill,
    localHistory,
    sheetHistory,
    familyMembers,
    runVerificationSuite,
  };
}
