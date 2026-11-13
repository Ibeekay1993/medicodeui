import { supabase } from "@/integrations/supabase/client";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import { PaymentBatch, AwaitingPaymentClaim, PaidClaim } from "../types";

export class PaymentsService {
  static async getAwaitingPaymentClaims(): Promise<AwaitingPaymentClaim[]> {
    return fetchAllSupabaseRows<AwaitingPaymentClaim>((from, to) => (supabase
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
        submitted_at,
        created_at,
        status,
        payment_status,
        contest_deadline,
        paid_at
      `)
      .in("status", ["approved", "partially_approved"])
      .is("payment_batch_id", null)
      .or("payment_status.is.null,payment_status.neq.paid")
      .order("approved_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to) as any));
  }

  static async getPaymentBatches(): Promise<PaymentBatch[]> {
    return fetchAllSupabaseRows((from, to) => (supabase as any)
      .from("payment_batches")
      .select(`
        *,
        hospitals:provider_id(name)
      `)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to));
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
    return fetchAllSupabaseRows<any>((from, to) => (supabase
      .from("hospital_claims" as any)
      .select("id, claim_number, patient_name, policy_number, total_amount, approved_amount, approved_at, status")
      .eq("payment_batch_id", batchId)
      .order("claim_number", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to) as any));
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
    const allowedTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
    const maxSizeBytes = 5 * 1024 * 1024;
    if (!allowedTypes.has(file.type)) {
      throw new Error("Choose a JPG, PNG, or PDF receipt.");
    }
    if (file.size <= 0 || file.size > maxSizeBytes) {
      throw new Error("Receipt files must be between 1 byte and 5 MB.");
    }

    const safeName = file.name.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") || "receipt";
    const filePath = `${batchId}/${crypto.randomUUID()}-${safeName}`;
    
    const { error: uploadError } = await supabase.storage
      .from("payment-receipts")
      .upload(filePath, file);

    if (uploadError) throw uploadError;
    return filePath;
  }

  static async preparePaymentBatch(batchId: string) {
    const { error } = await (supabase as any).rpc("prepare_payment_batch_transactional", {
      p_batch_id: batchId,
    });
    if (error) throw error;
  }

  static async rejectPaymentBatch(batchId: string) {
    const { error } = await (supabase as any).rpc("reject_payment_batch_transactional", {
      p_batch_id: batchId,
    });
    if (error) throw error;
  }

  static async cancelDraftPaymentBatch(batchId: string) {
    const { error } = await (supabase as any).rpc("cancel_draft_payment_batch_transactional", {
      p_batch_id: batchId,
    });
    if (error) throw error;
  }

  static async settlePaymentBatch(batchId: string, payload: Record<string, unknown>) {
    const { error } = await supabase.rpc("settle_payment_batch_transactional" as any, {
      p_batch_id: batchId,
      p_payload: { ...payload, status: "paid" },
    });
    if (error) throw error;
  }

  static async getPaidClaims(): Promise<PaidClaim[]> {
    return fetchAllSupabaseRows<PaidClaim>((from, to) => (supabase
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
        submitted_at,
        created_at,
        paid_at,
        status,
        payment_status
      `)
      .or("payment_status.eq.paid,status.eq.paid")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to) as any));
  }

  static async getFinanceReports() {
    const [paidClaims, awaitingClaims, batches] = await Promise.all([
      fetchAllSupabaseRows((from, to) => supabase
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
        submitted_at,
        paid_at,
        created_at,
        status,
        payment_status
      `)
      .or("payment_status.eq.paid,status.eq.paid")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to)),

      fetchAllSupabaseRows((from, to) => supabase
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
        submitted_at,
        created_at,
        approved_at,
        contest_deadline,
        status,
        payment_status
      `)
      .in("status", ["approved", "partially_approved"])
      .is("payment_batch_id", null)
      .or("payment_status.is.null,payment_status.neq.paid")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)),

      fetchAllSupabaseRows((from, to) => supabase
      .from("payment_batches" as any)
      .select(`
        id,
        batch_reference,
        provider_id,
        hospitals:provider_id(name),
        month,
        total_claims,
        total_amount,
        status,
        bank_reference,
        created_at,
        paid_at,
        receipt_name
      `)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)),
    ]);

    return {
      paidClaims,
      awaitingClaims,
      batches,
    };
  }
}
