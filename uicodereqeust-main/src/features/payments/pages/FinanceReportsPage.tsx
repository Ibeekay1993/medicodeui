import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Clock,
  FileBox,
  Coins,
  Layers,
  ArrowRight,
} from "lucide-react";
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
    if (!data)
      return {
        awaitingCount: 0,
        awaitingValue: 0,
        paidCount: 0,
        paidValue: 0,
        draftBatches: 0,
        readyBatches: 0,
        paidBatches: 0,
        totalBatchesValue: 0,
        awaitingList: [],
        paidList: [],
        batchesList: [],
      };

    const { paidClaims, awaitingClaims, batches } = data;
    const currentDate = new Date();

    const awaitingList = (awaitingClaims as any[]).filter(
      (c: any) =>
        c.status === "approved" ||
        (c.status === "partially_approved" &&
          (c.payment_status === "awaiting_payment" ||
            (c.contest_deadline && new Date(c.contest_deadline) < currentDate)))
    );

    return {
      awaitingCount: awaitingList.length,
      awaitingValue: awaitingList.reduce(
        (sum: number, c: any) => sum + Number(c.approved_amount || c.total_amount || 0),
        0
      ),
      paidCount: (paidClaims as any[]).length,
      paidValue: (paidClaims as any[]).reduce(
        (sum: number, c: any) => sum + Number(c.approved_amount || 0),
        0
      ),
      draftBatches: (batches as any[]).filter((b: any) => b.status === "draft").length,
      readyBatches: (batches as any[]).filter((b: any) => b.status === "ready").length,
      paidBatches: (batches as any[]).filter((b: any) => b.status === "paid").length,
      totalBatchesValue: (batches as any[]).reduce(
        (sum: number, b: any) => sum + Number(b.total_amount || 0),
        0
      ),
      awaitingList,
      paidList: paidClaims,
      batchesList: batches,
    };
  }, [data]);

  const totalBatchesCount = stats.draftBatches + stats.readyBatches + stats.paidBatches;

  const cards = useMemo(
    () => [
      {
        label: "Awaiting Payments",
        value: formatMoney(stats.awaitingValue),
        detail: `${stats.awaitingCount.toLocaleString()} claims pending`,
        icon: Clock,
        iconTone: "text-amber-600",
        iconBg: "bg-amber-50 border border-amber-200",
      },
      {
        label: "Paid Claims",
        value: formatMoney(stats.paidValue),
        detail: `${stats.paidCount.toLocaleString()} claims settled`,
        icon: CheckCircle2,
        iconTone: "text-emerald-600",
        iconBg: "bg-emerald-50 border border-emerald-200",
      },
      {
        label: "Total Batches Value",
        value: formatMoney(stats.totalBatchesValue),
        detail: `${totalBatchesCount.toLocaleString()} batches created`,
        icon: Coins,
        iconTone: "text-blue-600",
        iconBg: "bg-blue-50 border border-blue-200",
      },
      {
        label: "Draft Batches",
        value: stats.draftBatches.toLocaleString(),
        detail: "In preparation",
        icon: FileBox,
        iconTone: "text-slate-600",
        iconBg: "bg-slate-100 border border-slate-200",
      },
      {
        label: "Ready for Payout",
        value: stats.readyBatches.toLocaleString(),
        detail: "Approved batches",
        icon: Layers,
        iconTone: "text-indigo-600",
        iconBg: "bg-indigo-50 border border-indigo-200",
      },
      {
        label: "Settled Batches",
        value: stats.paidBatches.toLocaleString(),
        detail: "Disbursed & closed",
        icon: CheckCircle2,
        iconTone: "text-emerald-600",
        iconBg: "bg-emerald-50 border border-emerald-200",
      },
    ],
    [stats, totalBatchesCount]
  );

  const exportExcel = async () => {
    if (!data) return;

    try {
      toast({ title: "Preparing export", description: "Generating finance report…" });

      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Ronsberger HMO Clinical System";
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

    const csvStr = [headers, ...body].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RonsbergerHMO_Finance_Report_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export Complete", description: "Your finance CSV has been downloaded." });
  };

  if (isLoading) {
    return <PageLoader label="Loading finance data..." />;
  }

  return (
    <div className="max-w-full space-y-4 overflow-x-hidden pb-10">
      {/* ── Executive Header ── */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center shadow-xs">
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">Payment Reports</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Review claim payment settlements, batch cycles, and financial ledger data.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Button
            variant="outline"
            size="sm"
            className="h-9 min-w-0 flex-1 border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:flex-none"
            onClick={exportCSV}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
            CSV Export
          </Button>
          <Button
            size="sm"
            className="h-9 min-w-0 flex-1 border-0 bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 sm:flex-none"
            onClick={exportExcel}
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
            Excel Report
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Refresh finance report"
            className="h-9 w-9 shrink-0 border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void refetch()}
            title="Refresh report"
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin text-primary")} />
          </Button>
        </div>
      </div>

      {/* ── Quick Navigation Pills ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="../payments/awaiting"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span>Awaiting claims ({stats.awaitingCount.toLocaleString()})</span>
        </Link>
        <Link
          to="../payments/batches"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <FileBox className="h-3.5 w-3.5 text-blue-500" />
          <span>Payment batches ({totalBatchesCount.toLocaleString()})</span>
        </Link>
        <Link
          to="../payments/paid"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Settled claims ({stats.paidCount.toLocaleString()})</span>
        </Link>
      </div>

      {/* ── Compact Settlement Summary Cards ── */}
      <section aria-labelledby="finance-summary-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 id="finance-summary-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Payment &amp; Settlement Summary
          </h3>
          <span className="text-xs font-semibold text-slate-600">
            Total Cycle Value: <span className="font-mono text-slate-900">{formatMoney(stats.totalBatchesValue)}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-xs transition-all hover:border-slate-300"
              >
                <div className={cn("flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg", c.iconBg)}>
                  <Icon className={cn("h-4 w-4 sm:h-4.5 sm:w-4.5", c.iconTone)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-slate-500 leading-tight">{c.label}</p>
                  <p className="mt-0.5 truncate text-sm sm:text-base font-bold tracking-tight text-slate-900 font-mono leading-none">
                    {c.value}
                  </p>
                  <p className="mt-1 truncate text-[10px] text-slate-500 font-medium leading-none">{c.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Payment Batches Breakdown Ledger ── */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-slate-100 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Payment Batches Ledger</h3>
            <p className="text-xs text-slate-500">Summary of all payment batches, disbursement cycles, and settled totals.</p>
          </div>
          <Link
            to="../payments/batches"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F6E56] hover:underline"
          >
            Manage batches <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th scope="col" className="p-3 pl-4">Month / Cycle</th>
                <th scope="col" className="p-3">Batch Status</th>
                <th scope="col" className="p-3 text-right">Batch Value</th>
                <th scope="col" className="p-3 pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {(stats.batchesList as any[]).map((b, idx) => (
                <tr key={b.id || idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="p-3 pl-4 font-semibold text-slate-900">
                    {b.month || "Current Cycle"}
                  </td>
                  <td className="p-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 capitalize",
                        b.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        b.status === "ready" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        "bg-slate-100 text-slate-700 border-slate-200"
                      )}
                    >
                      {b.status || "draft"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatMoney(Number(b.total_amount || 0))}
                  </td>
                  <td className="p-3 pr-4 text-right">
                    <Link
                      to="../payments/batches"
                      className="text-xs font-semibold text-[#0F6E56] hover:underline"
                    >
                      View &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {(stats.batchesList as any[]).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-slate-400">
                    No payment batches created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
