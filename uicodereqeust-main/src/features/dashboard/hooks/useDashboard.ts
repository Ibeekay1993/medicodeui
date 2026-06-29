import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardService } from "../services/dashboardService";
import { useAuth } from "@/contexts/AuthContext";

export function useDashboardStats() {
  const { role } = useAuth();
  
  return useQuery({
    queryKey: ["dashboard-stats", role],
    queryFn: async () => {
      if (role === "admin") {
        return DashboardService.getAdminStats();
      } else if (role === "claims") {
        return DashboardService.getClaimsOfficerStats();
      }
      return DashboardService.getDashboardStats();
    },
    enabled: !!role,
  });
}

export function useFinanceChartActivity() {
  return useQuery({
    queryKey: ["dashboard-finance-chart"],
    queryFn: () => DashboardService.getFinanceChartActivity(),
  });
}

export function useLiveActivity7d() {
  return useQuery({
    queryKey: ["dashboard-live-activity"],
    queryFn: () => DashboardService.getLiveActivity7d(),
  });
}

export function useClaimsActivity7d() {
  return useQuery({
    queryKey: ["dashboard-claims-activity"],
    queryFn: () => DashboardService.getClaimsActivity7d(),
  });
}
