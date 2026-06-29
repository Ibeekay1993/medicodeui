import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminOpsService } from "../services/adminOpsService";
import { useToast } from "@/hooks/use-toast";

export function useImportHistoricalCodes() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: any[]) => AdminOpsService.importHistoricalCodes(data),
    onSuccess: () => toast({ title: "Success", description: "Historical codes imported successfully." }),
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useUpdateNhisBeneficiaries() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: any[]) => AdminOpsService.updateNhisBeneficiaries(data),
    onSuccess: () => toast({ title: "Success", description: "NHIS beneficiaries updated successfully." }),
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => AdminOpsService.getAuditLogs(),
  });
}
