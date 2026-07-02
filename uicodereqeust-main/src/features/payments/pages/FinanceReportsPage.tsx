import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileSpreadsheet, FileText, CheckCircle2, Clock, FileBox, Coins } from "lucide-react";
import { useFinanceReports } from "../hooks/usePayments";
import * as XLSX from "xlsx";
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

  const exportExcel = () => {
    if (!data) return;

    const workbook = XLSX.utils.book_new();

    const summaryData = [
      ["Finance Report Summary"],
      ["Generated At", new Date().toLocaleString()],
      [],
      ["Metric", "Count", "Value"],
      ["Awaiting Payments", stats.awaitingCount, stats.awaitingValue],
      ["Paid Claims", stats.paidCount, stats.paidValue],
      ["Draft Batches", stats.draftBatches, "-"],
      ["Ready for Payout Batches", stats.readyBatches, "-"],
      ["Settled Batches", stats.paidBatches, "-"],
      ["Total Batches Value", "-", stats.totalBatchesValue],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Summary");

    if (stats.awaitingList && stats.awaitingList.length > 0) {
      const awaitingData = stats.awaitingList.map((c: any) => ({
        "Claim Number": c.claim_number,
        "Hospital": c.hospital_name,
        "Patient": c.patient_name,
        "Policy Number": c.policy_number,
        "Status": c.status,
        "Payment Status": c.payment_status,
        "Total Amount": c.total_amount,
        "Approved Amount": c.approved_amount,
        "Submitted At": c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : "",
      }));
      const wsAwaiting = XLSX.utils.json_to_sheet(awaitingData);
      XLSX.utils.book_append_sheet(workbook, wsAwaiting, "Awaiting Payments");
    }

    if (stats.paidList && stats.paidList.length > 0) {
      const paidData = stats.paidList.map((c: any) => ({
        "Claim Number": c.claim_number,
        "Hospital": c.hospital_name,
        "Patient": c.patient_name,
        "Policy Number": c.policy_number,
        "Status": c.status,
        "Payment Status": c.payment_status,
        "Total Amount": c.total_amount,
        "Approved Amount": c.approved_amount,
        "Paid At": c.paid_at ? new Date(c.paid_at).toLocaleString() : "",
      }));
      const wsPaid = XLSX.utils.json_to_sheet(paidData);
      XLSX.utils.book_append_sheet(workbook, wsPaid, "Paid Claims");
    }

    if (stats.batchesList && stats.batchesList.length > 0) {
      const batchData = stats.batchesList.map((b: any) => ({
        "Batch ID": b.id,
        "Status": b.status,
        "Total Amount": b.total_amount,
        "Claims Count": b.claims_count,
        "Created At": b.created_at ? new Date(b.created_at).toLocaleString() : "",
        "Paid At": b.paid_at ? new Date(b.paid_at).toLocaleString() : "",
      }));
      const wsBatches = XLSX.utils.json_to_sheet(batchData);
      XLSX.utils.book_append_sheet(workbook, wsBatches, "Batches");
    }

    XLSX.writeFile(workbook, `Finance_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Export Complete", description: "Your finance report has been downloaded." });
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

