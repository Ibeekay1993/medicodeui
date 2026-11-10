import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizeBeneficiaryNumber,
  normalizePolicyNumber,
  normalizePolicyRoot,
  recordMatchesPolicy,
  resolveBeneficiaryIdentityMatch,
} from "@/lib/clinicalUtils";

function withTimeout<T>(promise: PromiseLike<T>, ms: number = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms)
    ),
  ]);
}

function withAbortTimeout<T>(request: (signal: AbortSignal) => PromiseLike<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(request(controller.signal)),
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error(`Timeout of ${ms}ms exceeded`));
      }, ms);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
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
  const [patientMatchStatus, setPatientMatchStatus] = useState<"exact" | "partial" | "none" | "ambiguous" | "conflict" | null>(null);
  const [matchedMemberId, setMatchedMemberId] = useState<string | null>(null);
  const [matchedBeneficiaryNumber, setMatchedBeneficiaryNumber] = useState<string | null>(null);
  const [earlyRefill, setEarlyRefill] = useState<{ isEarly: boolean; daysSince: number; lastDate: string } | null>(null);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);
  const [historyChecking, setHistoryChecking] = useState(false);
  const historyLookupGenerationRef = useRef(0);
  // Kept for backward compatibility; all records now load from localHistory (single source of truth)
  const [sheetHistory, setSheetHistory] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);

  const runHistoryLookup = useCallback(async () => {
    const generation = ++historyLookupGenerationRef.current;
    const policy = normalizePolicyNumber(request?.policy_number);
    const patientName = String(request?.patient_name || "").trim();
    const policyRoot = normalizePolicyRoot(policy);
    const beneficiaryNum = normalizeBeneficiaryNumber(request?.beneficiary_number);

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
      let rpcUnavailable = !policy && !beneficiaryNum;
      if (!rpcUnavailable) {
        const { data: rpcData, error: rpcError } = await withAbortTimeout<{ data: any; error: any }>(
          (signal) => (supabase as any).rpc("get_patient_authorization_history", {
            p_policy_number: policy || null,
            p_policy_root: policyRoot || null,
            p_beneficiary_number: beneficiaryNum || null,
            p_limit: 100,
          }).abortSignal(signal),
          8000,
        );
        if (rpcError) {
          // Only fall back when the RPC is not installed. A timeout/network error
          // must not launch another history query while the original is still running.
          rpcUnavailable = rpcError.code === "PGRST202" || rpcError.code === "42883";
          if (!rpcUnavailable) throw rpcError;
        } else if (Array.isArray(rpcData)) {
          history = rpcData;
          rpcSucceeded = true;
        }
      }
      // ── Step 2: Fallback direct query (if RPC not available) ──
      // IMPORTANT: DO NOT add .order("created_at") in the SQL query!
      // On Postgres, ORDER BY created_at with LIMIT forces a full sequential scan
      // over 75k+ rows on Nano compute, triggering statement timeouts.
      // We query by indexed policy/beneficiary filters and sort in JavaScript memory instead.
      if (!rpcSucceeded && rpcUnavailable && (policy || beneficiaryNum)) {
        const conditions = new Set<string>();
        if (policyRoot) {
          conditions.add("policy_number.eq." + policyRoot);
          conditions.add("policy_number.like." + policyRoot + "-%");
        }
        if (policy !== policyRoot) conditions.add("policy_number.eq." + policy);
        if (beneficiaryNum) conditions.add("beneficiary_number.eq." + beneficiaryNum);

        const { data, error } = await withAbortTimeout(
          (signal) => supabase
            .from("authorization_requests")
            .select("id, request_id, patient_name, policy_number, beneficiary_number, diagnosis, treatment, approved_items, hospital_name, status, authorization_code, decision_reason, clinical_notes, decided_at, created_at, source, is_historical")
            .or([...conditions].join(","))
            .limit(100)
            .abortSignal(signal),
          12000,
        );
        if (error) throw error;
        history = data || [];
      }

      // Sort newest first in memory (instant, 0ms CPU overhead)
      history.sort((a, b) => {
        const tA = Date.parse(a.decided_at || a.created_at || "") || 0;
        const tB = Date.parse(b.decided_at || b.created_at || "") || 0;
        return tB - tA;
      });

      const matchingHistory = history.filter((record: any) => {
        if (policy) return recordMatchesPolicy(record, policy);
        if (beneficiaryNum && normalizeBeneficiaryNumber(record?.beneficiary_number) === beneficiaryNum) return true;
        return false;
      }).map((record: any) => ({
        ...record,
        date: record.date || record.decided_at || record.created_at,
      }));

      if (generation !== historyLookupGenerationRef.current) return;

      setLocalHistory(matchingHistory);

      const latestDecision = matchingHistory.find((record) => record.decided_at);
      if (latestDecision?.decided_at) {
        const daysSince = Math.floor((Date.now() - new Date(latestDecision.decided_at).getTime()) / (1000 * 60 * 60 * 24));
        setEarlyRefill(daysSince < 30 ? { isEarly: true, daysSince, lastDate: latestDecision.decided_at } : null);
      } else {
        setEarlyRefill(null);
      }
    } catch (historyErr) {
      if (generation !== historyLookupGenerationRef.current) return;
      console.warn("History query warning:", historyErr);
      setHistoryLoadFailed(true);
      setLocalHistory([]);
      setEarlyRefill(null);
    } finally {
      if (generation === historyLookupGenerationRef.current) setHistoryChecking(false);
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
      let policyRows: any[] = [];
      if (policy) {
        const conditions = new Set<string>();
        conditions.add(`policy_number.eq.${policy}`);
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
        policyRows = data || [];
      }
      const hasPolicyMatch = policyRows.length > 0;
      let fallbackRows: any[] = [];
      if (!hasPolicyMatch && policy) {
        const { data: patients, error } = await withTimeout(
          supabase.from("patients").select("id,policy_number,surname,first_name,role,expiry_date").eq("policy_number", policy),
          4000,
        );
        if (error) throw error;
        fallbackRows = patients || [];
      }

      const candidateRows = hasPolicyMatch ? policyRows : fallbackRows;
      const identityMatch = resolveBeneficiaryIdentityMatch(
        candidateRows,
        patientName,
        request?.beneficiary_number,
      );
      let bestMatchMemberId: string | null = null;
      let bestMatchBeneficiaryNumber: string | null = null;
      if (identityMatch.status === "exact" && identityMatch.member) {
        bestMatchMemberId = identityMatch.member.id || null;
        bestMatchBeneficiaryNumber = String(identityMatch.member.beneficiary_number || "").trim() || null;
      }

      setMatchedMemberId(bestMatchMemberId);
      setMatchedBeneficiaryNumber(bestMatchBeneficiaryNumber);
      setPatientMatchStatus(identityMatch.status);
      setPolicyVerified(hasPolicyMatch);
      setNhisVerified(hasPolicyMatch);

      // Only policy-scoped NHIS rows can be presented as this policy's family.
      // Broad name searches across policies are intentionally not used for identity.
      setPatientVerified(identityMatch.status === "exact");
      setFamilyMembers(hasPolicyMatch ? policyRows : fallbackRows);
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
