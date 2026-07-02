import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { BarChart3, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
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

    const totalRequested = data.reduce((sum, r) => sum + (Number(r.requested_amount) || 0), 0);
    const totalApproved = approved.reduce((sum, r) => sum + (Number(r.approved_amount) || 0), 0);
    const totalPending = pending.reduce((sum, r) => sum + (Number(r.requested_amount) || 0), 0);
    
    // For rejected amount, we should consider records where requested > approved, or explicit rejected_amount
    const totalRejected = data.reduce((sum, r) => {
      if (["pending", "pending_referral", "pending_authorization"].includes(r.status?.toLowerCase() || "")) {
        return sum;
      }
      const req = Number(r.requested_amount) || 0;
      const app = Number(r.approved_amount) || 0;
      const rejExplicit = Number(r.rejected_amount) || 0;
      if (rejExplicit > 0) return sum + rejExplicit;
      
      const calcRej = Math.max(0, req - app);
      return sum + calcRej;
    }, 0);

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
      let allData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      const mappedStatuses = preAuthStatusFilterMap[filters.statusFilter];
      const dateRange = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);

      while (hasMore) {
        let q = supabase.from("authorization_requests").select("*").order("created_at", { ascending: false });
        
        if (mappedStatuses?.length === 1) {
          q = q.eq("status", mappedStatuses[0]);
        } else if (mappedStatuses?.length) {
          q = q.in("status", mappedStatuses);
        }
        if (filters.hospitalFilter !== "all") {
          const hospitalName = hospitals.find((h) => h.id === filters.hospitalFilter)?.name || filters.hospitalFilter;
          q = q.ilike("requesting_hospital", `%${hospitalName}%`);
        }
        if (dateRange.from) q = q.gte("created_at", dateRange.from.toISOString());
        if (dateRange.to) q = q.lte("created_at", dateRange.to.toISOString());

        q = q.range(page * pageSize, (page + 1) * pageSize - 1);

        const { data, error } = await q;
        if (error) {
          console.error("Error fetching analytics page:", error);
          break;
        }

        if (data && data.length > 0) {
          allData = [...allData, ...data];
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      if (!mappedStatuses || mappedStatuses.length === 0 || mappedStatuses.includes("approved")) {
        page = 0;
        hasMore = true;
        while (hasMore) {
          let q = supabase.from("historical_codes").select("*").eq("record_type", "authorization").order("created_at", { ascending: false });
          
          if (filters.hospitalFilter !== "all") {
            const hospitalName = hospitals.find((h) => h.id === filters.hospitalFilter)?.name || filters.hospitalFilter;
            q = q.ilike("hospital_name", `%${hospitalName}%`);
          }
          if (dateRange.from) q = q.gte("legacy_creation_date", dateRange.from.toISOString().split("T")[0]);
          if (dateRange.to) q = q.lte("legacy_creation_date", dateRange.to.toISOString().split("T")[0]);

          q = q.range(page * pageSize, (page + 1) * pageSize - 1);

          const { data, error } = await q;
          if (error) {
            console.error("Error fetching historical codes:", error);
            break;
          }

          if (data && data.length > 0) {
            const mappedHistorical = data.map((h: any) => ({
              ...h,
              status: "approved",
              request_id: h.original_code,
              phone: h.raw_data?.patient_phone || "",
              email: h.raw_data?.patient_email || "",
              diagnosis: h.raw_data?.diagnosis || "",
              treatment: h.raw_data?.treatment || "",
              requesting_hospital: h.hospital_name,
              total_amount: h.raw_data?.requested_amount || 0,
              approved_amount: h.raw_data?.approved_amount || 0,
              created_at: h.legacy_creation_date ? new Date(h.legacy_creation_date).toISOString() : h.created_at,
              decided_at: h.legacy_creation_date ? new Date(h.legacy_creation_date).toISOString() : h.created_at,
            }));
            allData = [...allData, ...mappedHistorical];
            page++;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }
      }

      const mappedRecords: PreAuthRecord[] = (allData || []).map((item: any) => ({
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

      const currentYear = new Date().getFullYear();
      const currentYearRecords = validRecords.filter(r => new Date(r.created_at).getFullYear() === currentYear);
      setMonthlyTrend(groupByDate(currentYearRecords, "month"));
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

  const exportExcel = async (mode: "detailed" | "full" = "full") => {
    setIsExporting(true);
    toast.info(`Preparing ${mode === "full" ? "Premium Excel Dashboard" : "Detailed Data Export"}…`);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Medicode System";
      workbook.created = new Date();

      const theme = {
        primary: "FF1E3A8A", // Blue
        success: "FF10B981", // Green
        danger: "FFEF4444",  // Red
        warning: "FFF59E0B", // Amber
        bg: "FFF8FAFC",      // Light Gray
        text: "FF374151",    // Dark Gray
      };

      const headerFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: theme.primary },
      };

      const headerFont: ExcelJS.Font = {
        color: { argb: "FFFFFFFF" },
        bold: true,
        size: 12,
      };

      const currencyFormat = '"₦"#,##0';
      const percentFormat = '0.0"%"';

      // ── SHEETS 1-4 (Only in Full Mode) ───────────────────────────────────
      if (mode === "full") {
        // ── SHEET 1: Executive Summary ───────────────────────────────────────
        const ws1 = workbook.addWorksheet("Executive Summary", {
        views: [{ showGridLines: false }],
        properties: { tabColor: { argb: theme.primary } },
      });

      ws1.columns = [
        { width: 35 }, { width: 25 }, { width: 45 }
      ];

      ws1.addRow(["EXECUTIVE ANALYTICS DASHBOARD"]).font = { size: 16, bold: true, color: { argb: theme.primary } };
      ws1.addRow([]);
      
      const kpiHeader = ws1.addRow(["EXECUTIVE KPI SUMMARY", "", ""]);
      kpiHeader.font = headerFont;
      kpiHeader.fill = headerFill;
      ws1.mergeCells(`A${kpiHeader.number}:C${kpiHeader.number}`);

      const kpiSubHeader = ws1.addRow(["KPI", "Value", "Trend / Note"]);
      kpiSubHeader.font = { bold: true };
      kpiSubHeader.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };

      const pushKPI = (kpi: string, value: any, note: string, isCurrency = false, isPercent = false, colorArgb?: string) => {
        const row = ws1.addRow([kpi, value, note]);
        row.getCell(1).font = { bold: true };
        const valCell = row.getCell(2);
        valCell.font = { bold: true, size: 14, color: colorArgb ? { argb: colorArgb } : undefined };
        valCell.alignment = { horizontal: 'right' };
        if (isCurrency) valCell.numFmt = currencyFormat;
        if (isPercent) valCell.numFmt = percentFormat;
      };

      pushKPI("Total Authorization Requests", stats.totalCodes, "Current filtered scope");
      pushKPI("Total Approved Requests", stats.approvedCodes, "Current filtered scope", false, false, theme.success);
      pushKPI("Total Rejected Requests", stats.rejectedCodes, "Current filtered scope", false, false, theme.danger);
      pushKPI("Total Pending Requests", stats.pendingCodes, "Current filtered scope", false, false, theme.warning);
      ws1.addRow([]);

      const finHeader = ws1.addRow(["FINANCIAL INSIGHTS", "", ""]);
      finHeader.font = headerFont;
      finHeader.fill = headerFill;
      ws1.mergeCells(`A${finHeader.number}:C${finHeader.number}`);
      
      const finSubHeader = ws1.addRow(["Metric", "Value", "Interpretation"]);
      finSubHeader.font = { bold: true };
      finSubHeader.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };

      pushKPI("Total Requested Amount", stats.requestedAmount, "NGN amounts", true);
      pushKPI("Total Approved Amount", stats.approvedAmount, "NGN amounts", true, false, theme.success);
      pushKPI("Total Rejected Amount", stats.rejectedAmount, "NGN amounts", true, false, theme.danger);
      pushKPI("Approval Rate", stats.approvalRate, "Approved / Total Volume", false, true);
      pushKPI("Rejection Rate", stats.rejectionRate, "Rejected / Total Volume", false, true, theme.danger);

      // ── SHEET 2: Trend Analysis ──────────────────────────────────────────
      const ws2 = workbook.addWorksheet("Trend Analysis", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.success } },
      });

      ws2.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Total Volume", key: "total", width: 15 },
        { header: "Approved", key: "approved", width: 15 },
        { header: "Rejected", key: "rejected", width: 15 },
        { header: "Pending", key: "pending", width: 15 },
        { header: "Approval Rate", key: "rate", width: 18 },
      ];

      ws2.getRow(1).font = headerFont;
      ws2.getRow(1).fill = headerFill;

      for (const p of dailyTrend) {
        const total = (p.approved || 0) + (p.rejected || 0) + (p.pending || 0);
        const rate = total > 0 ? ((p.approved || 0) / total) * 100 : 0;
        ws2.addRow({
          date: p.date,
          total: total,
          approved: p.approved,
          rejected: p.rejected,
          pending: p.pending,
          rate: rate
        });
      }

      ws2.getColumn('rate').numFmt = percentFormat;
      
      // In-cell pseudo-chart for Trend Approval Rate
      ws2.addConditionalFormatting({
        ref: `F2:F${Math.max(2, dailyTrend.length + 1)}`,
        rules: [
          {
            type: 'dataBar',
            cfvo: [{ type: 'min' }, { type: 'max' }],
            color: { argb: theme.success },
            gradient: true,
          }
        ]
      });

      // ── SHEET 3: Hospital Performance ────────────────────────────────────
      const ws3 = workbook.addWorksheet("Hospital Performance", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.warning } },
      });

      ws3.columns = [
        { header: "Hospital", key: "hospital", width: 35 },
        { header: "Total Codes", key: "total", width: 15 },
        { header: "Approved Codes", key: "approved", width: 18 },
        { header: "Rejected Codes", key: "rejected", width: 18 },
        { header: "Requested Amount", key: "reqAmt", width: 22 },
        { header: "Approved Amount", key: "appAmt", width: 22 },
        { header: "Approval Rate", key: "rate", width: 18 },
      ];

      ws3.getRow(1).font = headerFont;
      ws3.getRow(1).fill = headerFill;

      const sortedHospitals = [...hospitalPerformance].sort((a, b) => b.totalCodes - a.totalCodes);
      
      for (const h of sortedHospitals) {
        ws3.addRow({
          hospital: h.hospital,
          total: h.totalCodes,
          approved: h.approvedCodes,
          rejected: h.rejectedCodes,
          reqAmt: h.requestedAmount,
          appAmt: h.approvedAmount,
          rate: h.approvalRate
        });
      }

      ws3.getColumn('reqAmt').numFmt = currencyFormat;
      ws3.getColumn('appAmt').numFmt = currencyFormat;
      ws3.getColumn('rate').numFmt = percentFormat;

      // In-cell pseudo-chart for Hospital Approval Rate
      ws3.addConditionalFormatting({
        ref: `G2:G${Math.max(2, sortedHospitals.length + 1)}`,
        rules: [
          {
            type: 'colorScale',
            cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 50 }, { type: 'num', value: 100 }],
            color: [{ argb: theme.danger }, { argb: theme.warning }, { argb: theme.success }]
          }
        ]
      });

      // ── SHEET 4: Clinical Insights ───────────────────────────────────────
      const ws4 = workbook.addWorksheet("Clinical Insights", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.danger } },
      });

      ws4.columns = [
        { header: "Diagnosis", key: "diagnosis", width: 40 },
        { header: "Count", key: "count", width: 15 },
        { header: "% of Total", key: "pct", width: 15 },
      ];

      ws4.getRow(1).font = headerFont;
      ws4.getRow(1).fill = headerFill;

      const diagMap: Record<string, number> = {};
      for (const r of records) {
        const d = r.diagnosis || "Unknown";
        diagMap[d] = (diagMap[d] || 0) + 1;
      }
      const sortedDiags = Object.entries(diagMap).sort((a, b) => b[1] - a[1]);

      for (const [diag, count] of sortedDiags) {
        ws4.addRow({
          diagnosis: diag,
          count: count,
          pct: stats.totalCodes > 0 ? (count / stats.totalCodes) * 100 : 0
        });
      }

      ws4.getColumn('pct').numFmt = percentFormat;

        ws4.addConditionalFormatting({
          ref: `B2:B${Math.max(2, sortedDiags.length + 1)}`,
          rules: [
            {
              type: 'dataBar',
              cfvo: [{ type: 'min' }, { type: 'max' }],
              color: { argb: theme.primary },
              gradient: true,
            }
          ]
        });
      }

      // ── SHEET 5: Detailed Data (Always Included) ─────────────────────────
      const ws5 = workbook.addWorksheet("Detailed Data", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.bg } },
      });

      ws5.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Request ID", key: "reqId", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Hospital", key: "hospital", width: 35 },
        { header: "Patient Name", key: "patient", width: 25 },
        { header: "Policy Number", key: "policy", width: 20 },
        { header: "Diagnosis", key: "diagnosis", width: 30 },
        { header: "Treatment", key: "treatment", width: 30 },
        { header: "Requested Amount", key: "reqAmt", width: 20 },
        { header: "Approved Amount", key: "appAmt", width: 20 },
        { header: "Rejected Amount", key: "rejAmt", width: 20 },
        { header: "Auth Code", key: "authCode", width: 20 },
        { header: "Decision Note", key: "note", width: 40 },
        { header: "Clinician", key: "clinician", width: 20 },
      ];

      ws5.getRow(1).font = headerFont;
      ws5.getRow(1).fill = headerFill;

      for (const r of records) {
        ws5.addRow({
          date: r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "",
          reqId: r.request_id,
          status: (r.status || "").toUpperCase(),
          hospital: r.requesting_hospital,
          patient: r.patient_name,
          policy: r.policy_number,
          diagnosis: r.diagnosis,
          treatment: r.treatment,
          reqAmt: r.requested_amount || 0,
          appAmt: r.approved_amount || 0,
          rejAmt: r.rejected_amount || 0,
          authCode: r.authorization_code,
          note: r.rejection_reason || r.decision_reason || "",
          clinician: r.clinician || "",
        });
      }

      ws5.getColumn('reqAmt').numFmt = currencyFormat;
      ws5.getColumn('appAmt').numFmt = currencyFormat;
      ws5.getColumn('rejAmt').numFmt = currencyFormat;
      
      ws5.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, records.length), column: 14 }
      };

      // ── DOWNLOAD ─────────────────────────────────────────────────────────
      const selectedHospital =
        filters.hospitalFilter === "all"
          ? "All_Hospitals"
          : hospitals.find((h) => h.id === filters.hospitalFilter)?.name?.replace(/[^a-z0-9]+/gi, "_") || "Selected";

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = mode === "full" 
        ? `PreAuth_Executive_Dashboard_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`
        : `PreAuth_Detailed_Data_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`;
      
      saveAs(blob, filename);

      toast.success(`Exported ${records.length} records (${mode === "full" ? "Premium Executive Dashboard" : "Detailed Data"})`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(getErrorMessage(error, "Failed to export Excel dashboard"));
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
    <div className="space-y-6 max-w-full overflow-x-hidden pb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Filters */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 fill-mode-both">
        <ReportFilters
          filters={filters}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          hospitals={hospitals}
          loadingHospitals={loadingHospitals}
          onExport={exportExcel}
          isExporting={isExporting}
        />
      </div>

      {/* KPI Stats */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
        <KPIStatsGrid stats={stats} isLoading={isLoading} />
      </div>

      {/* Analytics Dashboard */}
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 fill-mode-both">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Analytics Dashboard</h2>
              <p className="text-xs font-semibold text-slate-400">Deep dive into financial and operational metrics</p>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatusDistributionChart stats={stats} />
          <MonthlyTrendChart data={monthlyTrend} />
        </div>

        {/* Hospital Performance Toggle & Section */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowHospitalPerformance(!showHospitalPerformance)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 hover:shadow transition-all group"
            >
              {showHospitalPerformance ? (
                <>
                  <EyeOff className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" />
                  Hide Hospital Performance
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  Show Hospital Performance
                </>
              )}
            </button>
          </div>
          {showHospitalPerformance && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
              <HospitalPerformanceTable data={hospitalPerformance} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
