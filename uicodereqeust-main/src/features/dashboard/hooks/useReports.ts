import { useQuery } from "@tanstack/react-query";
import { ReportsService } from "../services/reportsService";

export function useReports() {
  return useQuery({
    queryKey: ["reports"],
    queryFn: () => ReportsService.getReports(),
  });
}
