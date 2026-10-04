import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { DashboardMetricGrid } from "@/components/dashboard/DashboardMetricGrid";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
  AlertTriangle,
  Layers,
  Wallet,
  Activity,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { buildLastNDayBuckets } from "@/lib/chart-date-utils";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatSlaDuration = (minutes: number) => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};

export default function DashboardHome() {
  const { role, user } = useAuth();
  const [stats, setStats] = useState<any>({ total: 0, approved: 0, rejected: 0, pending: 0, hospitals: 0, users: 0 });
  const [claimStats, setClaimStats] = useState<any>({ submitted: 0, approved: 0, partiallyApproved: 0, rejected: 0, contested: 0, paid: 0, claimedValue: 0, approvedValue: 0, declinedValue: 0 });
  const [financeStats, setFinanceStats] = useState<any>({
    awaitingCount: 0,
    awaitingValue: 0,
    paidCount: 0,
    paidValue: 0,
    draftBatches: 0,
    readyBatches: 0,
    paidBatches: 0,
    totalBatchesValue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [personalSla, setPersonalSla] = useState<{ loading: boolean; averageMinutes: number | null; decisions: number }>({
    loading: false,
    averageMinutes: null,
    decisions: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [claimChartData, setClaimChartData] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const decisionRoles = new Set(["admin", "nurse", "medical_officer", "doctor", "utilization_manager", "utilization_manager_lead"]);
    if (!user?.id || !role || !decisionRoles.has(role)) {
      setPersonalSla({ loading: false, averageMinutes: null, decisions: 0 });
      return;
    }

    let active = true;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    setPersonalSla({ loading: true, averageMinutes: null, decisions: 0 });
    supabase
      .from("authorization_requests")
      .select("treatment_submitted_at,created_at,decided_at,is_historical")
      .or(`approved_by.eq.${user.id},decided_by.eq.${user.id}`)
      .in("status", ["approved", "partially_approved", "rejected", "referral_approved"])
      .gte("decided_at", since.toISOString())
      .not("decided_at", "is", null)
      .order("decided_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Could not load personal SLA summary:", error.message);
          setPersonalSla({ loading: false, averageMinutes: null, decisions: 0 });
          return;
        }

        const durations = (data || []).flatMap((record) => {
          if (record.is_historical) return [];
          const start = Date.parse(record.treatment_submitted_at || record.created_at);
          const end = Date.parse(record.decided_at || "");
          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
          return [(end - start) / 60_000];
        });
        setPersonalSla({
          loading: false,
          averageMinutes: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
          decisions: durations.length,
        });
      });

    return () => { active = false; };
  }, [user?.id, role]);

  const lastFetchedRef = useRef(0);

  const fetchStats = useCallback(async (force = false) => {
    const now = Date.now();
    const THROTTLE_MS = 60000;
    if (!force && now - lastFetchedRef.current < THROTTLE_MS) {
      return;
    }
    lastFetchedRef.current = now;

    setLoading(true);
    try {
      const isClaimsRole = role === "claims";
      const isFinanceRole = role === "finance";
      const isAdmin = role === "admin";

      if (isFinanceRole || isAdmin) {
        const [awaitingClaimsRes, paidClaimsRes, batchesRes] = await Promise.all([
          supabase
            .from("hospital_claims" as any)
            .select("status,payment_status,contest_deadline,approved_amount,total_amount")
            .in("status", ["approved", "partially_approved"])
            .is("payment_batch_id", null)
            .limit(1000),
          supabase
            .from("hospital_claims" as any)
            .select("approved_amount,total_amount")
            .eq("status", "paid")
            .limit(1000),
          supabase
            .from("payment_batches" as any)
            .select("status,total_amount")
            .limit(500)
        ]);

        const awaitingRows = awaitingClaimsRes.data || [];
        const paidRows = paidClaimsRes.data || [];
        const batchesRows = batchesRes.data || [];

        const currentDate = new Date();
        const awaitingList = awaitingRows.filter((c: any) => {
          return c.status === "approved" || (
            c.status === "partially_approved" && (
              c.payment_status === "awaiting_payment" ||
              (c.contest_deadline && new Date(c.contest_deadline) < currentDate)
            )
          );
        });

        const awaitingCount = awaitingList.length;
        const awaitingValue = awaitingList.reduce((sum: number, c: any) => sum + Number(c.approved_amount || c.total_amount || 0), 0);

        const paidCount = paidRows.length;
        const paidValue = paidRows.reduce((sum: number, c: any) => sum + Number(c.approved_amount || c.total_amount || 0), 0);

        const draftBatches = batchesRows.filter((b: any) => b.status === "draft").length;
        const readyBatches = batchesRows.filter((b: any) => b.status === "ready").length;
        const paidBatches = batchesRows.filter((b: any) => b.status === "paid").length;
        const totalBatchesValue = batchesRows.reduce((sum: number, b: any) => sum + Number(b.total_amount || 0), 0);

        setFinanceStats({
          awaitingCount,
          awaitingValue,
          paidCount,
          paidValue,
          draftBatches,
          readyBatches,
          paidBatches,
          totalBatchesValue
        });

        if (isFinanceRole) {
          const { data: financeChart, error: chartError } = await supabase.rpc("dashboard_finance_activity_7d" as any);
          if (chartError) {
            console.error("Failed to fetch dashboard_finance_activity_7d:", chartError);
          }
          setChartData(
            financeChart?.length
              ? financeChart.map((row: any) => ({
                  dateStr: row.day,
                  name: row.day_label,
                  tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                  volume: Number(row.volume) || 0,
                  approved: Number(row.amount) || 0,
                }))
              : buildLastNDayBuckets(7),
          );
        }
      }

      if (!isFinanceRole) {
        // Try fetching via consolidated RPC
        let rpcData: any = null;
        let rpcError: any = null;
        try {
          const { data, error } = await supabase.rpc("get_dashboard_stats" as any);
          if (error) {
            rpcError = error;
          } else {
            rpcData = data;
          }
        } catch (err) {
          rpcError = err;
        }

        if (rpcData && !rpcError) {
        if (isClaimsRole) {
          setStats({
            total: (rpcData.claims?.total || 0) + (rpcData.historical_claims || 0),
            approved: (rpcData.claims?.approved || 0) + (rpcData.historical_claims || 0),
            rejected: rpcData.claims?.rejected || 0,
            pending: rpcData.claims?.pending || 0,
            hospitals: rpcData.hospitals || 0,
            users: rpcData.users || 0,
          });

          if (rpcData.admin_claims) {
            setClaimStats({
              submitted: rpcData.admin_claims.submitted || 0,
              approved: rpcData.admin_claims.approved || 0,
              partiallyApproved: rpcData.admin_claims.partially_approved || 0,
              rejected: rpcData.admin_claims.rejected || 0,
              contested: rpcData.admin_claims.contested || 0,
              paid: rpcData.admin_claims.paid || 0,
              claimedValue: Number(rpcData.admin_claims.claimed_value || 0),
              approvedValue: Number(rpcData.admin_claims.approved_value || 0),
              declinedValue: Number(rpcData.admin_claims.declined_value || 0),
            });
          }
          
          const { data: claimChart } = await supabase.rpc("dashboard_claims_activity_7d" as any);
          setChartData(
            claimChart?.length
              ? claimChart.map((row: any) => ({
                  dateStr: row.day,
                  name: row.day_label,
                  tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                  volume: Number(row.volume) || 0,
                  approved: Number(row.approved) || 0,
                }))
              : buildLastNDayBuckets(7),
          );
        } else {
          setStats({
            total: (rpcData.auth?.total || 0) + (rpcData.historical_auths || 0),
            approved: (rpcData.auth?.approved || 0) + (rpcData.historical_auths || 0),
            rejected: rpcData.auth?.rejected || 0,
            pending: rpcData.auth?.pending || 0,
            hospitals: rpcData.hospitals || 0,
            users: rpcData.users || 0,
          });

          const [chartRes, claimChartRes] = await Promise.all([
            supabase.rpc("dashboard_live_activity_7d" as any),
            supabase.rpc("dashboard_claims_activity_7d" as any),
          ]);
          setChartData(
            chartRes.data?.length
              ? chartRes.data.map((row: any) => ({
                  dateStr: row.day,
                  name: row.day_label,
                  tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                  volume: Number(row.volume) || 0,
                  approved: Number(row.approved) || 0,
                }))
              : buildLastNDayBuckets(7),
          );
          setClaimChartData(
            claimChartRes.data?.length
              ? claimChartRes.data.map((row: any) => ({
                  dateStr: row.day,
                  name: row.day_label,
                  tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                  volume: Number(row.volume) || 0,
                  approved: Number(row.approved) || 0,
                }))
              : buildLastNDayBuckets(7),
          );

          if (role === "admin" && rpcData.admin_claims) {
            setClaimStats({
              submitted: rpcData.admin_claims.submitted || 0,
              approved: rpcData.admin_claims.approved || 0,
              partiallyApproved: rpcData.admin_claims.partially_approved || 0,
              rejected: rpcData.admin_claims.rejected || 0,
              contested: rpcData.admin_claims.contested || 0,
              paid: rpcData.admin_claims.paid || 0,
              claimedValue: Number(rpcData.admin_claims.claimed_value || 0),
              approvedValue: Number(rpcData.admin_claims.approved_value || 0),
              declinedValue: Number(rpcData.admin_claims.declined_value || 0),
            });
          }
        }
      } else {
        console.warn("get_dashboard_stats RPC failed or not found, falling back to legacy queries:", rpcError);
        if (isClaimsRole) {
          const [allClaims, approvedClaims, rejectedClaims, pendingClaims, hospitalsRes, usersRes, historicalClaims] = await Promise.all([
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }),
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }).eq("status", "approved"),
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }).eq("status", "rejected"),
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }).or("status.eq.submitted,status.eq.pending"),
            supabase.from("hospitals").select("id", { count: "exact", head: true }),
            supabase.from("user_roles").select("id", { count: "exact", head: true }),
            supabase.from("historical_codes" as any).select("id", { count: "exact", head: true }).eq("record_type", "claim"),
          ]);
          setStats({
            total: (allClaims.count || 0) + (historicalClaims.count || 0),
            approved: (approvedClaims.count || 0) + (historicalClaims.count || 0),
            rejected: rejectedClaims.count || 0,
            pending: pendingClaims.count || 0,
            hospitals: hospitalsRes.count || 0,
            users: usersRes.count || 0,
          });

          const { data: claimChart } = await supabase.rpc("dashboard_claims_activity_7d" as any);
          const claimRows = claimChart?.length
            ? claimChart.map((row: any) => ({
                dateStr: row.day,
                name: row.day_label,
                tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                volume: Number(row.volume) || 0,
                approved: Number(row.approved) || 0,
              }))
            : buildLastNDayBuckets(7);
          setChartData(claimRows);
          setClaimChartData(claimRows);
        } else {
          const [totalRes, approvedRes, rejectedRes, pendingRes, hospitalsRes, usersRes, authChartRes, claimChartRes2, historicalAuths] = await Promise.all([
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }),
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }).eq("status", "approved"),
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }).eq("status", "rejected"),
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
            supabase.from("hospitals").select("id", { count: "exact", head: true }),
            supabase.from("user_roles").select("id", { count: "exact", head: true }),
            supabase.rpc("dashboard_live_activity_7d" as any),
            supabase.rpc("dashboard_claims_activity_7d" as any),
            supabase.from("historical_codes" as any).select("id", { count: "exact", head: true }).eq("record_type", "authorization"),
          ]);
          setStats({
            total: (totalRes.count || 0) + (historicalAuths.count || 0),
            approved: (approvedRes.count || 0) + (historicalAuths.count || 0),
            rejected: rejectedRes.count || 0,
            pending: pendingRes.count || 0,
            hospitals: hospitalsRes.count || 0,
            users: usersRes.count || 0,
          });
          setChartData(
            authChartRes.data?.length
              ? authChartRes.data.map((row: any) => ({
                  dateStr: row.day,
                  name: row.day_label,
                  tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                  volume: Number(row.volume) || 0,
                  approved: Number(row.approved) || 0,
                }))
              : buildLastNDayBuckets(7),
          );
          setClaimChartData(
            claimChartRes2.data?.length
              ? claimChartRes2.data.map((row: any) => ({
                  dateStr: row.day,
                  name: row.day_label,
                  tickLabel: row.day_label?.split(" ").slice(1).join(" ") || row.day,
                  volume: Number(row.volume) || 0,
                  approved: Number(row.approved) || 0,
                }))
              : buildLastNDayBuckets(7),
          );

          // In the non-claims fallback path, only admin can see claim stats
          if (role === "admin") {
            const { data: claimsData, error: claimsError } = await (supabase as any)
              .from("hospital_claims")
              .select("status,total_amount,approved_amount,declined_amount")
              .limit(1000);
            if (!claimsError) {
              const rows = claimsData || [];
              const statusOf = (row: any) => String(row.status || "").toLowerCase();
              setClaimStats({
                submitted: rows.filter((c: any) => ["submitted", "pending", "under_review"].includes(statusOf(c))).length,
                approved: rows.filter((c: any) => statusOf(c) === "approved").length,
                partiallyApproved: rows.filter((c: any) => statusOf(c) === "partially_approved").length,
                rejected: rows.filter((c: any) => ["rejected", "declined", "denied"].includes(statusOf(c))).length,
                contested: rows.filter((c: any) => ["contested", "under_contest"].includes(statusOf(c))).length,
                paid: rows.filter((c: any) => statusOf(c) === "paid").length,
                claimedValue: rows.reduce((sum: number, c: any) => sum + Number(c.total_amount || 0), 0),
                approvedValue: rows.reduce((sum: number, c: any) => sum + Number(c.approved_amount || 0), 0),
                declinedValue: rows.reduce((sum: number, c: any) => sum + Number(c.declined_amount || 0), 0),
              });
            }
          }
        }
      }
    }
  } catch (error) {
      console.error("Dashboard stats fetch failed:", error);
      toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load dashboard") });
    } finally {
      setLoading(false);
    }
  }, [role, toast]);

  useEffect(() => {
    if (role) fetchStats(true);
  }, [role, fetchStats]);

  useTabVisibilityRefresh(fetchStats, Boolean(role));

  const isAdmin = role === "admin";
  const isClaims = role === "claims";
  const isFinance = role === "finance";
  const isUtilizationManager = role === "utilization_manager" || role === "utilization_manager_lead";
  const isNurseOrOther = role !== "admin" && role !== "claims" && role !== "finance";

  const actionBase = location.pathname.replace(/\/$/, "");
  const actionStyle = { color: "text-slate-600", bg: "bg-slate-100" };
  const adminActions = [
    { name: "Hospitals", desc: "Add and update hospitals", href: `${actionBase}/hospitals`, icon: Building2, ...actionStyle },
    { name: "Users", desc: "Manage staff access", href: `${actionBase}/users`, icon: Users, ...actionStyle },
    { name: "Authorizations", desc: "Review all requests", href: `${actionBase}/requests`, icon: ShieldCheck, ...actionStyle },
    { name: "Claims", desc: "Review and pay claims", href: `${actionBase}/claims`, icon: Banknote, ...actionStyle },
    { name: "Claims Reports", desc: "Export claims and payment data", href: `${actionBase}/claims-reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const nurseActions = [
    { name: "Authorization queue", desc: "Review pending requests", href: `${actionBase}/requests`, icon: FileText, ...actionStyle },
    { name: "Clinical inbox", desc: "Triage incoming clinical requests", href: `${actionBase}/whatsapp`, icon: MessageSquare, ...actionStyle },
    { name: "Pre-Auth Report", desc: "Download authorization codes", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const managerActions = [
    { name: "Authorization queue", desc: "Review requests awaiting a decision", href: `${actionBase}/requests`, icon: ShieldCheck, ...actionStyle },
    { name: "SLA report", desc: "Review decision times and team performance", href: `${actionBase}/reports`, icon: Activity, ...actionStyle },
    { name: "Clinical inbox", desc: "Open incoming clinical requests", href: `${actionBase}/whatsapp`, icon: MessageSquare, ...actionStyle },
    { name: "Messages", desc: "Reply to hospitals and staff", href: `${actionBase}/messages`, icon: FileText, ...actionStyle },
  ];
  const claimsActions = [
    { name: "Claims Analysis", desc: "Compare hospital claims", href: actionBase, icon: TrendingUp, ...actionStyle },
    { name: "Claims Queue", desc: "Review and resolve claims", href: `${actionBase}/all`, icon: Banknote, ...actionStyle },
    { name: "Claims Reports", desc: "Export claims data", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const financeActions = [
    { name: "Payments Queue", desc: "Pay approved claims", href: `${actionBase}/payments/awaiting`, icon: Banknote, ...actionStyle },
    { name: "Batches", desc: "Create and track batches", href: `${actionBase}/payments/batches`, icon: LayoutDashboard, ...actionStyle },
    { name: "Paid Claims", desc: "Review payment history", href: `${actionBase}/payments/paid`, icon: CheckCircle2, ...actionStyle },
    { name: "Reports", desc: "Export payment reports", href: `${actionBase}/reports`, icon: FileText, ...actionStyle },
  ];
  const actions = role === "admin"
    ? adminActions
    : isUtilizationManager
      ? managerActions
    : role === "claims"
      ? claimsActions
      : role === "finance"
        ? financeActions
        : nurseActions;

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      {isAdmin && (
        <div className="space-y-4">
          <section aria-labelledby="authorization-metrics-heading" className="space-y-2">
            <h2 id="authorization-metrics-heading" className="text-sm font-semibold text-slate-900">Clinical authorizations</h2>
            <DashboardMetricGrid loading={loading} items={[
              { label: "User roles", value: stats.users, icon: Users },
              { label: "Total requests", value: stats.total, icon: FileText },
              { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-emerald-700" },
              { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-rose-700" },
            ]} />
          </section>

          <section aria-labelledby="claims-metrics-heading" className="space-y-2">
            <h2 id="claims-metrics-heading" className="text-sm font-semibold text-slate-900">Claims</h2>
            <DashboardMetricGrid loading={loading} items={[
              { label: "Submitted", value: claimStats.submitted, icon: FileText },
              { label: "Paid", value: claimStats.paid, icon: CheckCircle2, color: "text-emerald-700" },
              { label: "Approved value", value: money(claimStats.approvedValue), icon: Banknote },
              { label: "Contested", value: claimStats.contested, icon: AlertTriangle, color: "text-amber-700" },
            ]} />
          </section>

          <section aria-labelledby="payments-metrics-heading" className="space-y-2">
            <h2 id="payments-metrics-heading" className="text-sm font-semibold text-slate-900">Payments</h2>
            <DashboardMetricGrid loading={loading} items={[
              { label: "Awaiting payment", value: money(financeStats.awaitingValue), icon: Clock, color: "text-amber-700" },
              { label: "Paid value", value: money(financeStats.paidValue), icon: Banknote },
              { label: "Settled batches", value: financeStats.paidBatches, icon: Layers },
              { label: "Total batch value", value: money(financeStats.totalBatchesValue), icon: Wallet },
            ]} />
          </section>
        </div>
      )}

      {isFinance && (
        <section aria-labelledby="finance-summary-heading" className="space-y-2">
          <h2 id="finance-summary-heading" className="text-sm font-semibold text-slate-900">Payment summary</h2>
          <DashboardMetricGrid loading={loading} items={[
          { label: "Awaiting payment", value: money(financeStats.awaitingValue), icon: Clock, color: "text-amber-700" },
          { label: "Paid value", value: money(financeStats.paidValue), icon: Banknote },
          { label: "Settled batches", value: financeStats.paidBatches, icon: Layers },
          { label: "Total batch value", value: money(financeStats.totalBatchesValue), icon: Wallet },
          ]} />
        </section>
      )}

      {isUtilizationManager && (
        <section aria-labelledby="manager-summary-heading" className="space-y-2">
          <h2 id="manager-summary-heading" className="text-sm font-semibold text-slate-900">Authorization workload</h2>
          <DashboardMetricGrid loading={loading} columns="grid-cols-2" items={[
            { label: "Total requests", value: stats.total, icon: FileText },
            { label: "Action needed", value: stats.pending, icon: Clock, color: "text-amber-700" },
            { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-emerald-700" },
            { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-rose-700" },
          ]} />
        </section>
      )}

      {isNurseOrOther && !isUtilizationManager && (
        <section aria-labelledby="requests-summary-heading" className="space-y-2">
          <h2 id="requests-summary-heading" className="text-sm font-semibold text-slate-900">Request summary</h2>
          <DashboardMetricGrid loading={loading} items={[
            { label: "Total requests", value: stats.total, icon: FileText },
            { label: "Facilities", value: stats.hospitals, icon: Building2 },
            { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-emerald-700" },
            { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-rose-700" },
          ]} />
        </section>
      )}

      {isClaims && (
        <section aria-labelledby="claims-summary-heading" className="space-y-2">
          <h2 id="claims-summary-heading" className="text-sm font-semibold text-slate-900">Claims summary</h2>
          <DashboardMetricGrid loading={loading} items={[
          { label: "Submitted", value: claimStats.submitted, icon: FileText },
          { label: "Approved", value: claimStats.approved, icon: CheckCircle2, color: "text-emerald-700" },
          { label: "Partially approved", value: claimStats.partiallyApproved, icon: Activity, color: "text-amber-700" },
          { label: "Rejected", value: claimStats.rejected, icon: XCircle, color: "text-rose-700" },
          { label: "Contested", value: claimStats.contested, icon: AlertTriangle, color: "text-amber-700" },
          { label: "Approved value", value: money(claimStats.approvedValue), icon: Banknote },
          { label: "Savings", value: money(claimStats.declinedValue), icon: Wallet },
          ]} />
        </section>
      )}
      {personalSla.loading || personalSla.averageMinutes !== null ? (
        <Card className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-live="polite">
          <div>
            <p className="text-xs font-medium text-slate-500">Your average decision time · 30 days</p>
            {personalSla.loading ? (
              <span className="mt-1 block h-5 w-20 animate-pulse rounded bg-slate-200" aria-label="Loading average decision time" />
            ) : (
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{formatSlaDuration(personalSla.averageMinutes!)}</p>
            )}
          </div>
          {!personalSla.loading && <p className="text-xs text-slate-500">{personalSla.decisions} decisions</p>}
        </Card>
      ) : null}
      {/* ── CHART SECTION ── */}
      {role === "admin" ? (
        // Admin: two charts side by side
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Auth Chart */}
          <Card className="med-card overflow-hidden p-6 flex flex-col">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={2} />
                  Authorization Activity
                </h3>
                <p className="mt-1 text-xs text-slate-500">Requests by issue date · last 7 days</p>
              </div>
            </div>
            
            <div className="h-[260px] w-full mt-auto">
              {loading ? (
                <div className="w-full h-full animate-pulse bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-slate-400">Loading chart data...</span>
                </div>
              ) : chartData.length === 0 ? (
                <div className="w-full h-full bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-slate-400">No authorization data available</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="authGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="dateStr" type="category" scale="point" axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                      tickFormatter={(v: string) => chartData.find((d) => d.dateStr === v)?.tickLabel ?? v}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }} allowDecimals={false} />
                    <RechartsTooltip 
                      labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                      formatter={(value: number, name: string) => [value.toLocaleString(), name === "volume" ? "Total Requests" : "Approved"]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", boxShadow: "0 10px 30px rgb(15 23 42 / 0.08)", fontSize: "12px", padding: "8px 12px" }} 
                    />
                    <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} name="volume" />
                    <Area type="monotone" dataKey="approved" stroke="#1D9E75" fillOpacity={1} fill="url(#authGradient)" strokeWidth={2.5} name="approved" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Claims Chart */}
          <Card className="med-card overflow-hidden p-6 flex flex-col">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Banknote className="h-4 w-4 text-amber-700" strokeWidth={2} />
                  Claims Activity
                </h3>
                <p className="mt-1 text-xs text-slate-500">Claims by submission date · last 7 days</p>
              </div>
            </div>

            <div className="h-[260px] w-full mt-auto">
              {loading ? (
                <div className="w-full h-full animate-pulse bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-slate-400">Loading chart data...</span>
                </div>
              ) : claimChartData.length === 0 ? (
                <div className="w-full h-full bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-slate-400">No claims data available</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={claimChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="claimGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#BA7517" stopOpacity={0.16} />
                        <stop offset="95%" stopColor="#BA7517" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="dateStr" type="category" scale="point" axisLine={false} tickLine={false}
                      tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                      tickFormatter={(v: string) => claimChartData.find((d) => d.dateStr === v)?.tickLabel ?? v}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }} allowDecimals={false} />
                    <RechartsTooltip 
                      labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                      formatter={(value: number, name: string) => [value.toLocaleString(), name === "volume" ? "Total Claims" : "Approved"]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", boxShadow: "0 10px 30px rgb(15 23 42 / 0.08)", fontSize: "12px", padding: "8px 12px" }} 
                    />
                    <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} name="volume" />
                    <Area type="monotone" dataKey="approved" stroke="#BA7517" fillOpacity={1} fill="url(#claimGradient)" strokeWidth={2.5} name="approved" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      ) : (
        // Staff roles: one activity chart and role-specific shortcuts
        <div className="grid gap-6 lg:grid-cols-[2.5fr_1fr]">
          <Card className="med-card overflow-hidden p-6">
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {role === "finance" ? (
                  <>
                    <Banknote className="h-4 w-4 text-amber-700" strokeWidth={1.5} />
                    Payment Activity
                  </>
                ) : role === "claims" ? (
                  <>
                    <Banknote className="h-4 w-4 text-amber-700" strokeWidth={1.5} />
                    Claims Activity
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 text-slate-600" strokeWidth={1.5} />
                    {isUtilizationManager ? "Authorization activity" : "Request activity"}
                  </>
                )}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {role === "finance"
                  ? "Payment activity · last 7 days"
                  : role === "claims"
                  ? "Claims activity · last 7 days"
                  : isUtilizationManager
                    ? "Requests by issue date · last 7 days"
                    : "Requests by issue date · last 7 days"}
              </p>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={role === "claims" || role === "finance" ? "#BA7517" : "#1D9E75"} stopOpacity={0.16} />
                      <stop offset="95%" stopColor={role === "claims" || role === "finance" ? "#BA7517" : "#1D9E75"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="dateStr" type="category" scale="point" axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }}
                    tickFormatter={(dateStr: string) => chartData.find((d) => d.dateStr === dateStr)?.tickLabel ?? dateStr}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 500, fill: "#64748B" }} allowDecimals={false} />
                  <RechartsTooltip
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", boxShadow: "0 10px 30px rgb(15 23 42 / 0.08)", fontSize: "12px" }}
                    formatter={(value: any, name: string) => {
                      const formattedName =
                        name === "volume"
                          ? (role === "finance" ? "Paid claims" : isUtilizationManager ? "Requests" : "Submitted volume")
                          : name === "approved"
                          ? (role === "finance" ? "Paid value" : isUtilizationManager ? "Approved" : "Approved volume")
                          : name;
                      const formattedValue =
                        role === "finance" && name === "approved"
                          ? money(Number(value))
                          : typeof value === "number"
                          ? value.toLocaleString()
                          : value;
                      return [formattedValue, formattedName];
                    }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="approved" stroke={role === "claims" || role === "finance" ? "#BA7517" : "#1D9E75"} fillOpacity={1} fill="url(#colorVolume)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="med-card p-5">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Shortcuts</h3>
              <div className="grid grid-cols-1 gap-3">
                {actions.map((action) => (
                  <button key={action.name} onClick={() => navigate(action.href)} className="flex items-center gap-3 rounded-lg p-3 text-left transition hover:bg-slate-50">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-[10px]", action.bg, action.color)}>
                      <action.icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-slate-900">{action.name}</h4>
                      <p className="mt-0.5 text-xs text-slate-500">{action.desc}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}


    </div>
  );
}
