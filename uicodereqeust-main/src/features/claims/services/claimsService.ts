import { supabase } from "@/integrations/supabase/client";
import { ClaimRecord, ClaimDraft } from "../types";

export class ClaimsService {
  /**
   * Fetches summarized claims analysis data directly from the database using an RPC.
   */
  static async getClaimsAnalysisSummary(): Promise<any> {
    const { data, error } = await supabase.rpc("rpc_get_claims_analysis_summary" as any);
    if (error) throw error;
    return data;
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
    let query: any = supabase
      .from("hospital_claims" as any)
      .select("*", { count: "estimated" });

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
    
    return { claims: (data || []) as ClaimDraft[], total: count || 0 };
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
      .select("*")
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
    const { data, error } = await supabase.rpc("claims_report_export" as any, filters);
    if (error) throw error;
    return data;
  }
  
  /**
   * Generates claims reconciliation report.
   */
  static async generateClaimsReconciliationReport(filters: any) {
    const { data, error } = await supabase.rpc("claims_reconciliation_report" as any, filters);
    if (error) throw error;
    return data;
  }
}
