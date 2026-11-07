import { useQuery } from "@tanstack/react-query";
import { HospitalService } from "../services/hospitalService";
import { Hospital } from "../types";

export function useHospitalAuthorizations({
  hospital,
  statusFilter,
  debouncedSearch,
  scope = "originated",
  page,
  pageSize,
}: {
  hospital: Hospital | null;
  statusFilter: string;
  debouncedSearch: string;
  scope?: "originated" | "inbound_referral" | "all";
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["hospital-authorizations", hospital?.id, statusFilter, debouncedSearch, scope, page, pageSize],
    queryFn: async () => {
      if (!hospital) return { requests: [], total: 0, claimStatusMap: new Map<string, string>() };
      return HospitalService.getHospitalAuthorizations({
        hospital,
        statusFilter,
        searchTerm: debouncedSearch,
        scope,
        page,
        pageSize,
      });
    },
    enabled: !!hospital,
  });
}
