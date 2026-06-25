import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// NOTE:
// The finance report route was previously pointing at the claims report component.
// A dedicated finance reports screen is introduced so copy/data can be separated.
// This placeholder renders basic finance totals and will be wired to the correct
// finance RPC(s) once available.

export default function FinanceReportsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    awaitingCount: 0,
    awaitingValue: 0,
    paidCount: 0,
    paidValue: 0,
    draftBatches: 0,
    readyBatches: 0,
    paidBatches: 0,
    totalBatchesValue: 0,
  });

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [awaitingClaimsRes, paidClaimsRes, batchesRes] = await Promise.all([
        supabase
          .from("hospital_claims" as any)
          .select("status,payment_status,contest_deadline,approved_amount,total_amount")
          .in("status", ["approved", "partially_approved"])
          .is("payment_batch_id", null),
        supabase
          .from("hospital_claims" as any)
          .select("approved_amount,total_amount")
          .eq("status", "paid"),
        supabase
          .from("payment_batches" as any)
          .select("status,total_amount"),
      ]);

      const awaitingRows = awaitingClaimsRes.data || [];
      const paidRows = paidClaimsRes.data || [];
      const batchesRows = batchesRes.data || [];

      const currentDate = new Date();
      const awaitingList = awaitingRows.filter((c: any) => {
        return (
          c.status === "approved" ||
          (c.status === "partially_approved" &&
            (c.payment_status === "awaiting_payment" ||
              (c.contest_deadline && new Date(c.contest_deadline) < currentDate)))
        );
      });

      const awaitingCount = awaitingList.length;
      const awaitingValue = awaitingList.reduce(
        (sum: number, c: any) => sum + Number(c.approved_amount || c.total_amount || 0),
        0
      );

      const paidCount = paidRows.length;
      const paidValue = paidRows.reduce(
        (sum: number, c: any) => sum + Number(c.approved_amount || c.total_amount || 0),
        0
      );

      const draftBatches = batchesRows.filter((b: any) => b.status === "draft").length;
      const readyBatches = batchesRows.filter((b: any) => b.status === "ready").length;
      const paidBatches = batchesRows.filter((b: any) => b.status === "paid").length;
      const totalBatchesValue = batchesRows.reduce(
        (sum: number, b: any) => sum + Number(b.total_amount || 0),
        0
      );

      setStats({
        awaitingCount,
        awaitingValue,
        paidCount,
        paidValue,
        draftBatches,
        readyBatches,
        paidBatches,
        totalBatchesValue,
      });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Finance report failed", description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats().catch((e) => console.error("fetchStats error:", e));
  }, []);

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

  if (loading) {
    return (
      <div className="flex h-64 flex-col gap-3 items-center justify-center">
        <div className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Finance Reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-black uppercase tracking-widest text-slate-900">Finance Reports</h1>
          <p className="text-sm text-[#888780]">Payment & settlement activity overview</p>
        </div>
        <Button
          variant="outline"
          className="h-8 rounded-lg text-xs font-semibold text-slate-900 border-slate-200"
          onClick={fetchStats}
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