import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileSpreadsheet, FileText, CheckCircle2, Clock, FileBox, Coins } from "lucide-react";
import { useFinanceReports } from "../hooks/usePayments";
import * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { toast } from "@/components/ui/use-toast";

export default function FinanceReportsPage() {
  const { data, isLoading, refetch } = useFinanceReports();

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const stats = useMemo(() => {
    if (!data) return { awaitingCount: 0, awaitingValue: 0, paidCount: 0, paidValue: 0, draftBatches: 0, readyBatches: 0, paidBatches: 0, totalBatchesValue: 0, awaitingList: [], paidList: [], batchesList: [] };

    const { paidClaims, awaitingClaims, batches } = data;
    const currentDate = new Date();

    const awaitingList = (awaitingClaims as any[]).filter((c: any) =>
      c.status === "approved" ||
      (c.status === "partially_approved" && (
        c.payment_status === "awaiting_payment" ||
        (c.contest_deadline && new Date(c.contest_deadline) < currentDate)
      ))
    );

    return {
      awaitingCount: awaitingList.length,
      awaitingValue: awaitingList.reduce((sum: number, c: any) => sum + Number(c.approved_amount || c.total_amount || 0), 0),
      paidCount: (paidClaims as any[]).length,
      paidValue: (paidClaims as any[]).reduce((sum: number, c: any) => sum + Number(c.approved_amount || 0), 0),
      draftBatches: (batches as any[]).filter((b: any) => b.status === "draft").length,
      readyBatches: (batches as any[]).filter((b: any) => b.status === "ready").length,
      paidBatches: (batches as any[]).filter((b: any) => b.status === "paid").length,
      totalBatchesValue: (batches as any[]).reduce((sum: number, b: any) => sum + Number(b.total_amount || 0), 0),
      awaitingList,
      paidList: paidClaims,
      batchesList: batches,
    };
  }, [data]);

  const cards = useMemo(
    () => [
      { label: "Awaiting Payments", value: stats.awaitingValue, count: stats.awaitingCount, icon: <Clock className="h-6 w-6 text-orange-500" />, bg: "from-orange-50 to-orange-100", border: "border-orange-200" },
      { label: "Paid Claims", value: stats.paidValue, count: stats.paidCount, icon: <CheckCircle2 className="h-6 w-6 text-green-500" />, bg: "from-green-50 to-green-100", border: "border-green-200" },
      { label: "Draft Batches", value: stats.draftBatches, count: stats.draftBatches, icon: <FileBox className="h-6 w-6 text-slate-500" />, bg: "from-slate-50 to-slate-100", border: "border-slate-200" },
      { label: "Ready for Payout", value: stats.readyBatches, count: stats.readyBatches, icon: <FileBox className="h-6 w-6 text-blue-500" />, bg: "from-blue-50 to-blue-100", border: "border-blue-200" },
      { label: "Settled Batches", value: stats.paidBatches, count: stats.paidBatches, icon: <CheckCircle2 className="h-6 w-6 text-emerald-500" />, bg: "from-emerald-50 to-emerald-100", border: "border-emerald-200" },
      { label: "Total Batches Value", value: stats.totalBatchesValue, count: stats.totalBatchesValue, icon: <Coins className="h-6 w-6 text-indigo-500" />, bg: "from-indigo-50 to-indigo-100", border: "border-indigo-200" },
    ],
    [stats]
  );

  const exportExcel = async () => {
    if (!data) return;

    try {
      toast({ title: "Preparing Export", description: "Generating premium finance dashboard..." });

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

      // ── SHEET 1: Summary ──────────────────────────────────────────────
      const ws1 = workbook.addWorksheet("Finance Summary", {
        views: [{ showGridLines: false }],
        properties: { tabColor: { argb: theme.primary } },
      });

      ws1.columns = [{ width: 35 }, { width: 25 }, { width: 25 }];

      ws1.addRow(["FINANCE EXECUTIVE DASHBOARD"]).font = { size: 16, bold: true, color: { argb: theme.primary } };
      ws1.addRow([]);

      const kpiHeader = ws1.addRow(["METRIC", "COUNT", "VALUE"]);
      kpiHeader.font = headerFont;
      kpiHeader.fill = headerFill;

      const pushKPI = (metric: string, count: any, value: any, colorArgb?: string) => {
        const row = ws1.addRow([metric, count, value]);
        row.getCell(1).font = { bold: true };
        row.getCell(2).alignment = { horizontal: 'right' };
        
        const valCell = row.getCell(3);
        valCell.font = { bold: true, size: 14, color: colorArgb ? { argb: colorArgb } : undefined };
        valCell.alignment = { horizontal: 'right' };
        if (value !== "-") valCell.numFmt = currencyFormat;
      };

      pushKPI("Awaiting Payments", stats.awaitingCount, stats.awaitingValue, theme.warning);
      pushKPI("Paid Claims", stats.paidCount, stats.paidValue, theme.success);
      pushKPI("Draft Batches", stats.draftBatches, "-");
      pushKPI("Ready for Payout Batches", stats.readyBatches, "-");
      pushKPI("Settled Batches", stats.paidBatches, "-");
      pushKPI("Total Batches Value", "-", stats.totalBatchesValue, theme.primary);

      ws1.addRow([]);
      const metaHeader = ws1.addRow(["REPORT METADATA", "", ""]);
      metaHeader.font = headerFont;
      metaHeader.fill = headerFill;
      ws1.mergeCells(`A${metaHeader.number}:C${metaHeader.number}`);
      ws1.addRow(["Generated", new Date().toLocaleString(), ""]);

      // Helper to generate styled detailed sheets
      const addDetailedSheet = (name: string, tabColor: string, columns: any[], rowsData: any[]) => {
        if (!rowsData || rowsData.length === 0) return;
        
        const ws = workbook.addWorksheet(name, {
          views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
          properties: { tabColor: { argb: tabColor } },
        });

        ws.columns = columns;
        ws.getRow(1).font = headerFont;
        ws.getRow(1).fill = headerFill;

        for (const row of rowsData) {
          ws.addRow(row);
        }

        // Apply currency format to amount columns
        columns.forEach((col, idx) => {
          if (col.isCurrency) {
            ws.getColumn(idx + 1).numFmt = currencyFormat;
          }
        });

        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rowsData.length), column: columns.length } };
      };

      // ── SHEET 2: Awaiting Payments ────────────────────────────────────
      const claimCols = [
        { header: "Claim Number", key: "claim_number", width: 20 },
        { header: "Hospital", key: "hospital_name", width: 35 },
        { header: "Patient", key: "patient_name", width: 25 },
        { header: "Policy Number", key: "policy_number", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Payment Status", key: "payment_status", width: 20 },
        { header: "Total Amount", key: "total_amount", width: 20, isCurrency: true },
        { header: "Approved Amount", key: "approved_amount", width: 20, isCurrency: true },
        { header: "Submitted At", key: "submitted_at", width: 20 },
        { header: "Paid At", key: "paid_at", width: 20 },
      ];

      addDetailedSheet(
        "Awaiting Payments", 
        theme.warning, 
        claimCols, 
        (stats.awaitingList || []).map((c: any) => ({
          ...c,
          submitted_at: c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : ""
        }))
      );

      // ── SHEET 3: Paid Claims ──────────────────────────────────────────
      addDetailedSheet(
        "Paid Claims", 
        theme.success, 
        claimCols, 
        (stats.paidList || []).map((c: any) => ({
          ...c,
          paid_at: c.paid_at ? new Date(c.paid_at).toLocaleString() : ""
        }))
      );

      // ── SHEET 4: Batches ──────────────────────────────────────────────
      addDetailedSheet(
        "Batches", 
        theme.primary, 
        [
          { header: "Batch ID", key: "id", width: 35 },
          { header: "Status", key: "status", width: 15 },
          { header: "Total Amount", key: "total_amount", width: 20, isCurrency: true },
          { header: "Claims Count", key: "claims_count", width: 15 },
          { header: "Created At", key: "created_at", width: 20 },
          { header: "Paid At", key: "paid_at", width: 20 },
        ], 
        (stats.batchesList || []).map((b: any) => ({
          ...b,
          created_at: b.created_at ? new Date(b.created_at).toLocaleString() : "",
          paid_at: b.paid_at ? new Date(b.paid_at).toLocaleString() : ""
        }))
      );

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, `Finance_Dashboard_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast({ title: "Export Complete", description: "Your finance dashboard has been downloaded." });

    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "Export Failed", description: "Failed to generate Excel dashboard." });
    }
  };

  const exportCSV = () => {
    if (!data) return;
    
    const combined = [
      ...(stats.awaitingList || []),
      ...(stats.paidList || [])
    ];

    if (combined.length === 0) {
      toast({ variant: "destructive", title: "No data", description: "No claims to export." });
      return;
    }

    const headers = [
      "Claim Number", "Hospital", "Patient", "Policy Number", "Status", "Payment Status", "Total Amount", "Approved Amount", "Submitted At", "Paid At"
    ];

    const escapeCsv = (val: any) => `"${String(val || "").replace(/"/g, '""')}"`;

    const body = combined.map((c: any) => [
      c.claim_number,
      c.hospital_name,
      c.patient_name,
      c.policy_number,
      c.status,
      c.payment_status,
      c.total_amount,
      c.approved_amount,
      c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "",
      c.paid_at ? new Date(c.paid_at).toLocaleString() : ""
    ]);

    const csvStr = [headers, ...body].map(row => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Finance_Claims_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export Complete", description: "Your finance CSV has been downloaded." });
  };

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col gap-4 items-center justify-center">
        <div className="p-4 bg-primary/5 rounded-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <div className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Finance Data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 md:p-8 shadow-lg text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight mb-2">Finance Overview</h1>
          <p className="text-slate-300 text-sm max-w-xl">
            Real-time payment and settlement activity. Monitor awaiting payments, batch statuses, and easily export your financial records.
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button
            variant="outline"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
            onClick={exportCSV}
          >
            <FileText className="mr-2 h-4 w-4" />
            CSV Export
          </Button>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 border-0"
            onClick={exportExcel}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel Report
          </Button>
          <Button
            variant="ghost"
            className="text-slate-300 hover:text-white hover:bg-white/10 px-3"
            onClick={() => refetch()}
            title="Refresh Data"
          >
            <Loader2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((c) => {
          const isBatchCount = c.label.includes("Batches") && !c.label.includes("Value");
          return (
            <Card key={c.label} className={`rounded-2xl border ${c.border} bg-gradient-to-br ${c.bg} shadow-sm overflow-hidden relative transition-all duration-200 hover:shadow-md hover:-translate-y-1`}>
              <div className="p-6 relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{c.label}</p>
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    {c.icon}
                  </div>
                </div>
                <p className="text-3xl font-black text-slate-900 tracking-tight">
                  {isBatchCount ? c.count.toLocaleString() : formatMoney(c.value)}
                </p>
                <div className="mt-3 flex items-center text-xs font-medium text-slate-600 bg-white/50 w-fit px-2.5 py-1 rounded-full">
                  {isBatchCount ? "Total Count: " : "Claims Count: "}
                  <span className="ml-1 font-bold text-slate-900">{c.count.toLocaleString()}</span>
                </div>
              </div>
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/40 rounded-full blur-2xl z-0 pointer-events-none" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

