import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanPatientName,
  normalizePatientNameForMatch,
  normalizePolicyNumber,
  normalizePolicyRoot,
  recordMatchesPolicy,
} from "@/lib/clinicalUtils";

function withTimeout<T>(promise: PromiseLike<T>, ms: number = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms)
    ),
  ]);
}

export function useClinicalVerification(
  open: boolean,
  request: any
) {
  const [checking, setChecking] = useState(false);
  const [verificationLoadFailed, setVerificationLoadFailed] = useState(false);
  const [nhisVerified, setNhisVerified] = useState<boolean | null>(null);
  const [policyVerified, setPolicyVerified] = useState<boolean | null>(null);
  const [patientVerified, setPatientVerified] = useState<boolean | null>(null);
  const [patientMatchStatus, setPatientMatchStatus] = useState<"exact" | "partial" | "none" | null>(null);
  const [matchedMemberId, setMatchedMemberId] = useState<string | null>(null);
  const [matchedBeneficiaryNumber, setMatchedBeneficiaryNumber] = useState<string | null>(null);
  const [earlyRefill, setEarlyRefill] = useState<{ isEarly: boolean; daysSince: number; lastDate: string } | null>(null);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);
  const [historyChecking, setHistoryChecking] = useState(false);
  // Kept for backward compatibility; all records now load from localHistory (single source of truth)
  const [sheetHistory, setSheetHistory] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);

  const runHistoryLookup = useCallback(async () => {
    const policy = normalizePolicyNumber(request?.policy_number);
    const patientName = String(request?.patient_name || "").trim();
    const policyRoot = normalizePolicyRoot(policy);
    const beneficiaryNum = normalizePolicyNumber(request?.beneficiary_number);

    if (!policy && !patientName && !beneficiaryNum) {
      setLocalHistory([]);
      return;
    }

    setHistoryChecking(true);
    setHistoryLoadFailed(false);
    try {
      let history: any[] = [];

      // ── Step 1: Try the indexed RPC. It runs as the caller so table RLS still applies. ──
      let rpcSucceeded = false;
      try {
        const { data: rpcData, error: rpcError } = await withTimeout(
          (supabase as any).rpc("get_patient_authorization_history", {
            p_policy_number: policy || null,
            p_policy_root: policyRoot || null,
            p_beneficiary_number: beneficiaryNum || null,
            p_limit: 100,
          }),
          8000,
        );
        if (!rpcError && Array.isArray(rpcData)) {
          history = rpcData;
          rpcSucceeded = true;
        }
      } catch {
        // RPC not deployed yet or timed out; will fall back to direct query below
      }

      // ── Step 2: Fallback direct query (if RPC not available) ──
      // IMPORTANT: DO NOT add .order("created_at") in the SQL query!
      // On Postgres, ORDER BY created_at with LIMIT forces a full sequential scan
      // over 75k+ rows on Nano compute, triggering statement timeouts.
      // We query by indexed policy/beneficiary filters and sort in JavaScript memory instead.
      if (!rpcSucceeded && policy) {
        const conditions = new Set<string>();
        if (policyRoot) {
          conditions.add(policy_number.eq. + policyRoot);
          conditions.add(policy_number.like. + policyRoot + -%);
        }
        if (policy !== policyRoot) conditions.add(policy_number.eq. + policy);
        if (beneficiaryNum) conditions.add(eneficiary_number.eq. + beneficiaryNum);

        const { data, error } = await withTimeout(
          supabase
            .from("authorization_requests")
            .select("id, request_id, patient_name, policy_number, beneficiary_number, diagnosis, treatment, hospital_name, status, authorization_code, decision_reason, clinical_notes, decided_at, created_at, source, is_historical")
            .or([...conditions].join(","))
            .limit(100),
          12000,
        );
        if (error) throw error;
        history = data || [];
      }

      // Name fallback: for legacy requests that have no policy attached
      if (!rpcSucceeded && !policy && patientName.length >= 3) {
        const namePrefixes = [...new Set(cleanPatientName(patientName)
          .split(/\s+/)
          .map((word) => word.replace(/[^a-z0-9]/gi, ""))
          .filter((word) => word.length >= 3))];
        if (namePrefixes.length) {
          const { data, error } = await withTimeout(
            supabase
              .from("authorization_requests")
              .select("id, request_id, patient_name, policy_number, beneficiary_number, diagnosis, treatment, hospital_name, status, authorization_code, decision_reason, clinical_notes, decided_at, created_at, source, is_historical")
              .or(namePrefixes.map((word) => patient_name.ilike. + word + %).join(","))
              .limit(50),
            12000,
          );
          if (error) throw error;
          history = data || [];
        }
      }

      // Sort newest first in memory (instant, 0ms CPU overhead)
      history.sort((a, b) => {
        const tA = Date.parse(a.decided_at || a.created_at || "") || 0;
        const tB = Date.parse(b.decided_at || b.created_at || "") || 0;
        return tB - tA;
      });

      const matchingHistory = history.filter((record: any) => {
        if (policy) return recordMatchesPolicy(record, policy);
        if (beneficiaryNum && normalizePolicyNumber(record?.beneficiary_number) === beneficiaryNum) return true;
        const rName = normalizePatientNameForMatch(record?.patient_name || "");
        const pName = normalizePatientNameForMatch(patientName);
        return Boolean(rName && pName && rName === pName);
      }).map((record: any) => ({
        ...record,
        date: record.date || record.decided_at || record.created_at,
      }));

      setLocalHistory(matchingHistory);

      const latestDecision = matchingHistory.find((record) => record.decided_at);
      if (latestDecision?.decided_at) {
        const daysSince = Math.floor((Date.now() - new Date(latestDecision.decided_at).getTime()) / (1000 * 60 * 60 * 24));
        setEarlyRefill(daysSince < 30 ? { isEarly: true, daysSince, lastDate: latestDecision.decided_at } : null);
      } else {
        setEarlyRefill(null);
      }
    } catch (historyErr) {
      console.warn("History query warning:", historyErr);
      setHistoryLoadFailed(true);
      setLocalHistory([]);
      setEarlyRefill(null);
    } finally {
      setHistoryChecking(false);
    }
  }, [request?.policy_number, request?.patient_name, request?.beneficiary_number]);
  const runVerificationSuite = useCallback(async () => {
    setChecking(true);
    setVerificationLoadFailed(false);

    const policy = normalizePolicyNumber(request?.policy_number);
    const patientName = String(request?.patient_name || "").trim();
    const policyRoot = normalizePolicyRoot(policy);
    void runHistoryLookup();

    // 2. NHIS family & policy resolution (Indexed lookups, NO unindexed RPC calls)
    try {
      let matchedRows: any[] = [];
      if (policy) {
        try {
          const conditions = new Set([`policy_number.eq.${policy}`]);
          if (policyRoot && policyRoot !== policy) conditions.add(`policy_number.eq.${policyRoot}`);
          if (policyRoot) conditions.add(`policy_number.like.${policyRoot}-%`);
          const { data, error } = await withTimeout(
            supabase
              .from("nhis_beneficiaries")
              .select("id,full_name,surname,first_name,hcp_name,hcp_code,member_type,policy_number,beneficiary_number")
              .or([...conditions].join(","))
              .limit(50),
            4000
          );
          if (error) throw error;
          matchedRows = data || [];
        } catch (err) {
          throw err;
        }
      }
      const hasPolicyMatch = matchedRows.length > 0;

      // Name fallback — only runs if policy didn't match
      if (!hasPolicyMatch && patientName) {
        try {
          const namePrefixes = [...new Set(cleanPatientName(patientName)
            .split(/\s+/)
            .map((word) => word.replace(/[^a-z0-9]/gi, ""))
            .filter((word) => word.length >= 3))];
          if (namePrefixes.length) {
            const { data, error } = await withTimeout(
              supabase
                .from("nhis_beneficiaries")
                .select("id,full_name,surname,first_name,hcp_name,hcp_code,member_type,policy_number,beneficiary_number")
                .or(namePrefixes.map((word) => `full_name.ilike.${word}%`).join(","))
                .limit(30),
              4000
            );
            if (error) throw error;
            matchedRows = data || [];
          }
        } catch (err) {
          throw err;
        }
      }

      const hasNameMatch = matchedRows.length > 0 && !hasPolicyMatch;

      let matchStatus: "exact" | "partial" | "none" = "none";
      let bestMatchMemberId: string | null = null;
      let bestMatchBeneficiaryNumber: string | null = null;

      if (hasNameMatch || hasPolicyMatch) {
        const normalizedRequestedName = patientName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .sort()
          .join(" ");
        const requestedBeneficiary = String(request?.beneficiary_number || "").trim().toUpperCase();
        const exactBeneficiaryMatch = requestedBeneficiary
          ? matchedRows.find((row) => String(row.beneficiary_number || "").trim().toUpperCase() === requestedBeneficiary)
          : undefined;
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
        if (requestedBeneficiary ? exactBeneficiaryMatch && exactNameMatch?.id === exactBeneficiaryMatch.id : exactNameMatch) {
          matchStatus = "exact";
          const matchedMember = exactBeneficiaryMatch || exactNameMatch;
          bestMatchMemberId = matchedMember.id;
          bestMatchBeneficiaryNumber = String(matchedMember.beneficiary_number || "").trim() || null;
        }
      }

      setMatchedMemberId(bestMatchMemberId);
      setMatchedBeneficiaryNumber(bestMatchBeneficiaryNumber);
      setPatientMatchStatus(matchStatus);
      setPolicyVerified(hasPolicyMatch);
      setNhisVerified(hasPolicyMatch || hasNameMatch);

      // Fallback to patients table if no NHIS match
      if (matchedRows.length > 0) {
        setPatientVerified(true);
        setFamilyMembers(matchedRows);
      } else if (request?.policy_number) {
        try {
          const { data: patients, error } = await withTimeout(
            supabase.from("patients").select("*").eq("policy_number", request.policy_number),
            4000,
          );
          if (error) throw error;
          if (patients && patients.length > 0) {
            setPatientVerified(true);
            setFamilyMembers(patients);
            const principal = patients.find((p: any) => p.role === "PRINCIPAL") || patients[0];
            if (principal.expiry_date && new Date(principal.expiry_date) < new Date()) {
              setPatientVerified(false);
            }
          } else {
            setPatientVerified(false);
            setFamilyMembers([]);
          }
        } catch (patientsErr) {
          throw patientsErr;
        }
      } else {
        setPatientVerified(false);
        setFamilyMembers([]);
      }
    } catch (nhisErr) {
      console.warn("NHIS verification warning:", nhisErr);
      setVerificationLoadFailed(true);
      setNhisVerified(null);
      setPolicyVerified(null);
      setPatientVerified(null);
      setPatientMatchStatus(null);
      setFamilyMembers([]);
    } finally {
      setChecking(false);
    }
  }, [request, runHistoryLookup]);

  useEffect(() => {
    if (open && request) {
      setNhisVerified(null);
      setVerificationLoadFailed(false);
      setPolicyVerified(null);
      setPatientVerified(null);
      setPatientMatchStatus(null);
      setMatchedMemberId(null);
      setMatchedBeneficiaryNumber(null);
      setEarlyRefill(null);
      setLocalHistory([]);
      setHistoryLoadFailed(false);
      setHistoryChecking(false);
      setSheetHistory([]);
      setFamilyMembers([]);

      void runVerificationSuite();
    }
  }, [open, request?.id, request?.patient_name, request?.policy_number, request?.beneficiary_number]);

  return {
    checking,
    verificationLoadFailed,
    nhisVerified,
    policyVerified,
    patientVerified,
    patientMatchStatus,
    matchedMemberId,
    matchedBeneficiaryNumber,
    earlyRefill,
    localHistory,
    historyLoadFailed,
    historyChecking,
    sheetHistory,
    familyMembers,
    runVerificationSuite,
    runHistoryLookup,
  };
}
