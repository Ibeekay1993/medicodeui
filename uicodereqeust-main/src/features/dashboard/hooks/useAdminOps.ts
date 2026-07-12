import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminOpsService } from "../services/adminOpsService";
import { useToast } from "@/hooks/use-toast";

export function useImportHistoricalCodes() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: Record<string, unknown>[]) => AdminOpsService.importHistoricalCodes(data),
    onSuccess: () => toast({ title: "Success", description: "Historical codes imported successfully." }),
    onError: (err: Error) => toast({ variant: "destructive", title: "Error", description: err.message }),
  });
}


export function useAuditLogs() {
  return useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => AdminOpsService.getAuditLogs(),
  });
}
