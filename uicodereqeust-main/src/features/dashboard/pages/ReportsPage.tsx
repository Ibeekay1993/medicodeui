import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { BarChart3, ShieldAlert, Eye, EyeOff, Loader2, RotateCw } from "lucide-react";
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
  getReportStatusPredicate,
  fetchAllReportPages,
  calculateReportStats,
  buildDateFilter,
  groupByDate,
  calculateHospitalPerformance,
  calculateApprovedAmount,
} from "@/lib/reports-helpers";

import ReportFilters from "@/components/reports/ReportFilters";
import KPIStatsGrid from "@/components/reports/KPIStatsGrid";
import StatusDistributionChart from "@/components/reports/StatusDistributionChart";

import MonthlyTrendChart from "@/components/reports/MonthlyTrendChart";
import HospitalPerformanceTable from "@/components/reports/HospitalPerformanceTable";
import UtilizationSlaAnalysis from "@/components/reports/UtilizationSlaAnalysis";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ReportResult {
  records: PreAuthRecord[];
  stats: ReportStats;
  hospitalPerformance: HospitalPerformance[];
  dailyTrend: TrendPoint[];
  monthlyTrend: TrendPoint[];
  utilizationManagerNames: Record<string, string>;
}

type ReportState =
  | { status: "INITIAL" }
  | { status: "LOADING"; filterKey: string }
  | { status: "SUCCESS_EMPTY"; filterKey: string; result: ReportResult; loadedAt: number }
  | { status: "SUCCESS_COMPLETE"; filterKey: string; result: ReportResult; loadedAt: number }
  | { status: "ERROR"; filterKey: string };

const reportErrorMessage = "The report could not be fully loaded. No report totals are available. Check your connection and retry.";

function makeFilterKey(filters: FilterState, hospitalName?: string) {
  return JSON.stringify([filters.statusFilter, filters.dateFilter, filters.startDate, filters.endDate, filters.hospitalFilter, hospitalName]);
}

function formatScopeDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatReportScope(filters: FilterState, hospitalName?: string) {
  const range = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);
  let dateLabel = "All available dates";
  if (range.from && range.to) {
    const from = formatScopeDate(range.from);
    const to = formatScopeDate(range.to);
    dateLabel = from === to ? from : `${from}–${to}`;
  } else if (range.from) {
    dateLabel = `From ${formatScopeDate(range.from)}`;
  } else if (range.to) {
    dateLabel = `Through ${formatScopeDate(range.to)}`;
  }

  const statusLabels: Record<string, string> = {
    all: "All statuses",
    pending: "Pending",
    pending_referral: "Pending Referral",
    referral_approved: "Referral Approved",
    referral_accepted: "Referral Accepted",
    pending_authorization: "Pending Authorization",
    approved: "Approved",
    partially_approved: "Partially Approved",
    rejected: "Rejected",
    referral_declined: "Referral Declined",
    referral_expired: "Referral Expired",
  };
  const statusLabel = statusLabels[filters.statusFilter] || "All statuses";
  const hospitalLabel = filters.hospitalFilter === "all" ? "All hospitals" : hospitalName || filters.hospitalFilter;
  return `Requests created: ${dateLabel} (local time) · Status: ${statusLabel} · Hospital: ${hospitalLabel}`;
}

