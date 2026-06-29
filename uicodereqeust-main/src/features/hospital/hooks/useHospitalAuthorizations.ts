import { useQuery } from "@tanstack/react-query";
import { HospitalService } from "../services/hospitalService";
import { Hospital } from "../types";

export function useHospitalAuthorizations({
  hospital,
  statusFilter,
  debouncedSearch,
  page,
  pageSize,
}: {
  hospital: Hospital | null;
  statusFilter: string;
  debouncedSearch: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["hospital-authorizations", hospital?.id, statusFilter, debouncedSearch, page, pageSize],
    queryFn: async () => {
      if (!hospital) return { requests: [], total: 0, claimStatusMap: new Map<string, string>() };
      return HospitalService.getHospitalAuthorizations({
        hospital,
        statusFilter,
        searchTerm: debouncedSearch,
        page,
        pageSize,
      });
    },
    enabled: !!hospital,
  });
}
