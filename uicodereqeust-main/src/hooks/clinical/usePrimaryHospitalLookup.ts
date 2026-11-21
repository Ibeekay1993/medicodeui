import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PrimaryHospitalInfo {
  hcp_name: string;
  hcp_code: string;
}

export function usePrimaryHospitalLookup(open: boolean, policyNumber: string | undefined | null) {
  const [primaryHospital, setPrimaryHospital] = useState<PrimaryHospitalInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cleanPolicy = policyNumber?.trim();
    if (!open || !cleanPolicy) {
      setPrimaryHospital(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const root = cleanPolicy.includes("-") ? cleanPolicy.split("-")[0] : cleanPolicy;
    const conds = [`policy_number.eq.${cleanPolicy}`];
    if (root && root !== cleanPolicy) {
      conds.push(`policy_number.eq.${root}`);
      conds.push(`policy_number.ilike.${root}-%`);
    }

    supabase
      .from("nhis_beneficiaries")
      .select("id, hcp_name, hcp_code, member_type, policy_number, beneficiary_number")
      .or(conds.join(","))
      .limit(20)
      .then(async ({ data, error }) => {
        if (error) {
          console.error("Primary hospital family lookup error:", error);
          if (!cancelled) {
            setPrimaryHospital(null);
            setLoading(false);
          }
          return;
        }

        const principal = (data || []).find((member) =>
          ["PRINCIPAL", "MEMBER"].includes(String(member.member_type || "").toUpperCase())
        );

        if (!cancelled) {
          let hcp_name = principal?.hcp_name || "";
          const hcp_code = principal?.hcp_code || "";

          if (hcp_code) {
            const { data: hospData } = await supabase
              .from("hospitals")
              .select("name")
              .eq("code", hcp_code)
              .maybeSingle();

            if (hospData?.name) {
              hcp_name = hospData.name;
            }
          }

          setPrimaryHospital(principal ? { hcp_name, hcp_code } : null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, policyNumber]);

  return { primaryHospital, loading };
}
