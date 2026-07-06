import { useEffect, useMemo, useState } from "react";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Download, Loader2, Search } from "lucide-react";
import { ClaimsService } from "../services/claimsService";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HospitalSearchSelect } from "@/components/ui/HospitalSearchSelect";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const money = (value: unknown) => `NGN ${Number(value || 0).toLocaleString()}`;

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function ClaimsReportsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [_loading, setLoading] = useState(true);
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

  const loadHospitals = async () => {
    setLoadingHospitals(true);
    try {
      const allHospitals = await ClaimsService.getHospitalsList();
      setHospitals(allHospitals);
    } catch (error) {
      console.error("Error fetching hospitals:", error);
    } finally {
      setLoadingHospitals(false);
    }
  };

  const loadReport = async () => {
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
  };

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

  useEffect(() => { loadHospitals(); }, []);
  useEffect(() => { loadReport(); }, [status, hospitalId, startDate, endDate]);

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
      toast({ title: "Preparing Export", description: "Generating premium Excel dashboard..." });

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
        rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: theme.primary }, gradient: true }]
      });
      ws2.addConditionalFormatting({
        ref: `C2:C${Math.max(2, hospArr.length + 1)}`,
        rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: theme.success }, gradient: true }]
      });
      ws2.addConditionalFormatting({
        ref: `D2:D${Math.max(2, hospArr.length + 1)}`,
        rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: theme.danger }, gradient: true }]
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
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Medicode System";
      
      const theme = { primary: "FF1E3A8A", success: "FF10B981", danger: "FFEF4444", bg: "FFF8FAFC" };
      const headerFill: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: theme.primary } };
      const headerFont: ExcelJS.Font = { color: { argb: "FFFFFFFF" }, bold: true, size: 12 };
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
    <div className="space-y-4 pb-10">
      <div className="pb-3 border-b border-slate-200 flex justify-end gap-2 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 flex items-center gap-1.5 shadow-sm">
              <Download className="h-3.5 w-3.5" /> Export / Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border border-slate-100 bg-white p-1 z-50">
            <DropdownMenuItem onClick={exportCSV} className="rounded-lg text-xs font-semibold cursor-pointer py-2 hover:bg-slate-50 transition-colors">
              Download CSV (Claims)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportXLSX} className="rounded-lg text-xs font-semibold cursor-pointer py-2 hover:bg-slate-50 transition-colors">
              Download Excel (Claims)
            </DropdownMenuItem>
            <div className="h-px bg-slate-100 my-1" />
            <DropdownMenuItem onClick={exportReconciliationXLSX} className="rounded-lg text-xs font-semibold cursor-pointer py-2 hover:bg-slate-50 hover:text-emerald-700 transition-colors">
              Reconciliation Report (Excel)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="rounded-2xl border-slate-100 bg-white shadow-sm relative z-10">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-300" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search claim, patient, policy, auth code..." className="h-10 rounded-xl border-none bg-slate-50 pl-10 text-xs font-semibold" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 rounded-xl border-none bg-slate-50 text-xs font-semibold"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["all", "submitted", "under_review", "approved", "partially_approved", "paid", "rejected", "contested"].map((item) => (
                <SelectItem key={item} value={item}>{item.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <HospitalSearchSelect
            uniqueHospitals={hospitals}
            selectedHospitalId={hospitalId}
            onHospitalChange={setHospitalId}
            placeholder="Hospital"
            className="w-full h-10 rounded-xl bg-slate-50 text-xs font-semibold"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10 rounded-xl border-none bg-slate-50 text-xs font-semibold" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10 rounded-xl border-none bg-slate-50 text-xs font-semibold" />
          </div>
          <div className="flex gap-2 md:col-span-5">
            <Button type="button" variant="outline" onClick={() => setPresetRange("month")} className="h-8 rounded-lg text-xs font-semibold">This Month</Button>
            <Button type="button" variant="outline" onClick={() => setPresetRange("quarter")} className="h-8 rounded-lg text-xs font-semibold">Quarter</Button>
            <Button type="button" variant="outline" onClick={() => setPresetRange("year")} className="h-8 rounded-lg text-xs font-semibold">Year</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-4">
        {[
          ["Claims", totals.count],
          ["Original Value", money(totals.original)],
          ["Approved Value", money(totals.approved)],
          ["Declined/Savings", money(totals.declined)],
        ].map(([label, value]) => (
          <Card key={label} className="rounded-xl border-slate-100 bg-white shadow-sm">
            <CardContent className="p-2 sm:p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
              <p className="mt-1 text-base sm:text-lg font-extrabold text-slate-900 truncate leading-none">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
