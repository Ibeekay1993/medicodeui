import { supabase } from "@/integrations/supabase/client";
import { safeIlikePattern } from "@/lib/postgrestFilter";
import { notifyPendingAuthorizationRequest } from "@/lib/pushNotifications";
import { Hospital } from "../types";

function isHospitalRequestVisible(record: any, hospital?: Hospital | null): boolean {
  if (!record) return false;

  if (record.is_historical === true) return false;
  if (record.source === "sheet_history" || record.source === "historical") return false;

  // Onboarding gate: No hospital sees history requests unless onboarding has officially started for them.
  const hospitalStart = hospital?.onboarding_started_at;
  if (!hospitalStart || !record.created_at) return false;

  const recordTime = new Date(record.created_at).getTime();
  const hospitalStartTime = new Date(hospitalStart).getTime();

  if (Number.isNaN(recordTime) || Number.isNaN(hospitalStartTime)) {
    return false;
  }

  return recordTime >= hospitalStartTime;
}

export class HospitalService {
  /**
   * Resolves the hospital profile linked to the user.
   */
  static async getHospitalProfile(hospitalId?: string, userId?: string, email?: string): Promise<Hospital | null> {
    if (hospitalId) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id,name,code,onboarding_started_at")
        .eq("id", hospitalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }

    if (userId && email) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id,name,code,onboarding_started_at")
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
          .select("id,name,code,onboarding_started_at")
          .or(`user_id.eq.${userId},email.eq.${email}`)
          .maybeSingle();
        return retry || null;
      }
    }
    return null;
  }

  /**
   * Fetches data for the hospital portal dashboard with high-performance aggregation.
   */
  static async getDashboardData(hosp: Hospital) {
    if (!hosp?.id || !hosp?.onboarding_started_at) {
      return {
        metrics: {
          approvedCount: 0,
          pendingCount: 0,
          deniedCount: 0,
          totalValue: 0,
          inAuditCount: 0,
          inAuditValue: 0,
          awaitingPaymentCount: 0,
          pendingPayout: 0,
          paidCount: 0,
          paidClaims: 0,
          totalClaimsCount: 0,
          totalClaimedValue: 0,
        },
        approachingDeadlineClaims: [],
        recentAuthorizations: [],
        recentClaims: [],
      };
    }

    const { data: rpcMetrics, error } = await (supabase.rpc as any)(
      'get_hospital_dashboard_metrics',
      { p_hospital_id: hosp.id },
    );
    if (error || !rpcMetrics || typeof rpcMetrics !== 'object') {
      console.error('Hospital dashboard aggregation failed.', error || 'Invalid response');
      throw new Error('Hospital dashboard data could not be confirmed. Retry to refresh it.');
    }

    const metricFields = [
      'approvedCount',
      'pendingCount',
      'deniedCount',
      'totalValue',
      'inAuditCount',
      'inAuditValue',
      'awaitingPaymentCount',
      'pendingPayout',
      'paidCount',
      'paidClaims',
      'totalClaimsCount',
      'totalClaimedValue',
    ] as const;
    const metricValues = metricFields.map((field) => {
      const value = rpcMetrics[field];
      if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
        return Number.NaN;
      }
      return Number(value);
    });
    if (metricValues.some((value) => !Number.isFinite(value) || value < 0)) {
      console.error('Hospital dashboard aggregation returned incomplete metrics.');
      throw new Error('Hospital dashboard data could not be confirmed. Retry to refresh it.');
    }

    if (
      !Array.isArray(rpcMetrics.approachingDeadlineClaims) ||
      !Array.isArray(rpcMetrics.recentAuthorizations) ||
      !Array.isArray(rpcMetrics.recentClaims)
    ) {
      console.error('Hospital dashboard aggregation returned incomplete activity lists.');
      throw new Error('Hospital dashboard data could not be confirmed. Retry to refresh it.');
    }

    return {
      metrics: {
        approvedCount: metricValues[0],
        pendingCount: metricValues[1],
        deniedCount: metricValues[2],
        totalValue: metricValues[3],
        inAuditCount: metricValues[4],
        inAuditValue: metricValues[5],
        awaitingPaymentCount: metricValues[6],
        pendingPayout: metricValues[7],
        paidCount: metricValues[8],
        paidClaims: metricValues[9],
        totalClaimsCount: metricValues[10],
        totalClaimedValue: metricValues[11],
      },
      approachingDeadlineClaims: rpcMetrics.approachingDeadlineClaims.filter((item: any) => isHospitalRequestVisible(item, hosp)),
      recentAuthorizations: rpcMetrics.recentAuthorizations.filter((item: any) => isHospitalRequestVisible(item, hosp)),
      recentClaims: rpcMetrics.recentClaims.filter((item: any) => isHospitalRequestVisible(item, hosp)),
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
    scope = "originated",
    page,
    pageSize,
  }: {
    hospital: Hospital;
    statusFilter: string;
    searchTerm: string;
    scope?: "originated" | "inbound_referral" | "all";
    page: number;
    pageSize: number;
  }) {
    if (!hospital?.id || !hospital?.onboarding_started_at) {
      return { requests: [], total: 0, claimStatusMap: new Map<string, string>() };
    }

    let query = supabase
      .from("authorization_requests")
      .select("id,created_at,patient_name,beneficiary_number,patient_email,patient_phone,policy_number,diagnosis,treatment,clinical_notes,urgency,status,source,authorization_code,request_id,total_amount,approved_items,decided_at,decision_reason,authorized_by_name,nurse_initials,is_historical,is_unlocked,deletion_status,hospital_id,hospital_name,requesting_hospital_id,requesting_hospital_name,referring_hospital_id,referring_hospital_name,referred_hospital_id,referred_hospital_name,claiming_hospital_id,claiming_hospital_name,treatment_submitted_at,whatsapp_message_id", { count: "exact" })
      .eq("is_historical", false)
      .gte("created_at", hospital.onboarding_started_at);

    if (scope === "originated") {
      query = query.or(`hospital_id.eq.${hospital.id},requesting_hospital_id.eq.${hospital.id}`);
    } else if (scope === "inbound_referral") {
      query = query
        .eq("referred_hospital_id", hospital.id)
        .neq("hospital_id", hospital.id);
    } else {
      const idQuery = [
        `hospital_id.eq.${hospital.id}`,
        `requesting_hospital_id.eq.${hospital.id}`,
        `referring_hospital_id.eq.${hospital.id}`,
        `referred_hospital_id.eq.${hospital.id}`,
        `claiming_hospital_id.eq.${hospital.id}`,
      ];
      query = query.or(idQuery.join(","));
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (searchTerm.trim()) {
      const term = safeIlikePattern(searchTerm);
      query = query.or(`patient_name.ilike.${term},policy_number.ilike.${term},authorization_code.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const visibleData = (data || []).filter((request: any) => isHospitalRequestVisible(request, hospital));
    const claimStatusMap = new Map<string, string>();
    if (visibleData.length > 0) {
      const pageRequestIds = visibleData.map((r: any) => r.id);
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

    return { requests: visibleData, total: visibleData.length, claimStatusMap };
  }

  /**
   * Fetches the claims list for a hospital with strict tenant isolation and fast aggregated stats.
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
    if (!hospital?.id || !hospital?.onboarding_started_at) {
      return {
        claims: [],
        total: 0,
        statsData: [],
        stats: { pending: 0, approved: 0, paid: 0, totalValue: 0 },
      };
    }

    // Strict multi-tenant query: only claims where hospital is the provider or legal claimant
    const orQuery = [
      `hospital_id.eq.${hospital.id}`,
      `claiming_hospital_id.eq.${hospital.id}`,
    ];

    let query: any = supabase
      .from('hospital_claims' as any)
      .select('id,claim_number,patient_name,policy_number,auth_code,diagnosis,hospital_id,hospital_name,claiming_hospital_id,claiming_hospital_name,request_id,status,total_amount,approved_amount,created_at,submitted_at,approved_at,contest_deadline,declined_amount,under_contest_amount,payment_status,payment_batch_id,notes,contest_note,contest_documents,line_items,approved_items,referring_hospital_id,referring_hospital_name,referred_hospital_id,referred_hospital_name,requesting_hospital_id,requesting_hospital_name', { count: 'exact' })
      .gte('created_at', hospital.onboarding_started_at)
      .or(orQuery.join(','));

    if (searchTerm.trim()) {
      const term = safeIlikePattern(searchTerm);
      query = query.or(`claim_number.ilike.${term},patient_name.ilike.${term},policy_number.ilike.${term},auth_code.ilike.${term}`);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Fast database-level stats aggregation
    let stats: { pending: number; approved: number; paid: number; totalValue: number } | null = null;
    try {
      const { data: rpcStats, error: rpcStatsError } = await (supabase.rpc as any)(
        'get_hospital_claims_stats',
        { p_hospital_id: hospital.id }
      );
      if (!rpcStatsError && rpcStats) {
        stats = {
          pending: Number(rpcStats.pending || 0),
          approved: Number(rpcStats.approved || 0),
          paid: Number(rpcStats.paid || 0),
          totalValue: Number(rpcStats.totalValue || 0),
        };
      }
    } catch {
      // Fallback below
    }

    const promises: PromiseLike<any>[] = [
      query
        .order('created_at', { ascending: false })
        .range(from, to),
    ];

    if (!stats) {
      promises.push(
        supabase
          .from('hospital_claims' as any)
          .select('status, total_amount')
          .or(orQuery.join(','))
          .limit(1000)
      );
    }

    const [pageRes, statsRes] = await Promise.all(promises);

    if (pageRes.error) throw pageRes.error;
    if (statsRes && statsRes.error) throw statsRes.error;

    return {
      claims: (pageRes.data || []) as any[],
      total: pageRes.count || 0,
      statsData: (statsRes?.data || []) as any[],
      stats: stats || undefined,
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
    if (!payload?.hospital_id) {
      throw new Error("Security verification failed: Hospital facility identifier is required.");
    }
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
