export type RequestStatus = "pending" | "approved" | "rejected" | "deferred";

export interface ReportStats {
  totalCodes: number;
  approvedCodes: number;
  pendingCodes: number;
  rejectedCodes: number;
  requestedAmount: number;
  approvedAmount: number;
  pendingAmount: number;
  rejectedAmount: number;
  approvalRate: number;
  rejectionRate: number;
  avgProcessingTime: number;
  dailyVolume: number;
}

export interface HospitalPerformance {
  hospital: string;
  totalCodes: number;
  approvedCodes: number;
  rejectedCodes: number;
  pendingCodes: number;
  requestedAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  approvalRate: number;
}

export interface TrendPoint {
  date: string;
  approved: number;
  rejected: number;
  pending: number;
  approvedAmount: number;
  rejectedAmount: number;
}

export interface PreAuthRecord {
  id: string;
  created_at: string;
  request_id: string;
  patient_name: string;
  patient_phone: string;
  patient_email: string;
  policy_number: string;
  diagnosis: string;
  treatment: string;
  requesting_hospital: string;
  hospital_id?: string;
  source: string;
  authorization_code: string;
  status: RequestStatus;
  requested_amount: number;
  approved_amount: number;
  rejected_amount: number;
  rejection_reason: string;
  decision_reason: string;
  decided_at?: string;
  clinician?: string;
  is_historical?: boolean;
}

export interface FilterState {
  statusFilter: string;
  dateFilter: string;
  startDate: string;
  endDate: string;
  hospitalFilter: string;
}

export const defaultStats: ReportStats = {
  totalCodes: 0,
  approvedCodes: 0,
  pendingCodes: 0,
  rejectedCodes: 0,
  requestedAmount: 0,
  approvedAmount: 0,
  pendingAmount: 0,
  rejectedAmount: 0,
  approvalRate: 0,
  rejectionRate: 0,
  avgProcessingTime: 0,
  dailyVolume: 0,
};

export const preAuthStatusFilterMap: Record<string, string[]> = {
  all: [],
  pending: ["pending"],
  pending_referral: ["pending_referral"],
  referral_approved: ["referral_approved"],
  referral_accepted: ["referral_accepted"],
  pending_authorization: ["pending_authorization"],
  approved: ["approved"],
  rejected: ["rejected"],
  referral_declined: ["referral_declined"],
  referral_expired: ["referral_expired"],
};

export function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function calculateApprovalRate(approved: number, total: number): number {
  return total > 0 ? (approved / total) * 100 : 0;
}

export function calculateRejectionRate(rejected: number, total: number): number {
  return total > 0 ? (rejected / total) * 100 : 0;
}

export function buildDateFilter(
  dateFilter: string,
  startDate?: string,
  endDate?: string
): { from?: Date; to?: Date } {
  if (dateFilter === "custom" && startDate && endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return { from: new Date(startDate), to: end };
  }
  if (dateFilter === "all") return {};

  const today = new Date();
  const fromDate = new Date();

  switch (dateFilter) {
    case "today":
      fromDate.setHours(0, 0, 0, 0);
      return { from: fromDate, to: today };
    case "7days":
      fromDate.setDate(today.getDate() - 7);
      return { from: fromDate, to: today };
    case "30days":
      fromDate.setDate(today.getDate() - 30);
      return { from: fromDate, to: today };
    default:
      return {};
  }
}

export function groupByDate(
  records: PreAuthRecord[],
  granularity: "day" | "week" | "month"
): TrendPoint[] {
  const groups = new Map<string, TrendPoint>();

  for (const record of records) {
    const date = new Date(record.created_at);
    let key: string;

    if (granularity === "day") {
      key = date.toISOString().split("T")[0];
    } else if (granularity === "week") {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split("T")[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        date: key,
        approved: 0,
        rejected: 0,
        pending: 0,
        approvedAmount: 0,
        rejectedAmount: 0,
      });
    }

    const point = groups.get(key)!;
    if (record.status === "approved") {
      point.approved++;
      point.approvedAmount += record.approved_amount || 0;
    } else if (record.status === "rejected") {
      point.rejected++;
      point.rejectedAmount += record.rejected_amount || 0;
    } else if (record.status === "pending") {
      point.pending++;
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateHospitalPerformance(
  records: PreAuthRecord[]
): HospitalPerformance[] {
  const groups = new Map<string, HospitalPerformance>();

  for (const record of records) {
    const hospital = record.requesting_hospital || "Unknown";

    if (!groups.has(hospital)) {
      groups.set(hospital, {
        hospital,
        totalCodes: 0,
        approvedCodes: 0,
        rejectedCodes: 0,
        pendingCodes: 0,
        requestedAmount: 0,
        approvedAmount: 0,
        rejectedAmount: 0,
        approvalRate: 0,
      });
    }

    const perf = groups.get(hospital)!;
    perf.totalCodes++;
    perf.requestedAmount += record.requested_amount || 0;

    if (record.status === "approved") {
      perf.approvedCodes++;
      perf.approvedAmount += record.approved_amount || 0;
    } else if (record.status === "rejected") {
      perf.rejectedCodes++;
      perf.rejectedAmount += record.rejected_amount || 0;
    } else if (record.status === "pending") {
      perf.pendingCodes++;
    }
  }

  for (const perf of groups.values()) {
    perf.approvalRate = calculateApprovalRate(perf.approvedCodes, perf.totalCodes);
  }

  return Array.from(groups.values()).sort((a, b) => b.totalCodes - a.totalCodes);
}
