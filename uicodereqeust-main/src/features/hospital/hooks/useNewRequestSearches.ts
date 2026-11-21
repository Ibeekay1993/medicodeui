import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { safeIlikePattern } from "@/lib/postgrestFilter";
import { BRAND_TO_GENERIC, DIAGNOSES } from "@/lib/new-request-helpers";

interface UseNewRequestSearchesProps {
  patientSearch: string;
  diagnosisSearch: string;
  treatSearch: string;
}

export function useNewRequestSearches({
  patientSearch,
  diagnosisSearch,
  treatSearch,
}: UseNewRequestSearchesProps) {
  // Patient search
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);

  const debouncedPatientSearch = useDebounce(patientSearch, 300);
  const { data: patientData, isFetching: isPatientFetching } = useQuery({
    queryKey: ["patientSearch", debouncedPatientSearch],
    queryFn: async () => {
      const term = debouncedPatientSearch.trim();
      if (term.length < 3) return [];
      const { data, error } = await supabase.rpc("search_nhis_beneficiaries" as any, {
        p_query: term,
      });
      if (error) {
        console.error("search_nhis_beneficiaries error:", error);
        return [];
      }
      return data || [];
    },
    enabled: debouncedPatientSearch.trim().length >= 3,
  });

  useEffect(() => {
    if (debouncedPatientSearch.length < 3) {
      setPatientResults([]);
      setPatientOpen(false);
    } else {
      setPatientResults(patientData || []);
      setPatientOpen((patientData || []).length > 0);
    }
  }, [patientData, debouncedPatientSearch]);

  useEffect(() => {
    setPatientLoading(isPatientFetching);
  }, [isPatientFetching]);

  // Diagnosis suggestions
  const [diagSuggestions, setDiagSuggestions] = useState<string[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);

  const debouncedDiagSearch = useDebounce(diagnosisSearch, 200);
  useEffect(() => {
    const q = debouncedDiagSearch.trim();
    if (q.length < 2) {
      setDiagSuggestions([]);
      setDiagOpen(false);
      return;
    }
    const matches = DIAGNOSES.filter((d) => d.toLowerCase().includes(q.toLowerCase()));
    setDiagSuggestions(matches.slice(0, 10));
    setDiagOpen(matches.length > 0);
  }, [debouncedDiagSearch]);

  // Treatment search
  const [treatResults, setTreatResults] = useState<any[]>([]);
  const [treatLoading, setTreatLoading] = useState(false);
  const [treatOpen, setTreatOpen] = useState(false);

  const debouncedTreatSearch = useDebounce(treatSearch, 300);
  const { data: treatData, isFetching: isTreatFetching } = useQuery({
    queryKey: ["treatSearch", debouncedTreatSearch],
    queryFn: async () => {
      const q = debouncedTreatSearch.toLowerCase().trim();
      if (q.length < 3) return [];
      const brand = Object.keys(BRAND_TO_GENERIC).find((b) => q.includes(b));
      const term = brand ? BRAND_TO_GENERIC[brand] : debouncedTreatSearch;

      const { data } = await supabase
        .from("nhia_items" as any)
        .select("code,name,amount,category,subcategory")
        .or(
          `name.ilike.${safeIlikePattern(term)},code.ilike.${safeIlikePattern(term)},subcategory.ilike.${safeIlikePattern(term)}`
        )
        .eq("is_active", true)
        .limit(100);
      return data || [];
    },
    enabled: debouncedTreatSearch.length >= 3,
  });

  useEffect(() => {
    if (debouncedTreatSearch.length < 3) {
      setTreatResults([]);
      setTreatOpen(false);
    } else {
      setTreatResults(treatData || []);
      setTreatOpen((treatData || []).length > 0);
    }
  }, [treatData, debouncedTreatSearch]);

  useEffect(() => {
    setTreatLoading(isTreatFetching);
  }, [isTreatFetching]);

  return {
    patientResults,
    patientLoading,
    patientOpen,
    setPatientOpen,
    diagSuggestions,
    diagOpen,
    setDiagOpen,
    setDiagSuggestions,
    treatResults,
    treatLoading,
    treatOpen,
    setTreatOpen,
  };
}
