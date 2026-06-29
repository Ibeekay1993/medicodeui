import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PaymentsService } from "../services/paymentsService";

export function useAwaitingPaymentClaims() {
  return useQuery({
    queryKey: ["awaiting-payment-claims"],
    queryFn: PaymentsService.getAwaitingPaymentClaims,
  });
}

export function usePaymentBatches() {
  return useQuery({
    queryKey: ["payment-batches"],
    queryFn: PaymentsService.getPaymentBatches,
  });
}

export function useBatchDetails(batchId: string | null) {
  return useQuery({
    queryKey: ["batch-details", batchId],
    queryFn: () => PaymentsService.getBatchDetails(batchId!),
    enabled: !!batchId,
  });
}

export function useBatchClaims(batchId: string | null) {
  return useQuery({
    queryKey: ["batch-claims", batchId],
    queryFn: () => PaymentsService.getBatchClaims(batchId!),
    enabled: !!batchId,
  });
}

export function usePaidClaims() {
  return useQuery({
    queryKey: ["paid-claims"],
    queryFn: PaymentsService.getPaidClaims,
  });
}

export function useFinanceReports() {
  return useQuery({
    queryKey: ["finance-reports"],
    queryFn: PaymentsService.getFinanceReports,
  });
}

export function useCreatePaymentBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: PaymentsService.createPaymentBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["awaiting-payment-claims"] });
      queryClient.invalidateQueries({ queryKey: ["payment-batches"] });
      queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}

export function useUpdatePaymentBatchStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      batchId,
      status,
      evidenceFile,
      paidAt,
    }: {
      batchId: string;
      status: string;
      evidenceFile?: File;
      paidAt?: string;
    }) => {
      let evidenceUrl = null;

      if (evidenceFile) {
        evidenceUrl = await PaymentsService.uploadBatchEvidence(batchId, evidenceFile);
      }

      const updatePayload: any = { status };
      if (evidenceUrl) updatePayload.evidence_url = evidenceUrl;
      if (paidAt) updatePayload.paid_at = paidAt;

      await PaymentsService.updateBatchStatus(batchId, updatePayload);

      if (status === "paid") {
        await PaymentsService.updateClaimsPaymentStatusByBatch(batchId, "paid");
      } else if (status === "rejected") {
        await PaymentsService.unlinkClaimsFromBatch(batchId);
      }

      return batchId;
    },
    onSuccess: (_, { batchId }) => {
      queryClient.invalidateQueries({ queryKey: ["payment-batches"] });
      queryClient.invalidateQueries({ queryKey: ["batch-details", batchId] });
      queryClient.invalidateQueries({ queryKey: ["batch-claims", batchId] });
      queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
      queryClient.invalidateQueries({ queryKey: ["awaiting-payment-claims"] });
      queryClient.invalidateQueries({ queryKey: ["paid-claims"] });
    },
  });
}

export function useDeletePaymentBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (batchId: string) => {
      await PaymentsService.unlinkClaimsFromBatch(batchId);
      await PaymentsService.deletePaymentBatch(batchId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-batches"] });
      queryClient.invalidateQueries({ queryKey: ["awaiting-payment-claims"] });
      queryClient.invalidateQueries({ queryKey: ["finance-reports"] });
    },
  });
}
