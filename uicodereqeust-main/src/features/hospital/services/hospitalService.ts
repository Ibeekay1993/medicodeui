import { supabase } from "@/integrations/supabase/client";
import { notifyPendingAuthorizationRequest } from "@/lib/pushNotifications";
import { Hospital } from "../types";

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

    const claimQuery = [
      `hospital_id.eq.${hosp.id}`,
      `requesting_hospital_id.eq.${hosp.id}`,
      `referring_hospital_id.eq.${hosp.id}`,
      `referred_hospital_id.eq.${hosp.id}`,
      `claiming_hospital_id.eq.${hosp.id}`,
      ...fuzzyQuery,
    ];

    const [authRes, claimsRes] = await Promise.all([
      supabase
        .from("authorization_requests")
        .select("id, status, total_amount, referred_hospital_id, hospital_id")
        .or([
          `hospital_id.eq.${hosp.id}`,
          `requesting_hospital_id.eq.${hosp.id}`,
          `referring_hospital_id.eq.${hosp.id}`,
          `referred_hospital_id.eq.${hosp.id}`,
          `claiming_hospital_id.eq.${hosp.id}`,
          ...fuzzyQuery,
        ].join(","))
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("hospital_claims" as any)
        .select("id, status, approved_amount, total_amount, contest_deadline, claim_number, patient_name")
        .or(claimQuery.join(","))
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    if (authRes.error) throw authRes.error;
    if (claimsRes.error) throw claimsRes.error;

    return {
      authorizations: authRes.data || [],
      claims: claimsRes.data || []
    };
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
      .select("*", { count: "exact" })
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

    const claimStatusMap = new Map<string, string>();
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
      `requesting_hospital_id.eq.${hospital.id}`,
      `referring_hospital_id.eq.${hospital.id}`,
      `referred_hospital_id.eq.${hospital.id}`,
      `claiming_hospital_id.eq.${hospital.id}`,
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

    let query: any = supabase
      .from("hospital_claims" as any)
      .select("*", { count: "exact" })
      .or(orQuery.join(","));

    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`claim_number.ilike.${term},patient_name.ilike.${term},policy_number.ilike.${term},auth_code.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const [pageRes, statsRes] = await Promise.all([
      query
        .order("created_at", { ascending: false })
        .range(from, to),
      supabase
        .from("hospital_claims" as any)
        .select("status, total_amount")
        .or(orQuery.join(","))
        .limit(3000),
    ]);

    if (pageRes.error) throw pageRes.error;
    if (statsRes.error) throw statsRes.error;

    return {
      claims: (pageRes.data || []) as any[],
      total: pageRes.count || 0,
      statsData: (statsRes.data || []) as any[]
    };
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
    const { data, error } = await (supabase.rpc as any)('validate_policy_email', {
      p_email: email,
      p_family_policy: familyPolicy
    });
    if (error) throw error;
    return data;
  }

  static async registerPolicyEmail(email: string, familyPolicy: string) {
    const { data, error } = await (supabase.rpc as any)('register_policy_email', {
      p_email: email,
      p_family_policy: familyPolicy,
    });
    if (error) throw error;
    return data;
  }

  static async registerPolicyPhone(phone: string, familyPolicy: string) {
    const { data, error } = await (supabase.rpc as any)('register_policy_phone', {
      p_phone: phone,
      p_family_policy: familyPolicy,
    });
    if (error) throw error;
    return data;
  }

  static async createAuthorizationRequest(payload: any) {
    if (payload.policy_number && payload.patient_phone) {
      const phoneResult = await this.registerPolicyPhone(
        payload.patient_phone,
        payload.policy_number,
      );
      if (!phoneResult?.allowed) {
        throw new Error(phoneResult?.reason || "Patient phone number is blocked");
      }
    }
    const { data, error } = await supabase
      .from("authorization_requests")
      .insert(payload)
      .select("id, hospital_name, status, source")
      .single();
    if (error) throw error;
    if (!data.status || data.status.startsWith("pending")) {
      void notifyPendingAuthorizationRequest({
        requestId: data.id,
        hospitalName: data.hospital_name || payload.hospital_name,
        source: data.source || payload.source || "hospital_portal",
      });
    }
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
