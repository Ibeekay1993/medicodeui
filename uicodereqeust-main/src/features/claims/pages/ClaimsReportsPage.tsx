import { useCallback, useEffect, useMemo, useState } from "react";
import type * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { BadgeCheck, CalendarDays, ClipboardList, Download, Filter, RefreshCw, RotateCcw, Search, TrendingDown } from "lucide-react";
import { ClaimsService } from "../services/claimsService";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HospitalSearchSelect } from "@/components/ui/HospitalSearchSelect";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ClaimsAnalysisView } from "../components/ClaimsAnalysisView";

const money = (value: unknown) => `NGN ${Number(value || 0).toLocaleString()}`;
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function ClaimsReportsPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "analysis" ? "analysis" : "reports";
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

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return rows.filter((row) =>
      `${row.claim_number || ""} ${row.patient_name || ""} ${row.policy_number || ""} ${row.auth_code || ""} ${row.hospital_name || ""}`
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    original: filtered.reduce((sum, row) => sum + Number(row.original_amount || row.total_amount || 0), 0),
    approved: filtered.reduce((sum, row) => sum + Number(row.approved_amount || 0), 0),
    declined: filtered.reduce((sum, row) => sum + Number(row.declined_amount || 0), 0),
  }), [filtered]);

  const hasActiveFilters = status !== "all" || hospitalId !== "all" || Boolean(startDate) || Boolean(endDate) || Boolean(search);

  const resetFilters = () => {
    setStatus("all");
    setHospitalId("all");
    setStartDate("");
    setEndDate("");
    setSearch("");
  };

  const handleTabChange = (value: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("tab", value);
    setSearchParams(nextSearchParams, { replace: true });
  };

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
        _status: status,
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
  }, [endDate, hospitalId, startDate, status, toast]);

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
    if (activeTab === "reports") void loadHospitals();
  }, [activeTab, loadHospitals]);
  useEffect(() => {
    if (activeTab === "reports") void loadReport();
  }, [activeTab, loadReport]);

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

      // Group by hospital for analysis
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

      ws2.addConditionalFormatting({
        ref: `B2:B${Math.max(2, hospArr.length + 1)}`,
        rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: theme.primary } } }, gradient: true }]
      });
      ws2.addConditionalFormatting({
        ref: `C2:C${Math.max(2, hospArr.length + 1)}`,
        rules: [{ type: 'dataBar', priority: 2, cfvo: [{ type: 'min' }, { type: 'max' }], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: theme.success } } }, gradient: true }]
      });
      ws2.addConditionalFormatting({
        ref: `D2:D${Math.max(2, hospArr.length + 1)}`,
        rules: [{ type: 'dataBar', priority: 3, cfvo: [{ type: 'min' }, { type: 'max' }], style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: theme.danger } } }, gradient: true }]
      });

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
      workbook.creator = "Medicode System";
      
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
    <Tabs value={activeTab} onValueChange={handleTabChange} className="max-w-full space-y-5 overflow-x-hidden pb-10">
      <TabsList className="h-10 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <TabsTrigger value="analysis" className="rounded-lg px-5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
          Claims Analysis
        </TabsTrigger>
        <TabsTrigger value="reports" className="rounded-lg px-5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm">
          Claims Reports
        </TabsTrigger>
      </TabsList>

      {/* ── Tab 1: Analysis ─────────────────────────────────────── */}
      <TabsContent value="analysis" className="mt-0 space-y-5">
        <ClaimsAnalysisView />
      </TabsContent>

      {/* ── Tab 2: Reports ──────────────────────────────────────── */}
      <TabsContent value="reports" className="mt-0 space-y-5">
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Claims overview</h2>
            <p className="mt-1 text-sm text-slate-600">Review claim activity and export detailed or reconciliation reports.</p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              aria-label="Refresh claims report"
              className="h-10 w-10 shrink-0 border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              onClick={() => void loadReport()}
              title="Refresh report"
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin text-primary")} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-10 flex-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:flex-none">
                  <Download className="mr-2 h-4 w-4" /> Export reports
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                <DropdownMenuItem onClick={exportCSV} className="cursor-pointer rounded-lg py-2.5 text-sm font-medium">
                  Download CSV (Claims)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportXLSX} className="cursor-pointer rounded-lg py-2.5 text-sm font-medium">
                  Download Excel (Claims)
                </DropdownMenuItem>
                <div className="my-1 h-px bg-slate-100" />
                <DropdownMenuItem onClick={exportReconciliationXLSX} className="cursor-pointer rounded-lg py-2.5 text-sm font-medium">
                  Reconciliation Report (Excel)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card className="relative z-10 rounded-xl border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                <Filter className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Report filters</h3>
                <p className="text-xs text-slate-500">Narrow the claims included in the summary and exported reports.</p>
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
              <div className="relative min-w-0 md:col-span-2 xl:col-span-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input aria-label="Search claims for reports" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search claim, patient, policy, auth code..." className="h-10 rounded-lg border-slate-200 bg-white pl-10 text-sm" />
              </div>
              <div className="min-w-0 xl:col-span-2">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger aria-label="Filter claims by status" className="h-10 w-full rounded-lg border-slate-200 bg-white text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["all", "submitted", "under_review", "approved", "partially_approved", "paid", "rejected", "contested"].map((item) => (
                      <SelectItem key={item} value={item}>{item.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 xl:col-span-3">
                <HospitalSearchSelect
                  uniqueHospitals={hospitals}
                  selectedHospitalId={hospitalId}
                  onHospitalChange={setHospitalId}
                  placeholder={loadingHospitals ? "Loading hospitals..." : "Hospital"}
                  className="h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white text-sm"
                />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:col-span-2 xl:col-span-3">
                <Input aria-label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white text-xs" />
                <Input aria-label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border-slate-200 bg-white text-xs" />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 md:col-span-2 xl:col-span-12">
                <span className="mr-1 text-xs font-medium text-slate-500">Date presets</span>
                <Button type="button" variant="outline" onClick={() => setPresetRange("month")} className="h-9 rounded-lg border-slate-200 text-xs font-medium">This Month</Button>
                <Button type="button" variant="outline" onClick={() => setPresetRange("quarter")} className="h-9 rounded-lg border-slate-200 text-xs font-medium">Quarter</Button>
                <Button type="button" variant="outline" onClick={() => setPresetRange("year")} className="h-9 rounded-lg border-slate-200 text-xs font-medium">Year</Button>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetFilters}
                    className="h-9 gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                    Reset filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {!loading && (
          <section aria-labelledby="claims-summary-heading" className="space-y-3">
          <div>
            <h3 id="claims-summary-heading" className="text-base font-semibold text-slate-900">Claims summary</h3>
            <p className="text-xs text-slate-500">Totals reflect the selected filters and search.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Claims", value: totals.count.toLocaleString(), detail: "Matching claims", Icon: ClipboardList, tone: "text-slate-600" },
              { label: "Original value", value: money(totals.original), detail: "Submitted amount", Icon: CalendarDays, tone: "text-blue-600" },
              { label: "Approved value", value: money(totals.approved), detail: "Approved amount", Icon: BadgeCheck, tone: "text-emerald-600" },
              { label: "Declined / savings", value: money(totals.declined), detail: "Declined amount", Icon: TrendingDown, tone: "text-amber-600" },
            ].map(({ label, value, detail, Icon, tone }) => (
              <Card key={label} className="rounded-xl border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-600">{label}</p>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
                    </div>
                  </div>
                  <p className="mt-2 truncate text-xl font-semibold tracking-tight text-slate-900">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          </section>
        )}

      </TabsContent>
    </Tabs>
  );
}
