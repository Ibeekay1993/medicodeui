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
  const [nhisVerified, setNhisVerified] = useState<boolean | null>(null);
  const [policyVerified, setPolicyVerified] = useState<boolean | null>(null);
  const [patientVerified, setPatientVerified] = useState<boolean | null>(null);
  const [patientMatchStatus, setPatientMatchStatus] = useState<"exact" | "partial" | "none" | null>(null);
  const [matchedMemberId, setMatchedMemberId] = useState<string | null>(null);
  const [earlyRefill, setEarlyRefill] = useState<{ isEarly: boolean; daysSince: number; lastDate: string } | null>(null);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  // Kept for backward compatibility; all records now load from localHistory (single source of truth)
  const [sheetHistory, setSheetHistory] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);

  const runVerificationSuite = useCallback(async () => {
    setChecking(true);

    // 0. Ensure session is present
    try {
      await withTimeout(supabase.auth.getSession(), 2000);
    } catch {
      // Continue even if session check times out
    }

    const policy = normalizePolicyNumber(request?.policy_number);
    const patientName = String(request?.patient_name || "").trim();
    const policyRoot = normalizePolicyRoot(policy);

    // 1. Unified history query from authorization_requests (Fast index-backed query)
    try {
      if (policy || patientName) {
        let history: any[] = [];

        // Primary: Query by policy first (uses B-tree index on policy_number)
        if (policy) {
          const conditions = [`policy_number.eq.${policy}`];
          if (policyRoot && policyRoot !== policy) {
            conditions.push(`policy_number.eq.${policyRoot}`);
            conditions.push(`policy_number.ilike.${policyRoot}-%`);
          }
          const { data, error } = await withTimeout(
            supabase
              .from("authorization_requests")
              .select("id, request_id, patient_name, policy_number, diagnosis, treatment, hospital_name, status, authorization_code, decision_reason, clinical_notes, decided_at, created_at, source, is_historical")
              .or(conditions.join(","))
              .order("created_at", { ascending: false })
              .limit(50),
            4000
          );
          if (!error && data) {
            history = data;
          }
        }

        // Secondary fallback: only query by patient name prefix if policy query gave 0 results
        if (history.length === 0 && patientName && patientName.trim().length >= 3) {
          const cleanName = cleanPatientName(patientName);
          const firstWord = cleanName.split(/\s+/)[0];
          if (firstWord && firstWord.length >= 3) {
            const { data } = await withTimeout(
              supabase
                .from("authorization_requests")
                .select("id, request_id, patient_name, policy_number, diagnosis, treatment, hospital_name, status, authorization_code, decision_reason, clinical_notes, decided_at, created_at, source, is_historical")
                .ilike("patient_name", `${firstWord}%`)
                .order("created_at", { ascending: false })
                .limit(50),
              4000
            );
            if (data) history = data;
          }
        }

        if (history.length > 0) {
          const matchingHistory = history
            .filter((record: any) => {
              if (policy && recordMatchesPolicy(record, policy)) return true;
              if (patientName && record?.patient_name) {
                const rName = normalizePatientNameForMatch(record.patient_name);
                const pName = normalizePatientNameForMatch(patientName);
                if (rName && pName && (rName === pName || rName.includes(pName) || pName.includes(rName))) return true;
              }
              return false;
            })
            .map((record: any) => ({
              ...record,
              date: record.date || record.decided_at || record.created_at,
            }));
          setLocalHistory(matchingHistory);

          if (matchingHistory.length > 0) {
            const latest = matchingHistory[0];
            if (latest.decided_at) {
              const daysSince = Math.floor((Date.now() - new Date(latest.decided_at).getTime()) / (1000 * 60 * 60 * 24));
              setEarlyRefill(daysSince < 30 ? { isEarly: true, daysSince, lastDate: latest.decided_at } : null);
            }
          } else {
            setEarlyRefill(null);
          }
        } else {
          setLocalHistory([]);
          setEarlyRefill(null);
        }
      }
    } catch (historyErr) {
      console.warn("History query warning:", historyErr);
      setLocalHistory([]);
    }

    // 2. NHIS family & policy resolution (Indexed lookups, NO unindexed RPC calls)
    try {
      let matchedRows: any[] = [];
      if (policy) {
        try {
          const conditions = [`policy_number.eq.${policy}`];
          if (policyRoot && policyRoot !== policy) {
            conditions.push(`policy_number.eq.${policyRoot}`);
            conditions.push(`policy_number.ilike.${policyRoot}-%`);
          }
          const { data, error } = await withTimeout(
            supabase
              .from("nhis_beneficiaries")
              .select("id,full_name,surname,first_name,hcp_name,hcp_code,member_type,policy_number")
              .or(conditions.join(","))
              .limit(50),
            4000
          );
          if (!error && data) {
            matchedRows = data;
          }
        } catch (err) {
          console.warn("Direct NHIS lookup caught:", err);
        }
      }
      const hasPolicyMatch = matchedRows.length > 0;

      // Name fallback — only runs if policy didn't match
      if (!hasPolicyMatch && patientName) {
        try {
          const { data } = await withTimeout(
            supabase
              .from("nhis_beneficiaries")
              .select("id,full_name,surname,first_name,hcp_name,hcp_code,member_type,policy_number")
              .ilike("full_name", `${patientName}%`)
              .limit(30),
            4000
          );
          matchedRows = data || [];
        } catch (err) {
          console.warn("NHIS beneficiary name lookup warning:", err);
        }
      }

      const hasNameMatch = matchedRows.length > 0 && !hasPolicyMatch;

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
        }
      }

      setMatchedMemberId(bestMatchMemberId);
      setPatientMatchStatus(matchStatus);
      setPolicyVerified(hasPolicyMatch);
      setNhisVerified(hasPolicyMatch || hasNameMatch);

      // Fallback to patients table if no NHIS match
      if (matchedRows.length > 0) {
        setPatientVerified(true);
        setFamilyMembers(matchedRows);
      } else if (request?.policy_number) {
        try {
          const { data: patients } = await supabase.from("patients").select("*").eq("policy_number", request.policy_number);
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
        } catch {
          setPatientVerified(false);
          setFamilyMembers([]);
        }
      } else {
        setPatientVerified(false);
        setFamilyMembers([]);
      }
    } catch (nhisErr) {
      console.warn("NHIS verification warning:", nhisErr);
      setNhisVerified(false);
      setPolicyVerified(false);
      setPatientVerified(false);
      setFamilyMembers([]);
    } finally {
      setChecking(false);
    }
  }, [request]);

  useEffect(() => {
    if (open && request) {
      setNhisVerified(null);
      setPolicyVerified(null);
      setPatientVerified(null);
      setPatientMatchStatus(null);
      setMatchedMemberId(null);
      setEarlyRefill(null);
      setLocalHistory([]);
      setSheetHistory([]);
      setFamilyMembers([]);

      void runVerificationSuite();
    }
  }, [open, request?.id]);

  return {
    checking,
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
