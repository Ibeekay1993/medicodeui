import { supabase } from "@/integrations/supabase/client";

export class UsersService {
  static async getUsers() {
    const { data, error } = await supabase
      .from("user_roles")
      .select(`
        id,
        user_id,
        role,
        email,
        full_name,
        hospital_id,
        is_active,
        created_at,
        last_sign_in_at,
        provider_id,
        invitation_status
      `);
    if (error) throw error;
    return data || [];
  }

  static async getNameChangeRequests() {
    const { data, error } = await (supabase as any)
      .from("name_change_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async approveNameChange(id: string, newName: string, userId: string) {
    const { error } = await supabase.rpc("rpc_approve_name_change" as any, {
      p_request_id: id,
      p_new_name: newName,
      p_target_user_id: userId,
    });
    if (error) throw error;
  }

  static async rejectNameChange(id: string) {
    const { error } = await supabase.rpc("rpc_reject_name_change" as any, {
      p_request_id: id,
    });
    if (error) throw error;
  }

  static async updateUserRole(userId: string, role: string) {
    const { error } = await supabase.rpc("rpc_update_user_role" as any, {
      p_target_user_id: userId,
      p_role: role,
    });
    if (error) throw error;
  }

  static async toggleUserAccess(userId: string, isActive: boolean) {
    const { error } = await supabase.rpc("rpc_toggle_user_access" as any, {
      p_target_user_id: userId,
      p_is_active: isActive,
    });
    if (error) throw error;
  }

  static async deleteUser(userId: string) {
    const { error } = await supabase.rpc("rpc_delete_user" as any, {
      p_target_user_id: userId,
    });
    if (error) throw error;
  }

  static async resendInvitation(email: string) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    if (error) throw error;
  }

  static async getHospitalsForSelect() {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .order("name");
    if (error) throw error;
    return data || [];
  }
}
