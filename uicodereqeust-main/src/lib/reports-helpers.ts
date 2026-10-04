export type RequestStatus = "pending" | "approved" | "rejected" | "deferred";

export interface ReportStats {
  totalCodes: number;
  approvedCodes: number;
  pendingCodes: number;
  rejectedCodes: number;
  approvedAmount: number;
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
  approvedAmount: number;
  approvalRate: number;
}

export interface TrendPoint {
  date: string;
  approved: number;
  rejected: number;
  pending: number;
  approvedAmount: number;
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
  approved_amount: number;
  approved_items?: unknown[];
  rejection_reason: string;
  decision_reason: string;
  decided_at?: string;
  decided_by?: string | null;
  approved_by?: string | null;
  treatment_submitted_at?: string | null;
  urgency?: string | null;
  clinician?: string;
  is_historical?: boolean;
}

export function isApprovedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"].includes(s);
}

export function isRejectedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return ["rejected", "referral_declined", "referral_expired"].includes(s);
}

export function isPendingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return ["pending", "pending_referral", "pending_authorization"].includes(s);
}

export function calculateApprovedAmount(record: {
  status?: unknown;
  approved_items?: unknown;
  approved_tariff_amount?: unknown;
  approved_amount?: unknown;
  total_amount?: unknown;
}): number {
  if (Array.isArray(record.approved_items) && record.approved_items.length > 0) {
    const calculatedCents = record.approved_items.reduce((sum, item) => {
      if (!item || typeof item !== "object" || Boolean((item as { declined?: unknown }).declined)) {
        return sum;
      }

      const rawItem = item as {
        amount?: unknown;
        total?: unknown;
        price?: unknown;
        unit_price?: unknown;
        quantity?: unknown;
      };

      const value = rawItem.amount ?? rawItem.total;
      if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
        return sum + Math.round(Number(value) * 100);
      }
      const unit = Number(rawItem.unit_price ?? rawItem.price ?? 0);
      const qty = Number(rawItem.quantity ?? 1);
      if (Number.isFinite(unit) && unit > 0 && Number.isFinite(qty) && qty > 0) {
        return sum + Math.round(unit * qty * 100);
      }
      return sum;
    }, 0);

    // An explicit approved cart is authoritative, including a zero total when
    // every item was declined. Never substitute a stale request/tariff amount.
    return calculatedCents / 100;
  }

  const storedAmount = Number(
    isApprovedStatus(String(record.status || ""))
      ? (record.total_amount ?? record.approved_amount ?? record.approved_tariff_amount ?? 0)
      : 0
  );
  return Number.isFinite(storedAmount) ? storedAmount : 0;
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
  approvedAmount: 0,
  approvalRate: 0,
  rejectionRate: 0,
  avgProcessingTime: 0,
  dailyVolume: 0,
};

export const preAuthStatusFilterMap: Record<string, string[]> = {
  all: [],
  pending: ["pending", "pending_referral", "pending_authorization"],
  pending_referral: ["pending_referral"],
  referral_approved: ["referral_approved"],
  referral_accepted: ["referral_accepted"],
  pending_authorization: ["pending_authorization"],
  approved: ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"],
  partially_approved: ["partially_approved"],
  rejected: ["rejected", "referral_declined", "referral_expired"],
  referral_declined: ["referral_declined"],
  referral_expired: ["referral_expired"],
};

export type ReportStatusPredicate =
  | { operator: "eq"; value: string }
  | { operator: "in"; values: string[] }
  | null;

export function getReportStatusPredicate(statusFilter: string): ReportStatusPredicate {
  const statuses = preAuthStatusFilterMap[statusFilter];
  if (!statuses?.length) return null;
  if (statuses.length === 1) return { operator: "eq", value: statuses[0] };
  return { operator: "in", values: statuses };
}

export async function fetchAllReportPages<T>(
  fetchPage: (range: { from: number; to: number }) => Promise<{ data: T[] | null; error: unknown | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const allRows: T[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const { data, error } = await fetchPage({ from, to: from + pageSize - 1 });
    if (error) throw error;
    if (!data?.length) return allRows;

    allRows.push(...data);
    if (data.length < pageSize) return allRows;
    page += 1;
  }
}

export function calculateReportStats(data: PreAuthRecord[]): ReportStats {
  const approved = data.filter((r) => isApprovedStatus(r.status));
  const pending = data.filter((r) => isPendingStatus(r.status));
  const rejected = data.filter((r) => isRejectedStatus(r.status));

  const totalApproved = approved.reduce((sum, r) => sum + (Number(r.approved_amount) || 0), 0);

  const processedRecords = data.filter((r) => r.decided_at && r.created_at);
  const avgTime =
    processedRecords.length > 0
      ? processedRecords.reduce((sum, r) => {
          const created = new Date(r.created_at).getTime();
          const decided = new Date(r.decided_at!).getTime();
          return sum + (decided - created);
        }, 0) / processedRecords.length / (1000 * 60 * 60)
      : 0;

  const uniqueDays = new Set(data.map((r) => r.created_at.split("T")[0])).size;
  const dailyVol = uniqueDays > 0 ? data.length / uniqueDays : 0;

  return {
    totalCodes: data.length,
    approvedCodes: approved.length,
    pendingCodes: pending.length,
    rejectedCodes: rejected.length,
    approvedAmount: totalApproved,
    approvalRate: data.length > 0 ? (approved.length / data.length) * 100 : 0,
    rejectionRate: data.length > 0 ? (rejected.length / data.length) * 100 : 0,
    avgProcessingTime: avgTime,
    dailyVolume: dailyVol,
  };
}

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
      fromDate.setHours(0, 0, 0, 0);
      return { from: fromDate, to: today };
    case "30days":
      fromDate.setDate(today.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
      return { from: fromDate, to: today };
    case "this_month": {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      return { from: startOfMonth, to: today };
    }
    case "last_month": {
      const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1, 0, 0, 0, 0);
      const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      return { from: startOfLastMonth, to: endOfLastMonth };
    }
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
      });
    }

    const point = groups.get(key)!;
    if (isApprovedStatus(record.status)) {
      point.approved++;
      point.approvedAmount += Number(record.approved_amount) || 0;
    } else if (isRejectedStatus(record.status)) {
      point.rejected++;
    } else if (isPendingStatus(record.status)) {
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
        approvedAmount: 0,
        approvalRate: 0,
      });
    }

    const perf = groups.get(hospital)!;
    perf.totalCodes++;

    if (isApprovedStatus(record.status)) {
      perf.approvedCodes++;
      perf.approvedAmount += Number(record.approved_amount) || 0;
    } else if (isRejectedStatus(record.status)) {
      perf.rejectedCodes++;
    } else if (isPendingStatus(record.status)) {
      perf.pendingCodes++;
    }
  }

  for (const perf of groups.values()) {
    perf.approvalRate = calculateApprovalRate(perf.approvedCodes, perf.totalCodes);
  }

  return Array.from(groups.values()).sort((a, b) => b.totalCodes - a.totalCodes);
}
