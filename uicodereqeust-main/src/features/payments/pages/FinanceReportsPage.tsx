import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useFinanceReports } from "../hooks/usePayments";

// NOTE:
// The finance report route was previously pointing at the claims report component.
// A dedicated finance reports screen is introduced so copy/data can be separated.
// This placeholder renders basic finance totals and will be wired to the correct
// finance RPC(s) once available.

export default function FinanceReportsPage() {
  const { data, isLoading, refetch } = useFinanceReports();

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const stats = useMemo(() => {
    if (!data) return { awaitingCount: 0, awaitingValue: 0, paidCount: 0, paidValue: 0, draftBatches: 0, readyBatches: 0, paidBatches: 0, totalBatchesValue: 0 };

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
    };
  }, [data]);

  const cards = useMemo(
    () => [
      { label: "Awaiting Payments", value: stats.awaitingValue, count: stats.awaitingCount },
      { label: "Paid Claims", value: stats.paidValue, count: stats.paidCount },
      { label: "Draft Batches", value: stats.draftBatches, count: stats.draftBatches },
      { label: "Ready for Payout", value: stats.readyBatches, count: stats.readyBatches },
      { label: "Settled Batches", value: stats.paidBatches, count: stats.paidBatches },
      { label: "Total Batches Value", value: stats.totalBatchesValue, count: stats.totalBatchesValue },
    ],
    [stats]
  );

  if (isLoading) {
    return (
      <div className="flex h-64 flex-col gap-3 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Finance Reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-900">Finance Reports</h1>
          <p className="text-sm text-[#888780]">Payment &amp; settlement activity overview</p>
        </div>
        <Button
          variant="outline"
          className="h-8 rounded-lg text-xs font-semibold text-slate-900 border-slate-200"
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const isBatchCount = c.label.includes("Batches") && !c.label.includes("Value");
          return (
            <Card key={c.label} className="rounded-xl border-slate-100 bg-white shadow-sm p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{c.label}</p>
              <p className="mt-2 text-lg font-extrabold text-slate-900">
                {isBatchCount ? c.count.toLocaleString() : formatMoney(c.value)}
              </p>
              <p className="text-xs text-slate-500">
                {isBatchCount ? "Count: " : "Value: "}{c.count.toLocaleString()}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-bold text-slate-700">Next step</p>
        <p className="text-sm text-slate-600">
          Wire finance report export/download to the correct finance/payment RPCs (separate from claims exports).
        </p>
      </div>
    </div>
  );
}

