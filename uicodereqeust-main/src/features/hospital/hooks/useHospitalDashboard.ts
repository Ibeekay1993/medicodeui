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
      return HospitalService.getDashboardData(hospital);
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
