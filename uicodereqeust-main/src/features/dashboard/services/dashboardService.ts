import { supabase } from "@/integrations/supabase/client";

export class DashboardService {
  static async getDashboardStats() {
    return supabase.rpc("get_dashboard_stats" as any);
  }

  static async getFinanceChartActivity() {
    return supabase.rpc("dashboard_finance_activity_7d" as any);
  }

  static async getLiveActivity7d() {
    return supabase.rpc("dashboard_live_activity_7d" as any);
  }

  static async getClaimsActivity7d() {
    return supabase.rpc("dashboard_claims_activity_7d" as any);
  }

  static async getAdminStats() {
    const [claims, approved, rejected, pending, hospitals, users, pendingCodes] = await Promise.all([
      supabase.from("hospital_claims" as any).select("*", { count: "exact", head: true }),
      supabase.from("hospital_claims" as any).select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("hospital_claims" as any).select("*", { count: "exact", head: true }).or("status.eq.rejected,status.eq.contested"),
      supabase.from("hospital_claims" as any).select("*", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("hospitals").select("*", { count: "exact", head: true }),
      supabase.from("user_roles").select("id", { count: "exact", head: true }),
      supabase.from("historical_codes" as any).select("*", { count: "exact", head: true }).eq("record_status", "pending"),
    ]);
    return { claims, approved, rejected, pending, hospitals, users, pendingCodes };
  }

  static async getClaimsOfficerStats() {
    const [total, approved, partialApproved, rejected, contested, hospitals, users, pendingCodes] = await Promise.all([
      supabase.from("authorization_requests").select("*", { count: "exact", head: true }),
      supabase.from("authorization_requests").select("*", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("authorization_requests").select("*", { count: "exact", head: true }).eq("status", "partially_approved"),
      supabase.from("authorization_requests").select("*", { count: "exact", head: true }).eq("status", "rejected"),
      supabase.from("hospitals").select("*", { count: "exact", head: true }),
      supabase.from("user_roles").select("id", { count: "exact", head: true }),
      supabase.from("historical_codes" as any).select("*", { count: "exact", head: true }).eq("record_status", "pending"),
    ]);
    return { total, approved, partialApproved, rejected, contested, hospitals, users, pendingCodes };
  }
}
