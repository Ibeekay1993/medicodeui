import { useQuery } from "@tanstack/react-query";
import { HospitalService } from "../services/hospitalService";
import { HospitalDashboardMetrics } from "../types";

export function useHospitalProfile(hospitalId?: string, userId?: string, email?: string) {
  return useQuery({
    queryKey: ["hospital-profile", hospitalId, userId, email],
    queryFn: async () => {
      const emailTrimmed = email ? email.replace(/[(),]/g, " ").trim() : undefined;
      return HospitalService.getHospitalProfile(hospitalId, userId, emailTrimmed);
    },
    enabled: !!hospitalId || (!!userId && !!email),
  });
}

export function useHospitalDashboard(hospital: any) {
  return useQuery({
    queryKey: ["hospital-dashboard", hospital?.id],
    queryFn: async () => {
      if (!hospital) return null;
      const data = await HospitalService.getDashboardData(hospital);
      
      const metrics: HospitalDashboardMetrics = {
        approvedCount: data.authorizations.filter((d: any) => ["approved", "authorization_approved"].includes(String(d.status).toLowerCase())).length,
        pendingCount: data.authorizations.filter((d: any) => [
          "pending", "pending_referral", "referral_approved", "referral_accepted", "pending_authorization"
        ].includes(String(d.status).toLowerCase())).length,
        deniedCount: data.authorizations.filter((d: any) => ["rejected", "referral_declined", "referral_expired"].includes(String(d.status).toLowerCase())).length,
        totalValue: data.authorizations
          .filter((d: any) => !(d.referred_hospital_id && d.hospital_id === hospital.id))
          .reduce((sum: number, d: any) => sum + (Number(d.total_amount) || 0), 0),
        pendingPayout: data.claims.filter((c: any) => ["approved", "partially_approved"].includes(String(c.status).toLowerCase())).reduce((sum: number, c: any) => sum + (Number(c.approved_amount || c.total_amount) || 0), 0),
        paidClaims: data.claims.filter((c: any) => String(c.status).toLowerCase() === "paid").reduce((sum: number, c: any) => sum + (Number(c.approved_amount || c.total_amount) || 0), 0)
      };

      const now = new Date();
      const fiveDaysFromNow = new Date();
      fiveDaysFromNow.setDate(now.getDate() + 5);

      const approachingDeadlineClaims = data.claims.filter((c: any) => {
        if (String(c.status).toLowerCase() !== 'partially_approved') return false;
        if (!c.contest_deadline) return false;
        const deadline = new Date(c.contest_deadline);
        return deadline > now && deadline <= fiveDaysFromNow;
      });

      return { metrics, approachingDeadlineClaims };
    },
    enabled: !!hospital,
  });
}

export function useHospitalAnnouncements() {
  return useQuery({
    queryKey: ["hospital-announcements"],
    queryFn: async () => {
      return HospitalService.getAnnouncements();
    },
    staleTime: 60 * 1000,
  });
}
