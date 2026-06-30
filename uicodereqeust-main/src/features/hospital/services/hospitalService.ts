import { supabase } from "@/integrations/supabase/client";
import { Hospital, AuthorizationRequest, HospitalClaim } from "../types";

export class HospitalService {
  /**
   * Resolves the hospital profile linked to the user.
   */
  static async getHospitalProfile(hospitalId?: string, userId?: string, email?: string): Promise<Hospital | null> {
    if (hospitalId) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .eq("id", hospitalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    if (userId && email) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("*")
        .or(`user_id.eq.${userId},email.eq.${email}`)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      // Try healing
      const { data: healed } = await (supabase.rpc as any)("heal_hospital_user_link", {
        p_user_id: userId,
        p_email: email,
      });
      if (healed?.[0]) {
        const { data: retry } = await supabase
          .from("hospitals")
          .select("*")
          .or(`user_id.eq.${userId},email.eq.${email}`)
          .maybeSingle();
        return retry || null;
      }
    }
    return null;
  }

  /**
   * Fetches data for the hospital portal dashboard.
   */
  static async getDashboardData(hosp: Hospital) {
    const safeName = String(hosp.name || "").replace(/[%(),]/g, " ");
    const safeCode = String(hosp.code || "").replace(/[%(),]/g, " ");

    const fuzzyQuery = [`hospital_name.ilike.%${safeName}%`];
    if (safeCode.trim()) fuzzyQuery.push(`hospital_name.ilike.%${safeCode}%`);
    
    const isUHS = safeName.toLowerCase().includes("university health") || safeCode.toUpperCase().includes("UHS");
    if (isUHS) {
      fuzzyQuery.push(`hospital_name.ilike.%UHS%`);
      fuzzyQuery.push(`hospital_name.ilike.%U.H.S%`);
      fuzzyQuery.push(`hospital_name.ilike.%University Health%`);
    }

    let allData: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("authorization_requests")
        .select("*")
        .or([
          `hospital_id.eq.${hosp.id}`,
          `requesting_hospital_id.eq.${hosp.id}`,
          `referring_hospital_id.eq.${hosp.id}`,
          `referred_hospital_id.eq.${hosp.id}`,
          `claiming_hospital_id.eq.${hosp.id}`,
          ...fuzzyQuery,
        ].join(","))
        .order("created_at", { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);
        
      if (error) throw error;
      if (data && data.length > 0) {
        allData = [...allData, ...data];
        page++;
        hasMore = data.length === 1000;
      } else {
        hasMore = false;
      }
    }

    let allClaims: any[] = [];
    let claimPage = 0;
    let claimHasMore = true;
    const claimQuery = [`hospital_id.eq.${hosp.id}`, `hospital_name.ilike.%${safeName}%`];
    if (safeCode.trim()) claimQuery.push(`hospital_name.ilike.%${safeCode}%`);
    if (isUHS) {
      claimQuery.push(`hospital_name.ilike.%UHS%`);
      claimQuery.push(`hospital_name.ilike.%U.H.S%`);
      claimQuery.push(`hospital_name.ilike.%University Health%`);
    }

    while (claimHasMore) {
      const { data: claimsData, error: claimsError } = await supabase
        .from("hospital_claims" as any)
        .select("*")
        .or(claimQuery.join(","))
        .range(claimPage * 1000, (claimPage + 1) * 1000 - 1);
        
      if (claimsError) throw claimsError;
      if (claimsData && claimsData.length > 0) {
        allClaims = [...allClaims, ...claimsData];
        claimPage++;
        claimHasMore = claimsData.length === 1000;
      } else {
        claimHasMore = false;
      }
    }

    return { authorizations: allData, claims: allClaims };
  }

