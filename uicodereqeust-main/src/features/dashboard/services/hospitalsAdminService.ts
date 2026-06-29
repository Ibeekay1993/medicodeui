import { supabase } from "@/integrations/supabase/client";

export class HospitalsAdminService {
  static async getHospitalsPaged(pageSize = 1000) {
    const all: any[] = [];
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .order("name")
        .range(from, to);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
    }
    return all;
  }

  static async getHospitalUsers() {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id, full_name, email, role, hospital_id")
      .eq("role", "hospital")
      .order("full_name");
    if (error) throw error;
    return data || [];
  }

  static async createHospital(hosp: { name: string; code: string; email: string; address: string; phone: string; state: string }) {
    const { data, error } = await supabase.from("hospitals").insert([hosp]).select().single();
    if (error) throw error;
    return data;
  }

  static async updateHospital(id: string, updates: any) {
    const { error } = await supabase.rpc("rpc_update_hospital_profile" as any, {
      p_hospital_id: id,
      p_payload: updates,
    });
    if (error) throw error;
  }

  static async deleteHospital(id: string) {
    const { error } = await supabase.from("hospitals").delete().eq("id", id);
    if (error) throw error;
  }

  static async toggleHospitalActive(id: string, isActive: boolean) {
    const { error } = await supabase.rpc("rpc_toggle_hospital_status" as any, {
      p_hospital_id: id,
      p_is_active: isActive,
    });
    if (error) throw error;
  }

  static async linkUserToHospital(userId: string, hospitalId: string) {
    const { error } = await supabase.rpc("rpc_link_user_to_hospital" as any, {
      p_user_id: userId,
      p_hospital_id: hospitalId,
    });
    if (error) throw error;
  }

  static async exportHospitalsCSV(hospitals: any[]) {
    const headers = ["Name", "Code", "State", "Email", "Phone", "Address", "Active"];
    const rows = hospitals.map((h) => [
      h.name, h.code, h.state, h.email, h.phone, h.address, h.is_active ? "Yes" : "No"
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `hospitals_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
