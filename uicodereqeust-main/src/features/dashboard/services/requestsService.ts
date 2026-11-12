import { supabase } from "@/integrations/supabase/client";
import { ACTION_REQUIRED_AUTHORIZATION_STATUSES } from "@/features/dashboard/constants/requestStatuses";

export class RequestsService {
  static async getRequests({
    page,
    rowsPerPage,
    search,
    statusFilter,
    role,
  }: {
    page: number;
    rowsPerPage: number;
    search: string;
    statusFilter: string;
    role: string;
  }) {
    const from = (page - 1) * rowsPerPage;
    const to = from + rowsPerPage - 1;

    let q = supabase
      .from("authorization_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (role === "claims") {
      q = q.neq("status", "deleted");
    }

    if (statusFilter === "action_required") {
      q = q.in("status", [...ACTION_REQUIRED_AUTHORIZATION_STATUSES]);
    } else if (statusFilter !== "all") {
      q = q.eq("status", statusFilter as any);
    }

    if (search.trim()) {
      const term = `%${search.trim()}%`;
      q = q.or(`patient_name.ilike.${term},request_id.ilike.${term},hospital_name.ilike.${term},policy_number.ilike.${term}`);
    }

    q = q.range(from, to);
    return q;
  }

  static async deleteRequest(id: string, reason: string) {
    const { error } = await supabase.rpc("rpc_delete_authorization_request" as any, {
      p_request_id: id,
      p_reason: reason,
    });
    if (error) throw error;
  }

  static async getDeleteQueue() {
    const { data, error } = await supabase
      .from("authorization_requests")
      .select("*")
      .eq("deletion_status", "awaiting_admin_approval")
      .order("deletion_requested_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async getDeleteArchive() {
    const { data, error } = await supabase
      .from("archived_deleted_authorizations")
      .select("*")
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async resolveDeleteRequest(id: string, action: "approved" | "rejected") {
    const { error } = await supabase.rpc("rpc_resolve_delete_request" as any, {
      p_request_id: id,
      p_action: action,
    });
    if (error) throw error;
  }

  static async hardDeleteRequest(id: string) {
    const { error } = await supabase.rpc("rpc_hard_delete_authorization_request" as any, {
      p_request_id: id,
    });
    if (error) throw error;
  }
}
