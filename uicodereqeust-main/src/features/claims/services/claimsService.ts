import { supabase } from "@/integrations/supabase/client";
import { fetchAllSupabaseRows } from "@/lib/supabasePagination";
import type { ClaimDraft } from "@/lib/claims-helpers";
import type { ClaimsAnalysisSummary } from "../types";

export class ClaimsService {
  /**
   * Fetches summarized claims analysis data directly from the database using an RPC.
   */
  static async getClaimsAnalysisSummary(): Promise<ClaimsAnalysisSummary> {
    const { data, error } = await supabase.rpc("rpc_get_claims_analysis_summary" as any);
    if (error) throw error;
    return data || { by_status: [], by_hospital: [], by_date: [] };
  }

  /**
   * Fetches a paginated list of claims with optional filters.
   */
  static async getClaimsList({
    hospitalId,
    statusTab,
    searchTerm,
    page,
    pageSize,
  }: {
    hospitalId: string;
    statusTab: string;
    searchTerm: string;
    page: number;
    pageSize: number;
  }): Promise<{ claims: ClaimDraft[]; total: number }> {
    let query = supabase
      .from("hospital_claims")
      .select(
        "id,claim_number,patient_name,policy_number,auth_code,diagnosis,hospital_id,hospital_name,claiming_hospital_id,claiming_hospital_name,request_id,status,total_amount,approved_amount,approved_at,created_at,submitted_at,contest_deadline,contest_documents,contest_note,contest_submitted_at,contest_resolved_at,under_contest_amount,declined_amount,payment_status,payment_batch_id,paid_at,notes,audit_summary,audit_items,audit_note,audited_at,audited_by,approved_items,original_amount,line_items,referring_hospital_id,referring_hospital_name,referred_hospital_id,referred_hospital_name,requesting_hospital_id,requesting_hospital_name,updated_at",
        { count: "exact" },
      );

    if (hospitalId !== "all") {
      query = query.eq("hospital_id", hospitalId);
    }

    if (statusTab !== "all") {
      if (statusTab === "pending") {
        query = query.in("status", ["pending", "submitted", "under_review"]);
      } else if (statusTab === "approved") {
        query = query.in("status", ["approved", "partially_approved"]);
      } else if (statusTab === "contested") {
        query = query.in("status", ["contested", "under_contest"]);
      } else {
        query = query.eq("status", statusTab);
      }
    }

    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`patient_name.ilike.${term},claim_number.ilike.${term},auth_code.ilike.${term},policy_number.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }
    
    const claims: ClaimDraft[] = ((data || []) as unknown as ClaimDraft[]).map((claim) => ({
      ...claim,
      line_items: Array.isArray(claim.line_items) ? claim.line_items : [],
    }));
    return { claims, total: count || 0 };
  }

  /**
   * Fetches the list of all active hospitals for filtering.
   */
  static async getHospitalsList(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .order("name");
    
    if (error) throw error;
    return data || [];
  }

  /**
   * Fetches the associated authorization request for verification during claims audit.
   */
  static async verifyClaimAuthorization(authCode: string) {
    const { data, error } = await supabase
      .from("authorization_requests")
      .select("id,authorization_code,patient_name,policy_number,claiming_hospital_name,hospital_name,referred_hospital_name,requesting_hospital_name,total_amount,status,approved_items")
      .eq("authorization_code", authCode)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Updates the status and details of a claim after an audit is completed.
   */
  static async updateClaimStatus(claimId: string, updateData: any) {
    const { error } = await supabase.rpc("rpc_update_claim_status" as any, {
      p_claim_id: claimId,
      p_status: updateData.status,
      p_details: updateData
    });
    if (error) throw error;
  }
  
  /**
   * Generates claims report export.
   */
  static async generateClaimsReportExport(filters: any) {
    return fetchAllSupabaseRows((from, to) =>
      supabase.rpc("claims_report_export" as any, filters).range(from, to),
    );
  }
  
  /**
   * Generates claims reconciliation report.
   */
  static async generateClaimsReconciliationReport(filters: any) {
    return fetchAllSupabaseRows((from, to) =>
      supabase.rpc("claims_reconciliation_report" as any, filters).range(from, to),
    );
  }
}
