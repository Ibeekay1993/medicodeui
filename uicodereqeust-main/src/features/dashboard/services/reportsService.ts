import { supabase } from "@/integrations/supabase/client";

export class ReportsService {
  static async getReports() {
    const { data, error } = await supabase.rpc("dashboard_live_activity_7d" as any);
    if (error) throw error;
    return data || [];
  }
}
