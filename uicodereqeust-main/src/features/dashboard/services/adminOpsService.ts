import { supabase } from "@/integrations/supabase/client";

export class AdminOpsService {
  static async importHistoricalCodes(data: any[]) {
    const { error: wipeError } = await supabase.rpc("wipe_historical_codes" as any);
    if (wipeError) throw wipeError;

    const { data: result, error } = await supabase.rpc("import_historical_codes" as any, {
      _codes: data,
    });
    if (error) throw error;
    return result;
  }

  static async updateNhisBeneficiaries(data: any[]) {
    // Basic implementation since original uses chunking. Will assume simple chunking.
    const chunkSize = 100;
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      const { error } = await supabase.from("nhis_update_staging" as any).insert(chunk);
      if (error) throw error;
    }

    const { data: result, error: replaceError } = await supabase.rpc("replace_nhis_beneficiaries" as any);
    if (replaceError) throw replaceError;
    return result;
  }

  static async getAuditLogs() {
    const { data, error } = await supabase
      .from("audit_logs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  }

  static async parseWhatsAppMessage(message: string) {
     const lines = message.split('\n');
     // ... logic can be added if needed, or keeping it local in the component
     return { parsed: true };
  }
}
