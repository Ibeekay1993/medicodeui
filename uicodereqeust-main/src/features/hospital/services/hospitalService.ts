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
   * Fetches data for the hospital portal dashboard with high-performance aggregation.
   */
  static async getDashboardData(hosp: Hospital) {
    if (!hosp?.id) {
      return {
        metrics: {
          approvedCount: 0,
          pendingCount: 0,
          deniedCount: 0,
          totalValue: 0,
          pendingPayout: 0,
          paidClaims: 0,
        },
        approachingDeadlineClaims: [],
      };
    }

    // 1. High-precision database-side aggregation RPC (Elon Musk standard: exact, zero slop)
    try {
      const { data: rpcMetrics, error: rpcError } = await (supabase.rpc as any)(
        'get_hospital_dashboard_metrics',
        { p_hospital_id: hosp.id }
      );
      if (!rpcError && rpcMetrics) {
        return {
          metrics: {
            approvedCount: Number(rpcMetrics.approvedCount || 0),
            pendingCount: Number(rpcMetrics.pendingCount || 0),
            deniedCount: Number(rpcMetrics.deniedCount || 0),
            totalValue: Number(rpcMetrics.totalValue || 0),
            inAuditCount: Number(rpcMetrics.inAuditCount || 0),
            inAuditValue: Number(rpcMetrics.inAuditValue || 0),
            awaitingPaymentCount: Number(rpcMetrics.awaitingPaymentCount || 0),
            pendingPayout: Number(rpcMetrics.pendingPayout || 0),
            paidCount: Number(rpcMetrics.paidCount || 0),
            paidClaims: Number(rpcMetrics.paidClaims || 0),
            totalClaimsCount: Number(rpcMetrics.totalClaimsCount || 0),
            totalClaimedValue: Number(rpcMetrics.totalClaimedValue || 0),
          },
          approachingDeadlineClaims: Array.isArray(rpcMetrics.approachingDeadlineClaims)
            ? rpcMetrics.approachingDeadlineClaims
            : [],
          recentAuthorizations: Array.isArray(rpcMetrics.recentAuthorizations)
            ? rpcMetrics.recentAuthorizations
            : [],
          recentClaims: Array.isArray(rpcMetrics.recentClaims)
            ? rpcMetrics.recentClaims
            : [],
        };
      }
    } catch {
      // Fallback below
    }

    // 2. Mathematically precise client-side fallback query
    const authQuery = [
      `hospital_id.eq.${hosp.id}`,
      `requesting_hospital_id.eq.${hosp.id}`,
      `referring_hospital_id.eq.${hosp.id}`,
      `referred_hospital_id.eq.${hosp.id}`,
      `claiming_hospital_id.eq.${hosp.id}`,
    ];

    const claimQuery = [
      `hospital_id.eq.${hosp.id}`,
      `claiming_hospital_id.eq.${hosp.id}`,
    ];

    const [authRes, claimsRes] = await Promise.all([
      supabase
        .from('authorization_requests')
        .select('id, request_id, patient_name, policy_number, diagnosis, authorization_code, status, total_amount, referred_hospital_id, hospital_id, claimed, claim_status, is_unlocked, created_at, deletion_status')
        .or(authQuery.join(','))
        .eq('is_historical', false)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('hospital_claims' as any)
        .select('id, claim_number, auth_code, patient_name, policy_number, status, payment_status, approved_amount, total_amount, declined_amount, contest_deadline, created_at')
        .or(claimQuery.join(','))
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (authRes.error) throw authRes.error;
    if (claimsRes.error) throw claimsRes.error;

    // Filter out deleted or awaiting delete records
    const auths = (authRes.data || []).filter((d: any) => 
      d.deletion_status !== 'awaiting_admin_approval' && 
      !['deleted', 'awaiting_delete', 'withdrawn'].includes(String(d.status || '').toLowerCase())
    );
    const claims = claimsRes.data || [];

    const approvedList = auths.filter((d: any) => 
      ['approved', 'authorization_approved', 'partially_approved'].includes(String(d.status || '').toLowerCase())
    );
    const pendingList = auths.filter((d: any) => [
      'pending', 'pending_referral', 'referral_approved', 'referral_accepted', 'pending_authorization', 'info_provided'
    ].includes(String(d.status || '').toLowerCase()));
    const deniedList = auths.filter((d: any) => 
      ['rejected', 'referral_declined', 'referral_expired'].includes(String(d.status || '').toLowerCase())
    );

    // Sum ONLY approved care amounts for treating facility
    const totalApprovedValue = approvedList
      .filter((d: any) => !(d.referred_hospital_id && d.hospital_id === hosp.id && d.referred_hospital_id !== hosp.id))
      .reduce((sum: number, d: any) => sum + (Number(d.total_amount) || 0), 0);

    const inAuditClaims = claims.filter((c: any) => 
      ['submitted', 'under_review', 'pending'].includes(String(c.status || '').toLowerCase())
    );
    const awaitingPayClaims = claims.filter((c: any) => 
      ['approved', 'partially_approved'].includes(String(c.status || '').toLowerCase()) &&
      String(c.payment_status || '').toLowerCase() !== 'paid'
    );
    const paidList = claims.filter((c: any) => 
      String(c.status || '').toLowerCase() === 'paid' || 
      String(c.payment_status || '').toLowerCase() === 'paid'
    );

    const metrics = {
      approvedCount: approvedList.length,
      pendingCount: pendingList.length,
      deniedCount: deniedList.length,
      totalValue: totalApprovedValue,
      inAuditCount: inAuditClaims.length,
      inAuditValue: inAuditClaims.reduce((sum: number, c: any) => sum + (Number(c.total_amount) || 0), 0),
      awaitingPaymentCount: awaitingPayClaims.length,
      pendingPayout: awaitingPayClaims.reduce((sum: number, c: any) => sum + (Number(c.approved_amount || c.total_amount) || 0), 0),
      paidCount: paidList.length,
      paidClaims: paidList.reduce((sum: number, c: any) => sum + (Number(c.approved_amount || c.total_amount) || 0), 0),
      totalClaimsCount: claims.length,
      totalClaimedValue: claims.reduce((sum: number, c: any) => sum + (Number(c.total_amount) || 0), 0),
    };

    const now = new Date();
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(now.getDate() + 5);

    const approachingDeadlineClaims = claims.filter((c: any) => {
      if (String(c.status).toLowerCase() !== 'partially_approved') return false;
      if (!c.contest_deadline) return false;
      const deadline = new Date(c.contest_deadline);
      return deadline > now && deadline <= fiveDaysFromNow;
    });

    return {
      metrics,
      approachingDeadlineClaims,
      recentAuthorizations: auths.slice(0, 6),
      recentClaims: claims.slice(0, 6),
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
    if (!hospital?.id) {
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
      .select('*', { count: 'exact' })
      .or(orQuery.join(','));

    if (searchTerm.trim()) {
      const term = `%${searchTerm.trim()}%`;
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

    const promises: [Promise<any>, Promise<any>?] = [
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
