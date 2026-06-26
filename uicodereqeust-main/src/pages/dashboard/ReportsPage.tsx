import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { BarChart3, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import * as XLSX from "xlsx";

import {
  RequestStatus,
  ReportStats,
  HospitalPerformance,
  TrendPoint,
  PreAuthRecord,
  FilterState,
  defaultStats,
  preAuthStatusFilterMap,
  formatNaira,
  formatPercent,
  buildDateFilter,
  groupByDate,
  calculateHospitalPerformance
} from "@/lib/reports-helpers";

import ReportFilters from "@/components/reports/ReportFilters";
import KPIStatsGrid from "@/components/reports/KPIStatsGrid";
import StatusDistributionChart from "@/components/reports/StatusDistributionChart";

import MonthlyTrendChart from "@/components/reports/MonthlyTrendChart";
import HospitalPerformanceTable from "@/components/reports/HospitalPerformanceTable";

export default function ReportsPage() {
  const { role } = useAuth();
  const normalizedRole = role?.toLowerCase();

  const [hospitals, setHospitals] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    statusFilter: "all",
    dateFilter: "30days",
    startDate: "",
    endDate: "",
    hospitalFilter: "all",
  });
  const [records, setRecords] = useState<PreAuthRecord[]>([]);
  const [stats, setStats] = useState<ReportStats>(defaultStats);
  const [hospitalPerformance, setHospitalPerformance] = useState<HospitalPerformance[]>([]);
  const [dailyTrend, setDailyTrend] = useState<TrendPoint[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<TrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showHospitalPerformance, setShowHospitalPerformance] = useState(true);

  const calculateStats = useCallback((data: PreAuthRecord[]): ReportStats => {
    const approved = data.filter((r) => ["approved", "referral_approved", "referral_accepted"].includes(r.status));
    const pending = data.filter((r) => ["pending", "pending_referral", "pending_authorization"].includes(r.status));
    const rejected = data.filter((r) => ["rejected", "referral_declined", "referral_expired"].includes(r.status));

    const totalRequested = data.reduce((sum, r) => sum + (r.requested_amount || 0), 0);
    const totalApproved = approved.reduce((sum, r) => sum + (r.approved_amount || 0), 0);
    const totalPending = pending.reduce((sum, r) => sum + (r.requested_amount || 0), 0);
    const totalRejected = rejected.reduce((sum, r) => sum + (r.rejected_amount || r.requested_amount || 0), 0);

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
      requestedAmount: totalRequested,
      approvedAmount: totalApproved,
      pendingAmount: totalPending,
      rejectedAmount: totalRejected,
      approvalRate: data.length > 0 ? (approved.length / data.length) * 100 : 0,
      rejectionRate: data.length > 0 ? (rejected.length / data.length) * 100 : 0,
      avgProcessingTime: avgTime,
      dailyVolume: dailyVol,
    };
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      let q = supabase.from("authorization_requests").select("*").order("created_at", { ascending: false });
      const mappedStatuses = preAuthStatusFilterMap[filters.statusFilter];
      if (mappedStatuses?.length === 1) {
        q = q.eq("status", mappedStatuses[0]);
      } else if (mappedStatuses?.length) {
        q = q.in("status", mappedStatuses);
      }
      if (filters.hospitalFilter !== "all") {
        const hospitalName = hospitals.find((h) => h.id === filters.hospitalFilter)?.name || filters.hospitalFilter;
        q = q.ilike("requesting_hospital", `%${hospitalName}%`);
      }
      const dateRange = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);
      if (dateRange.from) q = q.gte("created_at", dateRange.from.toISOString());
      if (dateRange.to) q = q.lte("created_at", dateRange.to.toISOString());

      const { data, error } = await q;
      if (error) throw error;

      const mappedRecords: PreAuthRecord[] = (data || []).map((item: any) => ({
        id: item.id,
        created_at: item.created_at,
        request_id: item.request_id || "",
        patient_name: item.patient_name || "",
        patient_phone: item.patient_phone || item.phone || item.phone_number || "",
        patient_email: item.patient_email || item.email || "",
        policy_number: item.policy_number || "",
        diagnosis: item.diagnosis || "",
        treatment: item.treatment || "",
        requesting_hospital: item.requesting_hospital || item.requesting_hospital_name || item.hospital_name || "",
        hospital_id: item.requesting_hospital_id || item.hospital_id,
        source: item.source || "Manual",
        authorization_code: item.authorization_code || "",
        status: item.status as RequestStatus,
        requested_amount: item.total_amount || item.requested_amount || 0,
        approved_amount: item.approved_tariff_amount || item.approved_amount || 0,
        rejected_amount: item.rejected_amount || 0,
        rejection_reason: item.rejection_reason || item.decision_reason || "",
        decision_reason: item.decision_reason || "",
        decided_at: item.decided_at,
        clinician: item.authorized_by_name || item.decided_by,
      }));

      const validRecords = mappedRecords.filter((r) => r.status !== "deferred");
      setRecords(validRecords);
      setStats(calculateStats(validRecords));
      setHospitalPerformance(calculateHospitalPerformance(validRecords));
      setDailyTrend(groupByDate(validRecords, "day"));
      setMonthlyTrend(groupByDate(validRecords, "month"));
    } catch (error) {
      console.error("Analytics fetch error:", error);
      toast.error(getErrorMessage(error, "Failed to load analytics data"));
    } finally {
      setIsLoading(false);
    }
  }, [filters, hospitals, calculateStats]);

  const fetchHospitals = useCallback(async () => {
    setLoadingHospitals(true);
    let allHospitals: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id,name,code")
        .order("name")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        toast.error(getErrorMessage(error, "Unable to load hospital filter"));
        setHospitals([]);
        setLoadingHospitals(false);
        return;
      }

      if (data && data.length > 0) {
        allHospitals = [...allHospitals, ...data];
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setHospitals(allHospitals);
    setLoadingHospitals(false);
  }, []);

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useTabVisibilityRefresh(fetchAnalytics);

  const exportExcel = async () => {
    setIsExporting(true);
    toast.info("Preparing Excel report…");

    try {
      const workbook = XLSX.utils.book_new();

      // ── SHEET 5: Pivot / Facts Data (Hidden) ────────────────────────────
      const pivotFacts: any[] = [];
      for (const r of records) {
        const created = r.created_at ? new Date(r.created_at) : null;
        const dayKey = created ? created.toISOString().slice(0, 10) : "";
        const monthKey = created
          ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`
          : "";

        pivotFacts.push({
          Date: created ? created.toLocaleDateString("en-GB") : "",
          DateISO: dayKey,
          MonthISO: monthKey,
          Year: created ? created.getFullYear() : "",
          Status: r.status,
          Hospital: r.requesting_hospital,
          Diagnosis: r.diagnosis,
          Treatment: r.treatment,
          Source: r.source,
          PayerOrPolicy: r.policy_number,
          AuthorizationCode: r.authorization_code,
          PatientName: r.patient_name,
          RequestedAmount: r.requested_amount || 0,
          ApprovedAmount: r.approved_amount || 0,
          RejectedAmount: (r as any).rejected_amount || 0,
          RejectionReason: r.rejection_reason || r.decision_reason || "",
          ProcessingHours: (() => {
            if (!r.decided_at || !r.created_at) return "";
            const createdMs = new Date(r.created_at).getTime();
            const decidedMs = new Date(r.decided_at).getTime();
            if (!Number.isFinite(createdMs) || !Number.isFinite(decidedMs)) return "";
            return (decidedMs - createdMs) / (1000 * 60 * 60);
          })(),
          ApprovedCount: r.status === "approved" ? 1 : 0,
          RejectedCount: r.status === "rejected" ? 1 : 0,
          PendingCount: r.status === "pending" ? 1 : 0,
          RequestedCount: 1,
        });
      }

      const pivotSheet = XLSX.utils.json_to_sheet(pivotFacts);
      pivotSheet["!cols"] = [
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 10 },
        { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
        { wch: 18 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
        { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
        { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }
      ];

      pivotSheet["!state"] = "hidden";
      XLSX.utils.book_append_sheet(workbook, pivotSheet, "Pivot Data (Hidden)");

      // ── SHEET 1: Detailed Data ───────────────────────────────────────────
      const detailsData = records.map((r, index) => ({
        "S/N": index + 1,
        "Date": r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "",
        "Request ID": r.request_id,
        "Patient Name": r.patient_name,
        "Patient Phone": r.patient_phone,
        "Patient Email": r.patient_email === "no-email@medicode.com" ? "No email provided" : r.patient_email,
        "Policy Number": r.policy_number,
        "Diagnosis": r.diagnosis,
        "Treatment": r.treatment,
        "Hospital": r.requesting_hospital,
        "Auth Code": r.authorization_code,
        "Status": (r.status || "").toUpperCase(),
        "Amount of Care per Request": r.requested_amount || 0,
        "Requested Amount": r.requested_amount || 0,
        "Approved Amount": r.approved_amount || 0,
        "Rejected Amount": r.rejected_amount || 0,
        "Decision Note": r.rejection_reason || r.decision_reason || "",
        "Clinician": r.clinician || "",
        "Created At": r.created_at || "",
        "Decided At": r.decided_at || "",
      }));

      const detailsSheet = XLSX.utils.json_to_sheet(detailsData);
      detailsSheet["!cols"] = [
        { wch: 6 },  // S/N
        { wch: 12 }, // Date
        { wch: 18 }, // Request ID
        { wch: 22 }, // Patient Name
        { wch: 16 }, // Patient Phone
        { wch: 24 }, // Patient Email
        { wch: 18 }, // Policy Number
        { wch: 20 }, // Diagnosis
        { wch: 20 }, // Treatment
        { wch: 28 }, // Hospital
        { wch: 16 }, // Auth Code
        { wch: 16 }, // Status
        { wch: 26 }, // Amount of Care per Request
        { wch: 18 }, // Requested Amount
        { wch: 18 }, // Approved Amount
        { wch: 18 }, // Rejected Amount
        { wch: 24 }, // Decision Note
        { wch: 18 }, // Clinician
        { wch: 16 }, // Created At
        { wch: 16 }  // Decided At
      ];
      XLSX.utils.book_append_sheet(workbook, detailsSheet, "Detailed Data");

      // ── Derived executive insights ───────────────────────────────────────
      const totalApproved = stats.approvedAmount || 0;
      const topHospitalByApproved =
        hospitalPerformance.length
          ? [...hospitalPerformance].sort((a, b) => b.approvedAmount - a.approvedAmount)[0]
          : null;
      const topHospitalShare =
        topHospitalByApproved && totalApproved > 0
          ? (topHospitalByApproved.approvedAmount / totalApproved) * 100
          : 0;

      const worstHospitalByRejectionRate =
        hospitalPerformance.length
          ? [...hospitalPerformance].sort((a, b) => b.rejectedAmount - a.rejectedAmount)[0]
          : null;

      const approvedVsRequestedDeltaPct =
        stats.requestedAmount > 0
          ? ((stats.approvedAmount - stats.requestedAmount) / stats.requestedAmount) * 100
          : 0;

      const commonInsight =
        hospitalPerformance.length >= 3
          ? (() => {
              const sorted = [...hospitalPerformance].sort((a, b) => b.totalCodes - a.totalCodes);
              const top3 = sorted.slice(0, 3);
              const top3Share =
                stats.totalCodes > 0 ? (top3.reduce((s, h) => s + h.totalCodes, 0) / stats.totalCodes) * 100 : 0;
              return top3Share;
            })()
          : 0;

      // ── SHEET 2: Executive Analytics Dashboard ───────────────────────────
      const executiveRows: any[] = [];
      executiveRows.push(["EXECUTIVE ANALYTICS DASHBOARD"]);
      executiveRows.push([]);

      executiveRows.push(["EXECUTIVE KPI SUMMARY"]);
      executiveRows.push(["KPI", "Value", "Trend / Note"]);

      const pushKPI = (kpi: string, value: any, note: string) => executiveRows.push([kpi, value, note]);

      pushKPI("Total Authorization Requests", stats.totalCodes.toLocaleString(), "Current filtered scope");
      pushKPI("Total Approved Requests", stats.approvedCodes.toLocaleString(), "Current filtered scope");
      pushKPI("Total Rejected Requests", stats.rejectedCodes.toLocaleString(), "Current filtered scope");
      pushKPI("Total Pending Requests", stats.pendingCodes.toLocaleString(), "Current filtered scope");

      pushKPI("Total Requested Amount", formatNaira(stats.requestedAmount), "NGN amounts" );
      pushKPI("Total Approved Amount", formatNaira(stats.approvedAmount), "NGN amounts" );
      pushKPI("Total Rejected Amount", formatNaira(stats.rejectedAmount), "NGN amounts" );

      pushKPI("Approval Rate", formatPercent(stats.approvalRate), "Approved / Total" );
      pushKPI("Rejection Rate", formatPercent(stats.rejectionRate), "Rejected / Total" );

      pushKPI("Average Approval Value", stats.approvedCodes > 0 ? formatNaira(stats.approvedAmount / stats.approvedCodes) : formatNaira(0), "Avg approved code value" );
      pushKPI("Average Claim Value", stats.totalCodes > 0 ? formatNaira(stats.requestedAmount / stats.totalCodes) : formatNaira(0), "Avg requested per code" );
      pushKPI("Average Daily Volume", `${stats.dailyVolume.toFixed(0)}/day`, "Based on unique request dates in range" );

      executiveRows.push([]);
      executiveRows.push(["FINANCIAL INSIGHTS"]);
      executiveRows.push(["Metric", "Value", "Interpretation"]);
      executiveRows.push(["Requested vs Approved", `${formatNaira(stats.approvedAmount)} / ${formatNaira(stats.requestedAmount)}`, approvedVsRequestedDeltaPct >= 0 ? "Approved amount is at or above requested" : "Approved amount is below requested (savings generated)" ]);
      executiveRows.push(["Approval Yield", stats.requestedAmount > 0 ? formatPercent((stats.approvedAmount / stats.requestedAmount) * 100) : "0.0%", "Approved / Requested" ]);
      executiveRows.push(["Financial Approval Rate", formatPercent(stats.approvalRate), "Proxy for approvals" ]);

      executiveRows.push([]);
      executiveRows.push(["HOSPITAL PERFORMANCE (TOP VIEW)"]);
      executiveRows.push(["Hospital", "Total Codes", "Approved Codes", "Rejected Codes", "Pending Codes", "Approved Amount", "Approval Rate"]);

      const top10 = [...hospitalPerformance]
        .sort((a, b) => b.approvedAmount - a.approvedAmount)
        .slice(0, 10);
      for (const h of top10) {
        executiveRows.push([
          h.hospital,
          h.totalCodes,
          h.approvedCodes,
          h.rejectedCodes,
          h.pendingCodes,
          formatNaira(h.approvedAmount),
          `${h.approvalRate.toFixed(1)}%`,
        ]);
      }

      executiveRows.push([]);
      executiveRows.push(["OPERATIONAL BOTTLENECKS"]);
      executiveRows.push(["Risk Type", "Hospital", "Value", "Why it matters"]);

      const highestPending = [...hospitalPerformance].sort((a, b) => b.pendingCodes - a.pendingCodes)[0];
      if (highestPending) {
        executiveRows.push([
          "Highest Pending Volume",
          highestPending.hospital,
          highestPending.pendingCodes,
          "Backlog indicator—pending requests remain unprocessed.",
        ]);
      }

      if (worstHospitalByRejectionRate) {
        executiveRows.push([
          "Largest Rejected Amount",
          worstHospitalByRejectionRate.hospital,
          formatNaira(worstHospitalByRejectionRate.rejectedAmount),
          "Higher rejection exposure—review reasons & decision workflow.",
        ]);
      }

      executiveRows.push([]);
      executiveRows.push(["EXECUTIVE INSIGHTS & COMMENTARY"]);
      executiveRows.push(["Insight"]);

      if (topHospitalByApproved) {
        executiveRows.push([
          `${topHospitalByApproved.hospital} contributed ${topHospitalShare.toFixed(1)}% of all approved amounts in this export scope.`
        ]);
      } else {
        executiveRows.push([`No hospital performance data available in this export scope.`]);
      }

      if (commonInsight) {
        executiveRows.push([`Three leading hospitals account for ~${commonInsight.toFixed(1)}% of total authorization volume.`]);
      }

      if (worstHospitalByRejectionRate) {
        executiveRows.push([`${worstHospitalByRejectionRate.hospital} has the largest rejected exposure in this snapshot. Focus on rejection reasons and pre-checks.`]);
      }

      const executiveSheet = XLSX.utils.aoa_to_sheet(executiveRows);
      executiveSheet["!cols"] = [
        { wch: 42 }, { wch: 22 }, { wch: 34 }
      ];
      XLSX.utils.book_append_sheet(workbook, executiveSheet, "Executive Analytics Dashboard");

      // ── SHEET 3: Hospital Performance Analysis ───────────────────────────
      const hospRows: any[] = [];
      hospRows.push(["HOSPITAL PERFORMANCE ANALYSIS"]);
      hospRows.push([]);
      hospRows.push(["Scorecard"]);
      hospRows.push([
        "Hospital",
        "Total Codes",
        "Approved Codes",
        "Rejected Codes",
        "Pending Codes",
        "Requested Amount",
        "Approved Amount",
        "Rejected Amount",
        "Approval Rate",
        "Average Authorization Value",
      ]);

      for (const h of [...hospitalPerformance].sort((a, b) => b.totalCodes - a.totalCodes)) {
        const avgAuthVal = h.totalCodes > 0 ? h.requestedAmount / h.totalCodes : 0;
        hospRows.push([
          h.hospital,
          h.totalCodes,
          h.approvedCodes,
          h.rejectedCodes,
          h.pendingCodes,
          formatNaira(h.requestedAmount),
          formatNaira(h.approvedAmount),
          formatNaira(h.rejectedAmount),
          `${h.approvalRate.toFixed(1)}%`,
          formatNaira(avgAuthVal),
        ]);
      }

      hospRows.push([]);
      hospRows.push(["Top 10 by Approval Rate"]);
      hospRows.push(["Rank", "Hospital", "Total Codes", "Approved Amount", "Approval Rate"]);
      const topByRate = [...hospitalPerformance].sort((a, b) => b.approvalRate - a.approvalRate).slice(0, 10);
      topByRate.forEach((h, i) => {
        hospRows.push([i + 1, h.hospital, h.totalCodes, formatNaira(h.approvedAmount), `${h.approvalRate.toFixed(1)}%`]);
      });

      hospRows.push([]);
      hospRows.push(["Bottom 10 by Approval Rate"]);
      hospRows.push(["Rank", "Hospital", "Total Codes", "Approved Amount", "Approval Rate"]);
      const bottomByRate = [...hospitalPerformance].sort((a, b) => a.approvalRate - b.approvalRate).slice(0, 10);
      bottomByRate.forEach((h, i) => {
        hospRows.push([i + 1, h.hospital, h.totalCodes, formatNaira(h.approvedAmount), `${h.approvalRate.toFixed(1)}%`]);
      });

      const hospSheet = XLSX.utils.aoa_to_sheet(hospRows);
      hospSheet["!cols"] = [
        { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 22 }
      ];
      XLSX.utils.book_append_sheet(workbook, hospSheet, "Hospital Performance Analysis");

      // ── SHEET 4: Trend Analysis ──────────────────────────────────────────
      const trendRows: any[] = [];
      trendRows.push(["TREND ANALYSIS"]);
      trendRows.push([]);

      trendRows.push(["Daily Trend (Approved / Rejected / Pending)"]);
      trendRows.push(["Date", "Approved", "Rejected", "Pending"]);
      for (const p of dailyTrend) {
        trendRows.push([p.date, p.approved, p.rejected, p.pending]);
      }

      trendRows.push([]);
      trendRows.push(["Monthly Financial Trend"]);
      trendRows.push(["Month", "Approved Amount", "Rejected Amount"]);
      for (const p of monthlyTrend) {
        trendRows.push([p.date, p.approvedAmount, p.rejectedAmount]);
      }

      trendRows.push([]);
      trendRows.push(["Simple Forecast (End-of-Month Projection)"]);
      trendRows.push(["Metric", "Forecast Value", "Method"]);

      const dailyValues = dailyTrend.slice(-7);
      const lastDaysCount = dailyValues.length;
      const lastApprovedSum = dailyValues.reduce((s, d) => s + (d.approved || 0), 0);
      const avgApprovedPerDay = lastDaysCount > 0 ? lastApprovedSum / lastDaysCount : 0;

      const lastApprovedAmountSum = dailyValues.reduce((s, d) => s + (d.approvedAmount || 0), 0);
      const avgApprovedAmountPerDay = lastDaysCount > 0 ? lastApprovedAmountSum / lastDaysCount : 0;

      const forecastVolume = avgApprovedPerDay * 30;
      const forecastApprovedAmount = avgApprovedAmountPerDay * 30;

      trendRows.push(["End-of-Month Volume (Projected)", Math.round(forecastVolume), "Avg of last 7 daily points x 30" ]);
      trendRows.push(["End-of-Month Approved Amount (Projected)", formatNaira(forecastApprovedAmount), "Avg of last 7 daily approved amounts x 30" ]);

      const trendSheet = XLSX.utils.aoa_to_sheet(trendRows);
      trendSheet["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(workbook, trendSheet, "Trend Analysis");

      // ── DOWNLOAD ──────────────────────────────────────────────────────────
      const selectedHospital =
        filters.hospitalFilter === "all"
          ? "All_Hospitals"
          : hospitals.find((h) => h.id === filters.hospitalFilter)?.name?.replace(/[^a-z0-9]+/gi, "_") || "Selected";

      XLSX.writeFile(
        workbook,
        `PreAuth_Executive_Analytics_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`
      );

      toast.success(`Exported ${records.length} records with Executive Analytics Dashboard`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(getErrorMessage(error, "Failed to export Excel report"));
    } finally {
      setIsExporting(false);
    }
  };

  if (normalizedRole !== "admin" && normalizedRole !== "finance" && normalizedRole !== "utilization_manager" && normalizedRole !== "nurse") {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-500">You do not have permission to view performance reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">

      {/* Filters */}
      <ReportFilters
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        hospitals={hospitals}
        loadingHospitals={loadingHospitals}
        onExport={exportExcel}
        isExporting={isExporting}
      />

      {/* KPI Stats */}
      <KPIStatsGrid stats={stats} isLoading={isLoading} />

      {/* Analytics Dashboard */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
            </div>
            <h2 className="text-lg font-black uppercase text-slate-900 tracking-wider">Analytics Dashboard</h2>
          </div>
          <button
            onClick={() => setShowHospitalPerformance(!showHospitalPerformance)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-50 transition-colors"
          >
            {showHospitalPerformance ? (
              <>
                <EyeOff className="w-4 h-4 text-slate-500" />
                Hide Hospital Performance
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 text-slate-500" />
                Show Hospital Performance
              </>
            )}
          </button>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatusDistributionChart stats={stats} />
          <MonthlyTrendChart data={monthlyTrend} />
        </div>

        {/* Hospital Performance */}
        {showHospitalPerformance && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            <HospitalPerformanceTable data={hospitalPerformance} />
          </div>
        )}
      </div>
    </div>
  );
}
