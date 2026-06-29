import { supabase } from "@/integrations/supabase/client";
import { PaymentBatch, AwaitingPaymentClaim, PaidClaim } from "../types";

export class PaymentsService {
  static async getAwaitingPaymentClaims(): Promise<AwaitingPaymentClaim[]> {
    const { data, error } = await supabase
      .from("hospital_claims" as any)
      .select(`
        id,
        claim_number,
        patient_name,
        policy_number,
        hospital_name,
        hospital_id,
        total_amount,
        approved_amount,
        approved_at,
        created_at,
        status,
        payment_status,
        contest_deadline
      `)
      .in("status", ["approved", "partially_approved"])
      .is("payment_batch_id", null)
      .order("approved_at", { ascending: true });

    if (error) throw error;
    return (data as any[]) || [];
  }

  static async getPaymentBatches(): Promise<PaymentBatch[]> {
    const { data, error } = await (supabase as any)
      .from("payment_batches")
      .select(`
        *,
        hospitals:provider_id(name)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data as any[]) || [];
  }

  static async getBatchDetails(batchId: string): Promise<PaymentBatch> {
    const { data, error } = await supabase
      .from("payment_batches" as any)
      .select(`
        *,
        hospitals:provider_id(name)
      `)
      .eq("id", batchId)
      .single();

    if (error) throw error;
    return data as any;
  }

  static async getBatchClaims(batchId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("hospital_claims" as any)
      .select("id, claim_number, patient_name, policy_number, total_amount, approved_amount, approved_at, status")
      .eq("payment_batch_id", batchId)
      .order("claim_number", { ascending: true });

    if (error) throw error;
    return (data as any[]) || [];
  }

  static async generateBatchReference(): Promise<string> {
    const { data, error } = await (supabase as any).rpc("generate_batch_reference");
    if (error) throw error;
    return data;
  }

  static async createPaymentBatch({
    batchRef,
    hospitalId,
    monthCode,
    totalClaims,
    totalAmount,
    userId,
    claimIds,
  }: {
    batchRef: string;
    hospitalId: string;
    monthCode: string;
    totalClaims: number;
    totalAmount: number;
    userId: string;
    claimIds: string[];
  }): Promise<string> {
    const { data: batchId, error: createError } = await (supabase as any).rpc(
      "create_payment_batch_transactional",
      {
        p_batch_reference: batchRef,
        p_provider_id: hospitalId,
        p_month: monthCode,
        p_total_claims: totalClaims,
        p_total_amount: totalAmount,
        p_created_by: userId,
        p_claim_ids: claimIds,
      }
    );

    if (createError) throw createError;
    return batchId;
  }

  static async uploadBatchEvidence(batchId: string, file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const filePath = `${batchId}-${Math.random()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from("payment_evidence")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from("payment_evidence")
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }

  static async updateBatchStatus(batchId: string, payload: any) {
    const { error } = await (supabase as any)
      .from("payment_batches")
      .update(payload)
      .eq("id", batchId);

    if (error) throw error;
  }

  static async updateClaimsPaymentStatusByBatch(batchId: string, paymentStatus: string) {
    const { error } = await supabase
      .from("hospital_claims" as any)
      .update({ payment_status: paymentStatus })
      .eq("payment_batch_id", batchId);

    if (error) throw error;
  }

  static async unlinkClaimsFromBatch(batchId: string) {
    const { error } = await supabase
      .from("hospital_claims" as any)
      .update({ payment_batch_id: null, payment_status: "awaiting_payment" })
      .eq("payment_batch_id", batchId);

    if (error) throw error;
  }

  static async deletePaymentBatch(batchId: string) {
    const { error } = await (supabase as any)
      .from("payment_batches")
      .delete()
      .eq("id", batchId);

    if (error) throw error;
  }

  static async getPaidClaims(): Promise<PaidClaim[]> {
    const { data, error } = await supabase
      .from("hospital_claims" as any)
      .select(`
        id,
        claim_number,
        patient_name,
        policy_number,
        hospital_name,
        hospital_id,
        total_amount,
        approved_amount,
        approved_at,
        status,
        payment_status
      `)
      .eq("payment_status", "paid")
      .order("approved_at", { ascending: false });

    if (error) throw error;
    return (data as any[]) || [];
  }

  static async getFinanceReports() {
    const { data: paidClaims, error: paidError } = await supabase
      .from("hospital_claims" as any)
      .select("approved_amount")
      .eq("payment_status", "paid");
    if (paidError) throw paidError;

    const { data: awaitingClaims, error: awaitingError } = await supabase
      .from("hospital_claims" as any)
      .select("approved_amount")
      .eq("status", "approved")
      .is("payment_batch_id", null);
    if (awaitingError) throw awaitingError;

    const { data: batches, error: batchesError } = await supabase
      .from("payment_batches" as any)
      .select("status, total_amount, month");
    if (batchesError) throw batchesError;

    return {
      paidClaims: paidClaims || [],
      awaitingClaims: awaitingClaims || [],
      batches: batches || [],
    };
  }
}