export default function ReportsPage() {
  const { role, user } = useAuth();
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
  const [reportState, setReportState] = useState<ReportState>({ status: "INITIAL" });
  const [isExporting, setIsExporting] = useState(false);
  const [showHospitalPerformance, setShowHospitalPerformance] = useState(true);
  const requestGeneration = useRef(0);

  const selectedHospitalName = filters.hospitalFilter === "all"
    ? undefined
    : hospitals.find((hospital) => hospital.id === filters.hospitalFilter)?.name || filters.hospitalFilter;
  const currentFilterKey = makeFilterKey(filters, selectedHospitalName);
  const scopeLabel = formatReportScope(filters, selectedHospitalName);
  const visibleReportState = "filterKey" in reportState && reportState.filterKey !== currentFilterKey
    ? { status: "LOADING" as const, filterKey: currentFilterKey }
    : reportState;
  const currentResult = visibleReportState.status === "SUCCESS_EMPTY" || visibleReportState.status === "SUCCESS_COMPLETE"
    ? visibleReportState.result
    : null;
  const records = currentResult?.records || [];
  const stats = currentResult?.stats || defaultStats;
  const hospitalPerformance = currentResult?.hospitalPerformance || [];
  const dailyTrend = currentResult?.dailyTrend || [];
  const monthlyTrend = currentResult?.monthlyTrend || [];
  const utilizationManagerNames = currentResult?.utilizationManagerNames || {};

  const fetchAnalytics = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const filterSnapshot = { ...filters };
    const filterKey = makeFilterKey(filterSnapshot, selectedHospitalName);
    setReportState({ status: "LOADING", filterKey });

    try {
      const pageSize = 1000;
      const statusPredicate = getReportStatusPredicate(filterSnapshot.statusFilter);
      const dateRange = buildDateFilter(filterSnapshot.dateFilter, filterSnapshot.startDate, filterSnapshot.endDate);
      const allData = await fetchAllReportPages<any>(async ({ from, to }) => {
        let q = supabase.from("authorization_requests").select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });

        if (statusPredicate?.operator === "eq") q = q.eq("status", statusPredicate.value);
        else if (statusPredicate?.operator === "in") q = q.in("status", statusPredicate.values);
        if (filterSnapshot.hospitalFilter !== "all") q = q.ilike("hospital_name", `%${selectedHospitalName}%`);
        if (dateRange.from) q = q.gte("created_at", dateRange.from.toISOString());
        if (dateRange.to) q = q.lte("created_at", dateRange.to.toISOString());

        const { data, error } = await q.range(from, to);
        return { data, error };
      }, pageSize);

      const mappedRecords: PreAuthRecord[] = allData.map((item: any) => ({
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
        authorization_code: item.authorization_code ?? "",
        status: item.status as RequestStatus,
        approved_amount: calculateApprovedAmount(item),
        approved_items: Array.isArray(item.approved_items) ? item.approved_items : undefined,
        rejection_reason: item.rejection_reason || item.decision_reason || "",
        decision_reason: item.decision_reason || "",
        decided_at: item.decided_at,
        decided_by: item.decided_by,
        approved_by: item.approved_by,
        treatment_submitted_at: item.treatment_submitted_at,
        urgency: item.urgency,
        clinician: item.authorized_by_name || undefined,
        is_historical: Boolean(item.is_historical),
      }));

      const managerIds = Array.from(new Set(
        mappedRecords.flatMap((record) => [record.approved_by, record.decided_by]).filter((id): id is string => Boolean(id)),
      ));
      let managerNames: Record<string, string> = {};
      if (managerIds.length) {
        const { data: managers, error: managersError } = await supabase.rpc("rpc_get_utilization_manager_directory", { _user_ids: managerIds });
        if (managersError) {
          console.warn("Could not load utilization manager names for SLA report", managersError);
        } else {
          managerNames = Object.fromEntries((managers || []).map((manager) => [manager.user_id, manager.full_name]));
        }
      }

      const validRecords = mappedRecords.filter((r) => r.status !== "deferred");
      const currentYear = new Date().getFullYear();
      const currentYearRecords = validRecords.filter(r => new Date(r.created_at).getFullYear() === currentYear);
      const result: ReportResult = {
        records: validRecords,
        stats: calculateReportStats(validRecords),
        hospitalPerformance: calculateHospitalPerformance(validRecords),
        dailyTrend: groupByDate(validRecords, "day"),
        monthlyTrend: groupByDate(currentYearRecords, "month"),
        utilizationManagerNames: managerNames,
      };

      if (generation !== requestGeneration.current) return;
      setReportState({
        status: validRecords.length ? "SUCCESS_COMPLETE" : "SUCCESS_EMPTY",
        filterKey,
        result,
        loadedAt: Date.now(),
      });
    } catch (error) {
      console.error("Analytics fetch error:", error);
      if (generation === requestGeneration.current) setReportState({ status: "ERROR", filterKey });
    }
  }, [filters, selectedHospitalName]);

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

  const exportExcel = async (mode: "detailed" | "full" | "payment_advice" = "full") => {
    setIsExporting(true);
    const toastLabel = mode === "payment_advice"
      ? "Payment Advice Schedule"
      : mode === "full"
      ? "Premium Excel Dashboard"
      : "Detailed Data Export";
    toast.info(`Preparing ${toastLabel}…`);

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

      const currencyFormat = '"₦"#,##0.00';
      const percentFormat = '0.0"%"';
      let paymentAdviceRowCount = 0;

      if (mode === "payment_advice") {
        // Payment periods are based on decision/approval date, while the
        // analytics dashboard's date filter intentionally measures requests
        // by creation date. Query the payment schedule on its own date axis.
        const dateRange = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);
        const hospitalId = filters.hospitalFilter === "all" ? null : filters.hospitalFilter;
        let approvedRows: any[] = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
          let query = supabase
            .from("authorization_requests")
            .select("*")
            .in("status", ["approved", "partially_approved", "referral_approved", "referral_accepted", "authorization_approved"])
            .order("decided_at", { ascending: true })
            .order("id", { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (dateRange.from) query = query.gte("decided_at", dateRange.from.toISOString());
          if (dateRange.to) query = query.lte("decided_at", dateRange.to.toISOString());
          if (hospitalId) {
            query = query.or([
              `claiming_hospital_id.eq.${hospitalId}`,
              `referred_hospital_id.eq.${hospitalId}`,
              `requesting_hospital_id.eq.${hospitalId}`,
              `hospital_id.eq.${hospitalId}`,
            ].join(","));
          }
          const { data, error } = await query;
          if (error) throw error;
          if (!data?.length) break;
          approvedRows = approvedRows.concat(data);
          if (data.length < pageSize) break;
          page += 1;
        }
        const approvedRecords = approvedRows
          .map((item: any) => ({
            id: item.id,
            created_at: item.created_at,
            request_id: item.request_id || "",
            patient_name: item.patient_name || "",
            patient_phone: item.patient_phone || item.phone || item.phone_number || "",
            patient_email: item.patient_email || item.email || "",
            policy_number: item.policy_number || "",
            diagnosis: item.diagnosis || "",
            treatment: item.treatment || "",
            requesting_hospital: item.claiming_hospital_name || item.referred_hospital_name || item.requesting_hospital_name || item.hospital_name || "",
            hospital_id: item.claiming_hospital_id || item.referred_hospital_id || item.requesting_hospital_id || item.hospital_id,
            source: item.source || "Manual",
            authorization_code: item.authorization_code || "",
            status: item.status as RequestStatus,
            approved_amount: calculateApprovedAmount(item),
            approved_items: Array.isArray(item.approved_items) ? item.approved_items : [],
            source_total_amount: Number(item.total_amount) || 0,
            rejection_reason: item.rejection_reason || "",
            decision_reason: item.decision_reason || "",
            decided_at: item.decided_at || undefined,
            decided_by: item.decided_by,
            approved_by: item.approved_by,
            treatment_submitted_at: item.treatment_submitted_at,
            urgency: item.urgency,
            clinician: item.authorized_by_name || "",
          } as PreAuthRecord & { source_total_amount: number }))
          .sort((a, b) => (a.requesting_hospital || "").localeCompare(b.requesting_hospital || "") || new Date(a.decided_at || a.created_at).getTime() - new Date(b.decided_at || b.created_at).getTime());
        paymentAdviceRowCount = approvedRecords.length;

        if (approvedRecords.length === 0) {
          toast.warning("No approved requests found in the current filter scope to generate Payment Advice.");
          setIsExporting(false);
          return;
        }

        const wsPA = workbook.addWorksheet("Payment Advice Schedule", {
          views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
          properties: { tabColor: { argb: theme.success } },
        });

        wsPA.columns = [
          { header: "S/N", key: "sn", width: 8 },
          { header: "Approval Date", key: "date", width: 16 },
          { header: "Hospital / Provider", key: "hospital", width: 35 },
          { header: "Auth Code", key: "authCode", width: 22 },
          { header: "Request ID", key: "reqId", width: 20 },
          { header: "Enrollee / Patient", key: "patient", width: 25 },
          { header: "Policy Number", key: "policy", width: 20 },
          { header: "Diagnosis", key: "diagnosis", width: 30 },
          { header: "Approved NHIA Items (Code × Qty)", key: "treatment", width: 45 },
          { header: "Approved Amount (₦)", key: "appAmt", width: 24 },
          { header: "Authorized By", key: "clinician", width: 22 },
        ];

        wsPA.getRow(1).font = headerFont;
        wsPA.getRow(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF065F46" },
        };

        let totalPayableCents = 0;
        approvedRecords.forEach((r, idx) => {
          const amt = Number(r.approved_amount) || 0;
          totalPayableCents += Math.round(amt * 100);
          const approvedItems = (r.approved_items || []).filter((item: any) => item && !item.declined);
          const itemSummary = approvedItems.length
            ? approvedItems.map((item: any) => `${item.code || ""} ${item.name || ""} × ${Number(item.quantity || 1)} — ₦${Number(item.amount ?? (Number(item.unit_price || item.price || 0) * Number(item.quantity || 1))).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join("; ")
            : (r.treatment || "Approved item details unavailable");
          wsPA.addRow({
            sn: idx + 1,
            date: r.decided_at ? new Date(r.decided_at).toLocaleDateString("en-GB") : "MISSING DECISION DATE",
            hospital: r.requesting_hospital,
            authCode: r.authorization_code,
            reqId: r.request_id,
            patient: r.patient_name,
            policy: r.policy_number,
            diagnosis: r.diagnosis,
            treatment: itemSummary,
            appAmt: amt,
            clinician: r.clinician || "",
          });
        });

        wsPA.getColumn("appAmt").numFmt = currencyFormat;

        const totalRow = wsPA.addRow({
          sn: "",
          date: "",
          hospital: "TOTAL APPROVED PAYABLE",
          authCode: "",
          reqId: "",
          patient: "",
          policy: "",
          diagnosis: "",
          treatment: `${approvedRecords.length} Authorizations`,
          appAmt: totalPayableCents / 100,
          clinician: "",
        });
        totalRow.font = { bold: true, size: 12, color: { argb: "FF065F46" } };
        totalRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD1FAE5" },
        };
        totalRow.getCell("appAmt").numFmt = currencyFormat;

        const reconciliation = workbook.addWorksheet("Payment Advice Checks");
        reconciliation.columns = [
          { header: "Request ID", key: "requestId", width: 22 },
          { header: "Authorization Code", key: "authCode", width: 22 },
          { header: "Approved Amount (Schedule)", key: "scheduleAmount", width: 26 },
          { header: "Stored Approved Total", key: "storedAmount", width: 24 },
          { header: "Difference", key: "difference", width: 18 },
          { header: "Data Quality Issues", key: "issues", width: 60 },
        ];
        reconciliation.getRow(1).font = headerFont;
        reconciliation.getRow(1).fill = headerFill;
        for (const r of approvedRecords) {
          const issues = [
            !r.requesting_hospital && "Missing provider",
            !r.authorization_code && "Missing authorization code",
            !r.request_id && "Missing request ID",
            !r.patient_name && "Missing patient name",
            !r.policy_number && "Missing policy number",
            !r.diagnosis && "Missing diagnosis",
            !(r.approved_items || []).some((item: any) => item && !item.declined) && "Missing approved item details",
            !r.decided_at && "Missing decision date",
          ].filter(Boolean);
          const difference = Number(r.approved_amount) - r.source_total_amount;
          if (Math.abs(difference) >= 0.01) issues.push("Approved item sum differs from stored approved total");
          if (!issues.length) continue;
          reconciliation.addRow({
            requestId: r.request_id,
            authCode: r.authorization_code,
            scheduleAmount: r.approved_amount,
            storedAmount: r.source_total_amount,
            difference,
            issues: issues.join("; "),
          });
        }
        for (const column of ["scheduleAmount", "storedAmount", "difference"]) {
          reconciliation.getColumn(column).numFmt = currencyFormat;
        }
        if (reconciliation.rowCount === 1) {
          reconciliation.addRow({ issues: "No missing payment fields or amount differences found." });
        }
        reconciliation.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: reconciliation.rowCount, column: 6 },
        };

        wsPA.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: approvedRecords.length + 1, column: 11 },
        };
      } else {
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

      pushKPI("Total Approved Amount", stats.approvedAmount, "Verified from approved items (NGN)", true, false, theme.success);
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
          appAmt: h.approvedAmount,
          rate: h.approvalRate
        });
      }

      ws3.getColumn('appAmt').numFmt = currencyFormat;
      ws3.getColumn('rate').numFmt = percentFormat;

      // In-cell pseudo-chart for Hospital Approval Rate
      ws3.addConditionalFormatting({
        ref: `F2:F${Math.max(2, sortedHospitals.length + 1)}`,
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
        { header: "Approved Amount", key: "appAmt", width: 20 },
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
          appAmt: r.approved_amount || 0,
          authCode: r.authorization_code,
          note: r.rejection_reason || r.decision_reason || "",
          clinician: r.clinician || "",
        });
      }

      ws5.getColumn('appAmt').numFmt = currencyFormat;
      
      ws5.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, records.length), column: 12 }
      };
      }

      // ── DOWNLOAD ─────────────────────────────────────────────────────────
      const selectedHospital =
        filters.hospitalFilter === "all"
          ? "All_Hospitals"
          : hospitals.find((h) => h.id === filters.hospitalFilter)?.name?.replace(/[^a-z0-9]+/gi, "_") || "Selected";

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const filename = mode === "payment_advice"
          ? `Payment_Advice_Schedule_${selectedHospital}_${filters.dateFilter}_${new Date().toISOString().split("T")[0]}.xlsx`
        : mode === "full" 
        ? `PreAuth_Executive_Dashboard_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`
        : `PreAuth_Detailed_Data_${selectedHospital}_${new Date().toISOString().split("T")[0]}.xlsx`;
      
      saveAs(blob, filename);

      toast.success(
        mode === "payment_advice"
          ? `Exported Payment Advice Schedule (${paymentAdviceRowCount} approved claims, filtered by approval date)`
          : `Exported ${records.length} records (${mode === "full" ? "Premium Executive Dashboard" : "Detailed Data"})`
      );
    } catch (error) {
      console.error("Export error:", error);
      toast.error(getErrorMessage(error, "Failed to export Excel dashboard"));
    } finally {
      setIsExporting(false);
    }
  };

  if (normalizedRole !== "admin" && normalizedRole !== "finance" && normalizedRole !== "utilization_manager" && normalizedRole !== "utilization_manager_lead" && normalizedRole !== "nurse") {
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

      <div aria-label="Report scope" className="space-y-1 text-xs text-slate-600">
        <p className="font-medium">{scopeLabel}</p>
        <p>
          SLA metrics use this same filtered request set.
          {currentResult && (visibleReportState.status === "SUCCESS_EMPTY" || visibleReportState.status === "SUCCESS_COMPLETE") && (
            <span> Data loaded: {new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date(visibleReportState.loadedAt))} (local time).</span>
          )}
        </p>
      </div>

      {(visibleReportState.status === "INITIAL" || visibleReportState.status === "LOADING") && (
        <div role="status" aria-live="polite" className="flex min-h-24 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-brand-700" aria-hidden="true" />
          <span>Loading authorization report…</span>
        </div>
      )}

      {visibleReportState.status === "ERROR" && (
        <Alert variant="destructive" className="bg-white">
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Report unavailable</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{reportErrorMessage}</span>
            <Button type="button" variant="outline" onClick={() => void fetchAnalytics()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {visibleReportState.status === "SUCCESS_EMPTY" && (
        <div role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No authorization requests match the selected report filters.
        </div>
      )}

      {visibleReportState.status === "SUCCESS_COMPLETE" && currentResult && (
        <>
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
            <KPIStatsGrid stats={stats} isLoading={false} />
          </div>

          {(normalizedRole === "admin" || normalizedRole === "utilization_manager" || normalizedRole === "utilization_manager_lead") && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-250 fill-mode-both">
              <UtilizationSlaAnalysis
                records={records}
                managerNames={utilizationManagerNames}
                viewerId={user?.id}
                canSeeTeamPerformance={normalizedRole === "admin" || normalizedRole === "utilization_manager_lead"}
              />
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
