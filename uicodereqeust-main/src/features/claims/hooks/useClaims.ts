import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClaimsService } from "../services/claimsService";

export function useClaimsQuery({
  selectedHospitalId,
  statusTab,
  debouncedSearchTerm,
  page,
  pageSize,
}: {
  selectedHospitalId: string;
  statusTab: string;
  debouncedSearchTerm: string;
  page: number;
  pageSize: number;
}) {
  return useQuery({
    queryKey: ["claims", selectedHospitalId, statusTab, debouncedSearchTerm, page, pageSize],
    queryFn: async () => {
      return ClaimsService.getClaimsList({
        hospitalId: selectedHospitalId,
        statusTab,
        searchTerm: debouncedSearchTerm,
        page,
        pageSize,
      });
    },
  });
}

export function useHospitalsQuery() {
  return useQuery({
    queryKey: ["hospitals-list"],
    queryFn: async () => {
      return ClaimsService.getHospitalsList();
    },
  });
}

export function useVerifyClaimQuery(selectedClaim: any) {
  return useQuery({
    queryKey: ["verify-claim", selectedClaim?.auth_code],
    queryFn: async () => {
      if (!selectedClaim?.auth_code) return null;
      return ClaimsService.verifyClaimAuthorization(selectedClaim.auth_code);
    },
    enabled: !!selectedClaim,
  });
}

export function useUpdateClaimMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ claimId, updateData }: { claimId: string; updateData: any }) => {
      return ClaimsService.updateClaimStatus(claimId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
    },
  });
}
