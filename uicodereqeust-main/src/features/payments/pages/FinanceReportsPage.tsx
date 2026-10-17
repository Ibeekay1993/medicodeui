import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, FileSpreadsheet, FileText, CheckCircle2, Clock, FileBox, Coins } from "lucide-react";
import { useFinanceReports } from "../hooks/usePayments";
import type * as ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/PageLoader";

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
      { label: "Awaiting Payments", value: stats.awaitingValue, count: stats.awaitingCount, icon: <Clock className="h-6 w-6 text-orange-500" />, border: "border-orange-200" },
      { label: "Paid Claims", value: stats.paidValue, count: stats.paidCount, icon: <CheckCircle2 className="h-6 w-6 text-slate-500" />, border: "border-slate-200" },
      { label: "Draft Batches", value: stats.draftBatches, count: stats.draftBatches, icon: <FileBox className="h-6 w-6 text-slate-500" />, border: "border-slate-200" },
      { label: "Ready for Payout", value: stats.readyBatches, count: stats.readyBatches, icon: <FileBox className="h-6 w-6 text-slate-500" />, border: "border-slate-200" },
      { label: "Settled Batches", value: stats.paidBatches, count: stats.paidBatches, icon: <CheckCircle2 className="h-6 w-6 text-emerald-500" />, border: "border-emerald-200" },
      { label: "Total Batches Value", value: stats.totalBatchesValue, count: stats.totalBatchesValue, icon: <Coins className="h-6 w-6 text-slate-600" />, border: "border-slate-200" },
    ],
    [stats]
  );

  const exportExcel = async () => {
    if (!data) return;

    try {
      toast({ title: "Preparing export", description: "Generating finance report…" });

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

      const headerFont = {
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
    return <PageLoader label="Loading finance data..." />;
  }

  return (
    <div className="max-w-full space-y-5 overflow-x-hidden pb-10">
      <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">Finance overview</h2>
          <p className="max-w-xl text-sm text-slate-600">
            Review payment and settlement activity, batch status, and financial reports.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Button
            variant="outline"
            size="sm"
            className="h-10 min-w-0 flex-1 border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 sm:flex-none"
            onClick={exportCSV}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            CSV Export
          </Button>
          <Button
            size="sm"
            className="h-10 min-w-0 flex-1 border-0 bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 sm:flex-none"
            onClick={exportExcel}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Excel Report
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh finance report"
            className="h-10 w-10 shrink-0 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            onClick={() => void refetch()}
            title="Refresh report"
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin text-primary")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="../payments/awaiting"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span>Awaiting claims ({stats.awaitingCount.toLocaleString()})</span>
        </Link>
        <Link
          to="../payments/batches"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <FileBox className="h-3.5 w-3.5 text-blue-500" />
          <span>Payment batches ({(stats.draftBatches + stats.readyBatches + stats.paidBatches).toLocaleString()})</span>
        </Link>
        <Link
          to="../payments/paid"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Settled claims ({stats.paidCount.toLocaleString()})</span>
        </Link>
      </div>

      <section aria-labelledby="finance-summary-heading" className="space-y-3">
        <div>
          <h3 id="finance-summary-heading" className="text-base font-semibold text-slate-900">Payment &amp; settlement summary</h3>
          <p className="text-xs text-slate-500">Current claim payment and batch totals.</p>
        </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const isBatchCount = c.label.includes("Batches") && !c.label.includes("Value");
          return (
            <Card key={c.label} className={cn("relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:border-slate-300", c.border)}>
              <div className="relative z-10 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-600">{c.label}</p>
                  <div className="rounded-lg bg-slate-50 p-2">
                    {c.icon}
                  </div>
                </div>
                <p className="truncate text-xl font-semibold tracking-tight text-slate-900">
                  {isBatchCount ? c.count.toLocaleString() : formatMoney(c.value)}
                </p>
                <div className="mt-2 flex w-fit items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                  {isBatchCount ? "Batch count: " : "Claim count: "}
                  <span className="ml-1 font-bold text-slate-900">{c.count.toLocaleString()}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      </section>
    </div>
  );
}
