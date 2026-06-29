import { useQuery } from "@tanstack/react-query";
import { ClaimsService } from "../services/claimsService";

export function useClaimsAnalysisQuery() {
  return useQuery({
    queryKey: ["claims-analysis"],
    queryFn: async () => {
      const claims = await ClaimsService.getClaimsAnalysisData();
      return claims;
    },
    // Cache for 5 minutes since this is heavy and across all claims
    staleTime: 5 * 60 * 1000, 
  });
}
