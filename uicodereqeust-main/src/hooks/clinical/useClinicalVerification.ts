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

  const runVerificationSuite = useCallback(async () => {
    setChecking(true);
    
    // Fire off Google Sheet History in parallel to avoid blocking the main DB checks
    const sheetPromise = fetchGoogleSheetHistory();

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
          const { data, error } = await (supabase as any)
            .rpc("resolve_nhis_family_members", { _policy: request.policy_number });
          if (error) throw error;
          matchedRows = data || [];
        }
        
        hasPolicyMatch = matchedRows.length > 0;

        if (!hasPolicyMatch && patientName) {
          const { data } = await supabase.from("nhis_beneficiaries")
            .select("*")
            .or(`full_name.ilike.%${patientName}%,surname.ilike.%${patientName}%,first_name.ilike.%${patientName}%`)
            .limit(50);
          matchedRows = data || [];
        }
        
        hasNameMatch = matchedRows.length > 0 && !hasPolicyMatch;
      }
      
      // 2. NHIS matching logic 
      let matchStatus: "exact" | "partial" | "none" = "none";
      let bestMatchMemberId: string | null = null;
      
      if (hasNameMatch || hasPolicyMatch) {
        const normalizedRequestedName = patientName.toLowerCase().replace(/\s+/g, " ").trim();
        const exactNameMatch = matchedRows.find((row) => {
          const rowName = String(row.full_name || `${row.surname || ""} ${row.first_name || ""}`)
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
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

      setMatchedMemberId(bestMatchMemberId);
      setPatientMatchStatus(matchStatus);
      setPolicyVerified(hasPolicyMatch);
      setNhisVerified(hasPolicyMatch || hasNameMatch);
      
      // 3. Fallback logic for patients table
      if (matchedRows.length > 0) {
        setPatientVerified(true);
        setFamilyMembers(matchedRows);
      } else if (request.policy_number) {
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
      } else {
         setPatientVerified(false);
         setFamilyMembers([]);
      }

      // 4. Local DB History 
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
      console.error("Verification error:", err);
    }

    // Wait for the background history fetch to complete
    await sheetPromise;
    setChecking(false);
  }, [request, fetchGoogleSheetHistory]);

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
