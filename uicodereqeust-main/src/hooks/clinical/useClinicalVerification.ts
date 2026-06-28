import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadIbadanWorkbookHistory } from "@/lib/ibadanWorkbook";
import {
  normalizePolicyNumber,
  normalizePolicyRoot,
} from "@/lib/clinicalUtils";

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
  const [sheetHistory, setSheetHistory] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);

  const checkNHISList = useCallback(async () => {
    try {
      if (!request.policy_number && !request.patient_name) return;

      const policy = normalizePolicyNumber(request.policy_number);
      const patientName = String(request.patient_name || "").trim();

      let policyRows: any[] = [];
      if (policy) {
        const exactLookup = await supabase
          .from("nhis_beneficiaries")
          .select("*")
          .eq("policy_number", policy);
        if (exactLookup.error) throw exactLookup.error;
        policyRows = exactLookup.data || [];

        if (policyRows.length === 0) {
          const prefixLookup = await supabase
            .from("nhis_beneficiaries")
            .select("*")
            .ilike("policy_number", `${policy}%`);
          if (prefixLookup.error) throw prefixLookup.error;
          policyRows = prefixLookup.data || [];
        }
      }

      let nameRows: any[] = [];
      if (patientName && policyRows.length === 0) {
        const { data, error } = await supabase
          .from("nhis_beneficiaries")
          .select("*")
          .or(`full_name.ilike.%${patientName}%,surname.ilike.%${patientName}%,first_name.ilike.%${patientName}%`)
          .limit(50);
        if (error) throw error;
        nameRows = data || [];
      }

      const matchedRows = policyRows.length > 0 ? policyRows : nameRows;
      const hasPolicyMatch = policyRows.length > 0;
      const hasNameMatch = matchedRows.length > 0;

      let matchStatus: "exact" | "partial" | "none" = "none";
      let bestMatchMemberId: string | null = null;
      
      if (hasNameMatch || hasPolicyMatch) {
        const reqName = patientName.toLowerCase();
        const reqTokens = reqName.split(/[\s,]+/).filter(Boolean);
        let bestMatch = 0;

        for (const row of matchedRows) {
          const rowName = String(row.full_name || `${row.surname || ""} ${row.first_name || ""}`).toLowerCase();
          const rowTokens = rowName.split(/[\s,]+/).filter(Boolean);

          let matches = 0;
          for (const token of reqTokens) {
            if (rowTokens.some(rt => rt === token || rt.includes(token) || token.includes(rt))) {
              matches++;
            }
          }
          if (matches > bestMatch) {
            bestMatch = matches;
            bestMatchMemberId = row.id;
          }
        }

        if (bestMatch >= Math.max(2, reqTokens.length) || (bestMatch > 0 && reqTokens.length === 1)) {
          matchStatus = "exact";
        } else if (bestMatch > 0) {
          matchStatus = "partial";
        } else {
          matchStatus = "none";
          bestMatchMemberId = null;
        }
      }

      setMatchedMemberId(bestMatchMemberId);
      setPatientMatchStatus(matchStatus);
      setPolicyVerified(hasPolicyMatch);
      setNhisVerified(hasPolicyMatch || hasNameMatch);
      setPatientVerified(hasPolicyMatch || hasNameMatch);
      setFamilyMembers(matchedRows);
    } catch (err) {
      console.error("NHIS verify error:", err);
    }
  }, [request]);

  const fetchGoogleSheetHistory = useCallback(async () => {
    try {
      if (!request.policy_number) {
        setSheetHistory([]);
        return;
      }

      const policy = normalizePolicyNumber(request.policy_number);
      const workbookHistory = await loadIbadanWorkbookHistory(policy);
      const filteredHistory = workbookHistory
        .filter((record: any) => {
          const recordPolicy = normalizePolicyNumber(record.policy_number);
          const recordRoot = normalizePolicyRoot(recordPolicy);
          const policyRoot = normalizePolicyRoot(policy);
          const policyMatch = !!policy && (
            recordPolicy === policy ||
            (recordRoot && policyRoot && recordRoot === policyRoot) ||
            recordPolicy.startsWith(policy) ||
            policy.startsWith(recordPolicy)
          );
          return policyMatch;
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
        setSheetHistory(filteredHistory);
        return;
      }
      setSheetHistory([]);
    } catch (err) {
      console.error("Workbook history error:", err);
    }
  }, [request]);

  const runLocalDBChecks = useCallback(async () => {
    try {
      const policy = normalizePolicyNumber(request.policy_number);

      if (policy || request.patient_name) {
        let policyRows: any[] = [];
        if (policy) {
          const exactLookup = await supabase
            .from("nhis_beneficiaries")
            .select("*")
            .eq("policy_number", policy);
          if (exactLookup.error) throw exactLookup.error;
          policyRows = exactLookup.data || [];

          if (policyRows.length === 0) {
            const prefixLookup = await supabase
              .from("nhis_beneficiaries")
              .select("*")
              .ilike("policy_number", `${policy}%`);
            if (prefixLookup.error) throw prefixLookup.error;
            policyRows = prefixLookup.data || [];
          }
        }

        const hasPolicyMatch = (policyRows || []).length > 0;
        let matchedBeneficiaries = policyRows || [];

        if (!hasPolicyMatch && request.patient_name) {
          const { data: nameRows } = await supabase
            .from("nhis_beneficiaries")
            .select("*")
            .or(`full_name.ilike.%${request.patient_name}%,surname.ilike.%${request.patient_name}%,first_name.ilike.%${request.patient_name}%`)
            .limit(50);
          matchedBeneficiaries = nameRows || [];
        }

        if (matchedBeneficiaries.length > 0) {
          setPatientVerified(true);
          setFamilyMembers(matchedBeneficiaries);
        } else if (request.policy_number) {
          const { data: patients } = await supabase
            .from("patients")
            .select("*")
            .eq("policy_number", request.policy_number);

          if (patients && patients.length > 0) {
            setPatientVerified(true);
            setFamilyMembers(patients);
            const principal = patients.find((p: any) => p.role === "PRINCIPAL") || patients[0];
            if (principal.expiry_date && new Date(principal.expiry_date) < new Date()) {
              setPatientVerified(false);
            }
          } else {
            setPatientVerified(false);
          }
        }
      }

      // Local DB history
      if (request.policy_number) {
        const { data: history } = await supabase
          .from("authorization_requests")
          .select("*")
          .eq("policy_number", request.policy_number)
          .eq("status", "approved")
          .neq("source", "sheet_history")
          .order("decided_at", { ascending: false })
          .limit(5);
        if (history) setLocalHistory(history);

        // 30-day refill check from local DB
        if (history && history.length > 0) {
          const latest = history[0];
          if (latest.decided_at) {
            const daysSince = Math.floor((Date.now() - new Date(latest.decided_at).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince < 30) {
              setEarlyRefill({ isEarly: true, daysSince, lastDate: latest.decided_at });
            } else {
              setEarlyRefill(null);
            }
          }
        } else {
          setEarlyRefill(null);
        }
      }
    } catch (err) {
      console.error("Local DB check error:", err);
    }
  }, [request]);

  const runVerificationSuite = useCallback(async () => {
    setChecking(true);
    await Promise.all([
      checkNHISList(),
      runLocalDBChecks(),
      fetchGoogleSheetHistory(),
    ]);
    setChecking(false);
  }, [request, checkNHISList, runLocalDBChecks, fetchGoogleSheetHistory]);

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
