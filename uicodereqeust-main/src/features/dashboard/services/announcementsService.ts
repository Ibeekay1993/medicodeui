import { supabase } from "@/integrations/supabase/client";

export class AnnouncementsService {
  static async getAnnouncements() {
    const { data, error } = await supabase
      .from("hmo_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async createAnnouncement(payload: { title: string; content: string; priority: string; is_active: boolean }) {
    const { error } = await supabase.from("hmo_announcements").insert([payload]);
    if (error) throw error;
  }

  static async updateAnnouncement(id: string, payload: { title: string; content: string; priority: string; is_active: boolean }) {
    const { error } = await supabase.from("hmo_announcements").update(payload).eq("id", id);
    if (error) throw error;
  }

  static async deleteAnnouncement(id: string) {
    const { error } = await supabase.from("hmo_announcements").delete().eq("id", id);
    if (error) throw error;
  }

  static async toggleAnnouncement(id: string, isActive: boolean) {
    const { error } = await supabase.from("hmo_announcements").update({ is_active: isActive }).eq("id", id);
    if (error) throw error;
  }
}