  static async getAnnouncements() {
    const { data, error } = await supabase
      .from("hmo_announcements")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) throw error;
    return data || [];
  }

  /**
   * Fetches the authorizations list for a hospital
   */
  static async getHospitalAuthorizations({
    hospital,
    statusFilter,
    searchTerm,
    page,
    pageSize,
  }: {
    hospital: Hospital;
    statusFilter: string;
    searchTerm: string;
    page: number;
    pageSize: number;
  }) {
    const idQuery = [
      `hospital_id.eq.${hospital.id}`,
      `requesting_hospital_id.eq.${hospital.id}`,
      `referring_hospital_id.eq.${hospital.id}`,
      `referred_hospital_id.eq.${hospital.id}`,
      `claiming_hospital_id.eq.${hospital.id}`,
    ];

    let query = supabase
      .from("authorization_requests")
      .select("*", { count: "estimated" })
      .eq("is_historical", false)
      .or(idQuery.join(","));

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`patient_name.ilike.${term},policy_number.ilike.${term},authorization_code.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    let claimStatusMap = new Map<string, string>();
    if (data && data.length > 0) {
      const pageRequestIds = data.map((r: any) => r.id);
      const { data: claimsData } = await supabase
        .from("hospital_claims" as any)
        .select("request_id,status")
        .eq("hospital_id", hospital.id)
        .in("request_id", pageRequestIds);

      if (claimsData) {
        claimsData.forEach((c: any) => {
          if (c.request_id) claimStatusMap.set(c.request_id, String(c.status || "submitted"));
        });
      }
    }

    return { requests: data || [], total: count || 0, claimStatusMap };
  }

  /**
   * Fetches the claims list for a hospital
   */
  static async getHospitalClaims({
    hospital,
    searchTerm,
    page,
    pageSize,
  }: {
    hospital: Hospital;
    searchTerm: string;
    page: number;
    pageSize: number;
  }) {
    const safeName = String(hospital.name || "").replace(/[%(),]/g, " ");
    const safeCode = String(hospital.code || "").replace(/[%(),]/g, " ");

    const orQuery = [
      `hospital_id.eq.${hospital.id}`,
      `hospital_name.ilike.%${safeName}%`
    ];

    if (safeCode.trim()) {
      orQuery.push(`hospital_name.ilike.%${safeCode}%`);
    }
    
    const isUHS = safeName.toLowerCase().includes("university health") || safeCode.toUpperCase().includes("UHS");
    if (isUHS) {
      orQuery.push(`hospital_name.ilike.%UHS%`);
      orQuery.push(`hospital_name.ilike.%U.H.S%`);
      orQuery.push(`hospital_name.ilike.%University Health%`);
    }

    let statsData: any[] = [];
    let statsPage = 0;
    let statsHasMore = true;
    
    while (statsHasMore) {
      const { data, error } = await supabase
        .from("hospital_claims" as any)
        .select("status, total_amount")
        .or(orQuery.join(","))
        .range(statsPage * 1000, (statsPage + 1) * 1000 - 1);
        
      if (error) throw error;
      if (data && data.length > 0) {
        statsData = [...statsData, ...data];
        statsPage++;
        statsHasMore = data.length === 1000;
      } else {
        statsHasMore = false;
      }
    }

    let query: any = supabase
      .from("hospital_claims" as any)
      .select("*", { count: "estimated" })
      .or(orQuery.join(","));

    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`claim_number.ilike.${term},patient_name.ilike.${term},policy_number.ilike.${term},auth_code.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: pageData, count, error: pageError } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (pageError) throw pageError;

    return { claims: pageData || [], total: count || 0, statsData };
  }

  static async findHospitalIdByName(name: string): Promise<string | null> {
    if (!name?.trim()) return null;
    const normalizedInput = name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
    try {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id, name")
        .ilike("name", `%${name.trim()}%`)
        .limit(5);

      if (error || !data || data.length === 0) return null;

      for (const h of data) {
        const norm = String(h.name || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
        if (norm === normalizedInput) return h.id;
      }
      return data[0].id;
    } catch (err) {
      console.error("findHospitalIdByName error:", err);
      return null;
    }
  }

  static async validatePolicyEmail(email: string, familyPolicy: string) {
    const { data } = await (supabase.rpc as any)('validate_policy_email', {
      p_email: email,
      p_family_policy: familyPolicy
    });
    return data;
  }

  static async registerPolicyEmail(email: string, familyPolicy: string) {
    const { data: registryData } = await (supabase as any)
      .from('policy_email_registry')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!registryData) {
      await (supabase as any).from('policy_email_registry').insert({
        email: email,
        family_policy_number: familyPolicy,
      }).maybeSingle();
    }
  }

  static async createAuthorizationRequest(payload: any) {
    const { data, error } = await supabase
      .from("authorization_requests")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  static async sendOtp(authId: string, email: string) {
    return supabase.functions.invoke("send-otp", {
      method: "POST",
      body: {
        authorization_id: authId,
        patient_email: email,
      },
    });
  }
}
