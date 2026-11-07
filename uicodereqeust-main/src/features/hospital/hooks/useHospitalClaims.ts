import { useQuery } from "@tanstack/react-query";
import { HospitalService } from "../services/hospitalService";
import { Hospital } from "../types";

export function useHospitalClaims({
  hospital,
  debouncedSearch,
  page,
  pageSize,
}: {
  hospital: Hospital | null;
  debouncedSearch: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["hospital-claims", hospital?.id, debouncedSearch, page, pageSize],
    queryFn: async () => {
      if (!hospital) {
        return {
          claims: [],
          total: 0,
          statsData: [],
          stats: { pending: 0, approved: 0, paid: 0, totalValue: 0 },
        };
      }
      return HospitalService.getHospitalClaims({
        hospital,
        searchTerm: debouncedSearch,
        page,
        pageSize,
      });
    },
    enabled: !!hospital,
  });
}
