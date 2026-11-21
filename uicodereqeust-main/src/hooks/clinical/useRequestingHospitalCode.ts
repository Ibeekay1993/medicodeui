import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { areHospitalNamesMatching } from "@/lib/authorizations-helpers";

interface UseRequestingHospitalCodeProps {
  open: boolean;
  request: any;
  primaryHospitalHcpCode?: string | null;
  primaryHospitalHcpName?: string | null;
}

/**
 * Resolves the HCP code for the requesting hospital.
 * Priority:
 *   1. Look up by hospital ID in the hospitals table.
 *   2. Match against the patient's registered primary hospital HCP code.
 *   3. Fuzzy name match against the hospitals table.
 */
export function useRequestingHospitalCode({
  open,
  request,
  primaryHospitalHcpCode,
  primaryHospitalHcpName,
}: UseRequestingHospitalCodeProps): string | null {
  const [requestingHospitalCode, setRequestingHospitalCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !request) {
      setRequestingHospitalCode(null);
      return;
    }
    let cancelled = false;

    const fetchHcpCode = async () => {
      // 1. Try to look up by hospital ID
      const hospitalId = request.requesting_hospital_id || request.hospital_id;
      if (hospitalId) {
        const { data } = await supabase
          .from("hospitals")
          .select("code")
          .eq("id", hospitalId)
          .maybeSingle();
        if (!cancelled && data?.code) {
          setRequestingHospitalCode(data.code);
          return;
        }
      }

      const hospitalName = request.hospital_name || request.requesting_hospital_name;

      // 2. If the requesting hospital matches the patient's registered primary hospital, link the HCP code directly
      if (primaryHospitalHcpCode && areHospitalNamesMatching(hospitalName, primaryHospitalHcpName)) {
        if (!cancelled) {
          setRequestingHospitalCode(primaryHospitalHcpCode);
          return;
        }
      }

      // 3. Fuzzy name match against the hospitals table
      if (hospitalName) {
        const { data } = await supabase.from("hospitals").select("code, name").limit(100);
        if (!cancelled && data && data.length > 0) {
          const match = data.find((h: any) => areHospitalNamesMatching(h.name, hospitalName));
          if (match?.code) {
            setRequestingHospitalCode(match.code);
            return;
          }
        }
      }
    };

    fetchHcpCode();
    return () => {
      cancelled = true;
    };
  }, [open, request, primaryHospitalHcpCode, primaryHospitalHcpName]);

  return requestingHospitalCode;
}
