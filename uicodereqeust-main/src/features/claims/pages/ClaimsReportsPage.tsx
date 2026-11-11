import { useCallback, useEffect, useMemo, useState } from "react";
import type * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";
import { ClaimsService } from "../services/claimsService";
import { Button } from "@/components/ui/button";
import { BrandSpinner } from "@/components/BrandSpinner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HospitalSearchSelect } from "@/components/ui/HospitalSearchSelect";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { ClaimStatusMetricCard } from "../components/ClaimStatusMetricCard";

const money = (value: unknown) => `₦${Number(value || 0).toLocaleString()}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function normalizeStatus(status?: string | null) {
  return String(status || "pending").toLowerCase().replace(/\s+/g, "_");
}

function statusBucket(status?: string | null): "pending" | "approved" | "rejected" | "contested" | "other" {
  const normalized = normalizeStatus(status);
  if (["submitted", "pending", "under_investigation", "under_review", "pending_audit", "audit"].includes(normalized)) return "pending";
  if (["approved", "partially_approved"].includes(normalized)) return "approved";
  if (["contested", "under_contest", "paid"].includes(normalized)) return "contested";
  if (["rejected", "declined", "denied"].includes(normalized)) return "rejected";
  return "other";
}

function matchesStatusFilter(rowStatus: string | null | undefined, filter: string): boolean {
  if (!filter || filter === "all") return true;
  const normalized = normalizeStatus(rowStatus);
  if (normalized === filter) return true;
  if (filter === "pending" && statusBucket(rowStatus) === "pending") return true;
  if (filter === "approved" && (normalized === "approved" || normalized === "partially_approved")) return true;
  if (filter === "contested" && statusBucket(rowStatus) === "contested") return true;
  if (filter === "rejected" && statusBucket(rowStatus) === "rejected") return true;
  return false;
}

const STATUS_PILL_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partially_approved: "bg-sky-50 text-sky-700 border-sky-200",
  paid: "bg-purple-50 text-purple-700 border-purple-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  contested: "bg-amber-50 text-amber-700 border-amber-200",
  under_contest: "bg-amber-50 text-amber-700 border-amber-200",
  submitted: "bg-slate-100 text-slate-700 border-slate-200",
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  under_review: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function ClaimsReportsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [hospitalId, setHospitalId] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [reconRows, setReconRows] = useState<any[]>([]);

  const statusMetrics = useMemo(() => {
    const term = search.toLowerCase();
    const rowsForMetrics = rows.filter((row) =>
      !term ||
      `${row.claim_number || ""} ${row.patient_name || ""} ${row.policy_number || ""} ${row.auth_code || ""} ${row.hospital_name || ""}`
        .toLowerCase()
        .includes(term)
    );

    const metrics = {
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
      contested: { count: 0, amount: 0 },
    };

    for (const row of rowsForMetrics) {
      const bucket = statusBucket(row.status);
      const amt = Number(row.approved_amount || row.total_amount || row.original_amount || 0);
      if (bucket in metrics) {
        metrics[bucket as keyof typeof metrics].count += 1;
        metrics[bucket as keyof typeof metrics].amount += amt;
      }
    }
    return metrics;
  }, [rows, search]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return rows.filter((row) => {
      const matchesSearch = !term ||
        `${row.claim_number || ""} ${row.patient_name || ""} ${row.policy_number || ""} ${row.auth_code || ""} ${row.hospital_name || ""}`
          .toLowerCase()
          .includes(term);
      const matchesStatus = matchesStatusFilter(row.status, status);
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, status]);

  const totals = useMemo(() => ({
    count: filtered.length,
    original: filtered.reduce((sum, row) => sum + Number(row.original_amount || row.total_amount || 0), 0),
    approved: filtered.reduce((sum, row) => sum + Number(row.approved_amount || 0), 0),
    declined: filtered.reduce((sum, row) => sum + Number(row.declined_amount || 0), 0),
  }), [filtered]);

  const {
    page,
    setPage,
    pageSize,
    totalPages,
    pageItems: paginatedRows,
    start,
    end,
    total,
  } = useDataPagination(filtered, 12);

  const hasActiveFilters = status !== "all" || hospitalId !== "all" || Boolean(startDate) || Boolean(endDate) || Boolean(search);

  const resetFilters = () => {
    setStatus("all");
    setHospitalId("all");
    setStartDate("");
    setEndDate("");
    setSearch("");
  };

  useEffect(() => {
    setPage(1);
  }, [status, hospitalId, startDate, endDate, search, setPage]);

  const loadHospitals = useCallback(async () => {
    setLoadingHospitals(true);
    try {
      const allHospitals = await ClaimsService.getHospitalsList();
      setHospitals(allHospitals);
    } catch (error) {
      console.error("Error fetching hospitals:", error);
    } finally {
      setLoadingHospitals(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);
      const data = await ClaimsService.generateClaimsReportExport({
        _status: "all",
        _hospital_id: hospitalId === "all" ? null : hospitalId,
        _from: startDate ? new Date(startDate).toISOString() : null,
        _to: end ? end.toISOString() : null,
      });
      setRows(data || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Claims report failed", description: error.message });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endDate, hospitalId, startDate, toast]);

  const setPresetRange = (preset: "month" | "quarter" | "year") => {
    const now = new Date();
    const start = new Date(now);
    if (preset === "month") start.setDate(1);
    if (preset === "quarter") start.setMonth(now.getMonth() - 2, 1);
    if (preset === "year") start.setMonth(0, 1);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
  };

  const loadReconciliation = async () => {
    const end = endDate ? new Date(endDate) : null;
    if (end) end.setHours(23, 59, 59, 999);
    try {
      const data = await ClaimsService.generateClaimsReconciliationReport({
        _hospital_id: hospitalId === "all" ? null : hospitalId,
        _from: startDate ? new Date(startDate).toISOString() : null,
        _to: end ? end.toISOString() : null,
      });
      setReconRows(data || []);
      return data || [];
    } catch (error: any) {
      toast({ variant: "destructive", title: "Reconciliation failed", description: error.message });
      return [];
    }
  };

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "No claims to export", description: "Adjust the filters and try again." });
      return;
    }
    const headers = [
      "Date",
      "Submitted Date",
      "Claim Number",
      "Hospital",
      "Patient",
      "Policy Number",
      "Authorization Code",
      "Status",
      "Original Amount",
      "Approved Amount",
      "Declined Amount",
      "Current Total",
      "Payment Note",
      "Paid At",
      "Audit Note",
    ];
    const body = filtered.map((row) => [
      row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "",
      row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "",
      row.claim_number,
      row.hospital_name,
      row.patient_name,
      row.policy_number,
      row.auth_code,
      row.status,
      row.original_amount,
      row.approved_amount,
      row.declined_amount,
      row.total_amount,
      row.payment_note,
      row.paid_at ? new Date(row.paid_at).toLocaleString() : "",
      row.audit_note,
    ]);
    const csv = [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RonsbergerHMO_Claims_Report_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = async () => {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "No claims to export", description: "Adjust the filters and try again." });
      return;
    }

    try {
      toast({ title: "Preparing export", description: "Generating claims report…" });

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Ronsberger HMO Clinical System";
      workbook.created = new Date();

      const theme = {
        primary: "FF1E3A8A",
        success: "FF10B981",
        danger: "FFEF4444",
        warning: "FFF59E0B",
        bg: "FFF8FAFC",
        text: "FF374151",
      };

      const headerFill: ExcelJS.FillPattern = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: theme.primary },
      };

      const headerFont: Partial<ExcelJS.Font> = {
        color: { argb: "FFFFFFFF" },
        bold: true,
        size: 12,
      };

      const currencyFormat = '"₦"#,##0';

      // ── SHEET 1: Executive Summary ───────────────────────────────────────
      const ws1 = workbook.addWorksheet("Executive Summary", {
        views: [{ showGridLines: false }],
        properties: { tabColor: { argb: theme.primary } },
      });

      ws1.columns = [{ width: 35 }, { width: 25 }, { width: 45 }];

      ws1.addRow(["CLAIMS EXECUTIVE DASHBOARD"]).font = { size: 16, bold: true, color: { argb: theme.primary } };
      ws1.addRow([]);

      const kpiHeader = ws1.addRow(["SUMMARY KPI", "", ""]);
      kpiHeader.font = headerFont;
      kpiHeader.fill = headerFill;
      ws1.mergeCells(`A${kpiHeader.number}:C${kpiHeader.number}`);

      const kpiSubHeader = ws1.addRow(["Metric", "Value", "Notes"]);
      kpiSubHeader.font = { bold: true };
      kpiSubHeader.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };

      const pushKPI = (kpi: string, value: any, note: string, isCurrency = false, colorArgb?: string) => {
        const row = ws1.addRow([kpi, value, note]);
        row.getCell(1).font = { bold: true };
        const valCell = row.getCell(2);
        valCell.font = { bold: true, size: 14, color: colorArgb ? { argb: colorArgb } : undefined };
        valCell.alignment = { horizontal: 'right' };
        if (isCurrency) valCell.numFmt = currencyFormat;
      };

      pushKPI("Total Claims", totals.count, "Number of claims matching filters");
      pushKPI("Original Value", totals.original, "Total submitted value", true);
      pushKPI("Approved Value", totals.approved, "Total approved for payment", true, theme.success);
      pushKPI("Declined / Savings", totals.declined, "Total declined or adjusted", true, theme.danger);

      ws1.addRow([]);
      const metaHeader = ws1.addRow(["REPORT METADATA", "", ""]);
      metaHeader.font = headerFont;
      metaHeader.fill = headerFill;
      ws1.mergeCells(`A${metaHeader.number}:C${metaHeader.number}`);
      ws1.addRow(["Generated", new Date().toLocaleString(), ""]);
      ws1.addRow(["Status Filter", status, ""]);
      ws1.addRow(["Hospital", hospitalId === "all" ? "All Hospitals" : hospitals.find((h) => h.id === hospitalId)?.name || hospitalId, ""]);
      ws1.addRow(["Date Range", `${startDate || "All time"} to ${endDate || "All time"}`, ""]);

      // ── SHEET 2: Claims Analysis (Visual) ────────────────────────────────
      const ws2 = workbook.addWorksheet("Claims Analysis", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.warning } },
      });

      ws2.columns = [
        { header: "Hospital", key: "hospital", width: 35 },
        { header: "Total Value", key: "total", width: 20 },
        { header: "Approved Value", key: "approved", width: 20 },
        { header: "Declined Value", key: "declined", width: 20 },
      ];

      ws2.getRow(1).font = headerFont;
      ws2.getRow(1).fill = headerFill;

      const hospData: Record<string, { total: number; approved: number; declined: number }> = {};
      for (const row of filtered) {
        const h = row.hospital_name || "Unknown";
        if (!hospData[h]) hospData[h] = { total: 0, approved: 0, declined: 0 };
        hospData[h].total += Number(row.total_amount) || 0;
        hospData[h].approved += Number(row.approved_amount) || 0;
        hospData[h].declined += Number(row.declined_amount) || 0;
      }

      const hospArr = Object.entries(hospData).sort((a, b) => b[1].total - a[1].total);
      for (const [name, stats] of hospArr) {
        ws2.addRow({
          hospital: name,
          total: stats.total,
          approved: stats.approved,
          declined: stats.declined
        });
      }

      ws2.getColumn('total').numFmt = currencyFormat;
      ws2.getColumn('approved').numFmt = currencyFormat;
      ws2.getColumn('declined').numFmt = currencyFormat;

      // ── SHEET 3: Detailed Data ───────────────────────────────────────────
      const ws3 = workbook.addWorksheet("Detailed Data", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.bg } },
      });

      ws3.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Submitted Date", key: "subDate", width: 15 },
        { header: "Claim Number", key: "claimNum", width: 20 },
        { header: "Hospital", key: "hospital", width: 35 },
        { header: "Patient", key: "patient", width: 25 },
        { header: "Policy Number", key: "policy", width: 20 },
        { header: "Auth Code", key: "authCode", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Original Amount", key: "origAmt", width: 20 },
        { header: "Approved Amount", key: "appAmt", width: 20 },
        { header: "Declined Amount", key: "decAmt", width: 20 },
        { header: "Current Total", key: "totalAmt", width: 20 },
        { header: "Payment Ref", key: "payRef", width: 25 },
        { header: "Paid At", key: "paidAt", width: 20 },
        { header: "Audit Note", key: "auditNote", width: 40 },
      ];

      ws3.getRow(1).font = headerFont;
      ws3.getRow(1).fill = headerFill;

      for (const row of filtered) {
        ws3.addRow({
          date: row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "",
          subDate: row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "",
          claimNum: row.claim_number,
          hospital: row.hospital_name,
          patient: row.patient_name,
          policy: row.policy_number,
          authCode: row.auth_code,
          status: row.status,
          origAmt: row.original_amount,
          appAmt: row.approved_amount,
          decAmt: row.declined_amount,
          totalAmt: row.total_amount,
          payRef: row.payment_reference,
          paidAt: row.paid_at ? new Date(row.paid_at).toLocaleString() : "",
          auditNote: row.audit_note,
        });
      }

      ws3.getColumn('origAmt').numFmt = currencyFormat;
      ws3.getColumn('appAmt').numFmt = currencyFormat;
      ws3.getColumn('decAmt').numFmt = currencyFormat;
      ws3.getColumn('totalAmt').numFmt = currencyFormat;

      ws3.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, filtered.length), column: 15 }
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `RonsbergerHMO_Claims_Dashboard_${Date.now()}.xlsx`);
      toast({ title: "Export Complete", description: "Your claims dashboard has been downloaded." });

    } catch (error) {
      console.error("Export error:", error);
      toast({ variant: "destructive", title: "Export Failed", description: "There was an error generating the Excel file." });
    }
  };

  const exportReconciliationXLSX = async () => {
    const rows = reconRows.length ? reconRows : await loadReconciliation();
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "No reconciliation data", description: "No matched authorization, claim, or payment rows were found." });
      return;
    }
    
    try {
      toast({ title: "Preparing Export", description: "Generating reconciliation report..." });
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Ronsberger HMO Clinical System";
      
      const theme = { primary: "FF1E3A8A", success: "FF10B981", danger: "FFEF4444", bg: "FFF8FAFC" };
      const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: theme.primary } };
      const headerFont: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true, size: 12 };
      const currencyFormat = '"₦"#,##0';

      const ws = workbook.addWorksheet("Reconciliation", {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
        properties: { tabColor: { argb: theme.bg } },
      });

      ws.columns = [
        { header: "Hospital", key: "hospital", width: 35 },
        { header: "Patient", key: "patient", width: 25 },
        { header: "Policy Number", key: "policy", width: 20 },
        { header: "Auth Code", key: "authCode", width: 20 },
        { header: "Authorized Amount", key: "authAmt", width: 20 },
        { header: "Claim Number", key: "claimNum", width: 20 },
        { header: "Claimed Amount", key: "claimAmt", width: 20 },
        { header: "Approved Amount", key: "appAmt", width: 20 },
        { header: "Paid Amount", key: "paidAmt", width: 20 },
        { header: "Outstanding Balance", key: "balAmt", width: 20 },
        { header: "Status", key: "status", width: 15 },
      ];

      ws.getRow(1).font = headerFont;
      ws.getRow(1).fill = headerFill;

      for (const row of rows) {
        ws.addRow({
          hospital: row.hospital_name,
          patient: row.patient_name,
          policy: row.policy_number,
          authCode: row.auth_code,
          authAmt: row.authorized_amount,
          claimNum: row.claim_number,
          claimAmt: row.claimed_amount,
          appAmt: row.approved_amount,
          paidAmt: row.paid_amount,
          balAmt: row.outstanding_balance,
          status: row.claim_status,
        });
      }

      ws.getColumn('authAmt').numFmt = currencyFormat;
      ws.getColumn('claimAmt').numFmt = currencyFormat;
      ws.getColumn('appAmt').numFmt = currencyFormat;
      ws.getColumn('paidAmt').numFmt = currencyFormat;
      ws.getColumn('balAmt').numFmt = currencyFormat;

      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length), column: 11 } };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `RonsbergerHMO_Claims_Reconciliation_${Date.now()}.xlsx`);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Export Failed", description: "Failed to generate reconciliation Excel file." });
    }
  };

  return (
    <div className="max-w-full space-y-4 overflow-x-hidden pb-12">
      {/* ── Unified Compact Action & Filter Toolbar ────────────────── */}
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3.5 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Filter className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold text-slate-900">Claims Filters</span>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-7 gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <RotateCcw className="h-3 w-3 text-slate-400" />
                  Reset
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                aria-label="Refresh claims data"
                className="h-9 w-9 shrink-0 rounded-lg border-slate-200 bg-white p-0 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                onClick={() => void loadReport()}
                title="Refresh report"
                disabled={loading}
              >
                {loading ? <BrandSpinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-9 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Export Reports
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <DropdownMenuItem onClick={exportCSV} className="cursor-pointer rounded-lg py-2 text-xs font-semibold">
                    Download CSV (Claims Ledger)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportXLSX} className="cursor-pointer rounded-lg py-2 text-xs font-semibold">
                    Download Excel (Executive Summary & Data)
                  </DropdownMenuItem>
                  <div className="my-1 h-px bg-slate-100" />
                  <DropdownMenuItem onClick={exportReconciliationXLSX} className="cursor-pointer rounded-lg py-2 text-xs font-semibold">
                    Reconciliation Report (Excel)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>


          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
            <div className="relative min-w-0 md:col-span-2 xl:col-span-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                aria-label="Search claims for reports"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search claim, patient, policy, auth code..."
                className="h-10 rounded-lg border-slate-200 bg-white pl-10 text-sm"
              />
            </div>
            <div className="min-w-0 xl:col-span-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger aria-label="Filter claims by status" className="h-10 w-full rounded-lg border-slate-200 bg-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { label: "All Statuses", value: "all" },
                    { label: "Submitted", value: "submitted" },
                    { label: "Under Review", value: "under_review" },
                    { label: "Approved", value: "approved" },
                    { label: "Partially Approved", value: "partially_approved" },
                    { label: "Paid", value: "paid" },
                    { label: "Rejected", value: "rejected" },
                    { label: "Contested", value: "contested" },
                  ].map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 xl:col-span-3">
              <HospitalSearchSelect
                uniqueHospitals={hospitals}
                selectedHospitalId={hospitalId}
                onHospitalChange={setHospitalId}
                placeholder={loadingHospitals ? "Loading hospitals..." : "All Network Hospitals"}
                className="h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white text-sm"
              />
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:col-span-2 xl:col-span-3">
              <Input
                aria-label="Start date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white text-xs"
              />
              <Input
                aria-label="End date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2 xl:col-span-12">
              <span className="mr-1 text-xs font-semibold text-slate-500">Date presets:</span>
              <Button type="button" variant="outline" onClick={() => setPresetRange("month")} className="h-8 rounded-lg border-slate-200 text-xs font-medium">
                This Month
              </Button>
              <Button type="button" variant="outline" onClick={() => setPresetRange("quarter")} className="h-8 rounded-lg border-slate-200 text-xs font-medium">
                Quarter
              </Button>
              <Button type="button" variant="outline" onClick={() => setPresetRange("year")} className="h-8 rounded-lg border-slate-200 text-xs font-medium">
                Year
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Status Metrics Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            key: "pending",
            label: "Pending Audits",
            count: statusMetrics.pending.count,
            amount: statusMetrics.pending.amount,
            Icon: AlertCircle,
            iconBg: "bg-amber-50 text-amber-600 border border-amber-200",
            activeBorder: "ring-2 ring-amber-500",
          },
          {
            key: "approved",
            label: "Approved",
            count: statusMetrics.approved.count,
            amount: statusMetrics.approved.amount,
            Icon: CheckCircle2,
            iconBg: "bg-emerald-50 text-emerald-600 border border-emerald-200",
            activeBorder: "ring-2 ring-emerald-500",
          },
          {
            key: "rejected",
            label: "Rejected",
            count: statusMetrics.rejected.count,
            amount: statusMetrics.rejected.amount,
            Icon: XCircle,
            iconBg: "bg-rose-50 text-rose-600 border border-rose-200",
            activeBorder: "ring-2 ring-rose-500",
          },
          {
            key: "contested",
            label: "Contested",
            count: statusMetrics.contested.count,
            amount: statusMetrics.contested.amount,
            Icon: Wallet,
            iconBg: "bg-blue-50 text-blue-600 border border-blue-200",
            activeBorder: "ring-2 ring-blue-500",
          },
        ].map(({ key, label, count, amount, Icon, iconBg, activeBorder }) => {
          const isSelected = status === key;
          return (
            <ClaimStatusMetricCard
              key={label}
              label={label}
              count={count}
              value={money(amount)}
              Icon={Icon}
              iconBg={iconBg}
              activeBorder={activeBorder}
              selected={isSelected}
              onSelect={() => setStatus((prev) => (prev === key ? "all" : key))}
            />
          );
        })}
      </div>

      {/* ── Operational Claims Ledger Table ───────────────────────── */}
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Operational Claims Ledger</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Detailed line registry for auditing, payment validation, and dispute analysis.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-600">
            {filtered.length} matching claims · {money(totals.original)} original value
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th scope="col" className="p-3 pl-4">Date & Ref</th>
                <th scope="col" className="p-3">Patient & Policy</th>
                <th scope="col" className="p-3">Hospital Facility</th>
                <th scope="col" className="p-3">Auth Code</th>
                <th scope="col" className="p-3 text-right">Original Value</th>
                <th scope="col" className="p-3 text-right">Approved Value</th>
                <th scope="col" className="p-3 text-center">Status</th>
                <th scope="col" className="p-3 pr-4">Audit / Settlement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedRows.map((row) => (
                <tr key={row.claim_number || row.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3 pl-4">
                    <p className="font-semibold text-slate-900">{row.claim_number}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString("en-GB") : "-"}
                    </p>
                  </td>
                  <td className="p-3">
                    <p className="font-semibold text-slate-900">{row.patient_name || "-"}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">{row.policy_number || "-"}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-slate-800 truncate max-w-[200px]" title={row.hospital_name}>
                      {row.hospital_name || "-"}
                    </p>
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-700">
                    {row.auth_code || "-"}
                  </td>
                  <td className="p-3 text-right font-mono font-semibold text-slate-700">
                    {money(row.original_amount || row.total_amount)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-700">
                    {money(row.approved_amount)}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5 capitalize", STATUS_PILL_STYLES[row.status] || "bg-slate-100 text-slate-700")}>
                      {(row.status || "pending").replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="p-3 pr-4 max-w-[240px]">
                    <p className="truncate text-[11px] text-slate-600" title={row.payment_note || row.audit_note || ""}>
                      {row.payment_note || row.audit_note || (row.paid_at ? `Paid on ${new Date(row.paid_at).toLocaleDateString("en-GB")}` : "—")}
                    </p>
                  </td>
                </tr>
              ))}
              {paginatedRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs font-medium text-slate-400">
                    No claims match the selected search or filter criteria.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs font-medium text-slate-400">
                    <BrandSpinner className="mx-auto mb-2 h-5 w-5" />
                    Loading claims registry...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-slate-100 p-3 bg-slate-50/50">
            <DataPagination
              page={page}
              totalPages={totalPages}
              start={start}
              end={end}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
