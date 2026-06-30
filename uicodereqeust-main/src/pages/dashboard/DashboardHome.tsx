import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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

const StatSkeleton = () => (
  <div className="h-3.5 w-12 animate-pulse rounded bg-slate-200" />
);

export default function DashboardHome() {
  const { role } = useAuth();
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
  const [chartData, setChartData] = useState<any[]>([]);
  const [claimChartData, setClaimChartData] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const lastFetchedRef = useRef(0);

  const fetchStats = useCallback(async (force = false) => {
    const now = Date.now();
    const THROTTLE_MS = 30000;
    if (!force && now - lastFetchedRef.current < THROTTLE_MS) {
      console.log("DashboardHome: fetchStats throttled to prevent spam");
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
            .is("payment_batch_id", null),
          supabase
            .from("hospital_claims" as any)
            .select("approved_amount,total_amount")
            .eq("status", "paid"),
          supabase
            .from("payment_batches" as any)
            .select("status,total_amount")
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
            supabase.from("hospital_claims" as any).select("*", { count: "estimated", head: true }),
            supabase.from("hospital_claims" as any).select("*", { count: "estimated", head: true }).eq("status", "approved"),
            supabase.from("hospital_claims" as any).select("*", { count: "estimated", head: true }).eq("status", "rejected"),
            supabase.from("hospital_claims" as any).select("*", { count: "estimated", head: true }).or("status.eq.submitted,status.eq.pending"),
            supabase.from("hospitals").select("*", { count: "estimated", head: true }),
            supabase.from("user_roles").select("id", { count: "estimated", head: true }),
            supabase.from("historical_codes" as any).select("*", { count: "estimated", head: true }).eq("record_type", "claim"),
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
            supabase.from("authorization_requests").select("*", { count: "estimated", head: true }),
            supabase.from("authorization_requests").select("*", { count: "estimated", head: true }).eq("status", "approved"),
            supabase.from("authorization_requests").select("*", { count: "estimated", head: true }).eq("status", "rejected"),
            supabase.from("authorization_requests").select("*", { count: "estimated", head: true }).eq("status", "pending"),
            supabase.from("hospitals").select("*", { count: "estimated", head: true }),
            supabase.from("user_roles").select("id", { count: "estimated", head: true }),
            supabase.rpc("dashboard_live_activity_7d" as any),
            supabase.rpc("dashboard_claims_activity_7d" as any),
            supabase.from("historical_codes" as any).select("*", { count: "estimated", head: true }).eq("record_type", "authorization"),
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
              .select("status,total_amount,approved_amount,declined_amount");
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

  const actionBase = location.pathname.replace(/\/$/, "");
  const actionStyle = { color: "text-[#93c34b]", bg: "bg-[#E1F5EE]" };
  const adminActions = [
    { name: "Hospitals", desc: "Manage facilities", href: `${actionBase}/hospitals`, icon: Building2, ...actionStyle },
    { name: "Users", desc: "Access control", href: `${actionBase}/users`, icon: Users, ...actionStyle },
    { name: "Authorizations", desc: "Global queue", href: `${actionBase}/requests`, icon: ShieldCheck, ...actionStyle },
    { name: "Claims", desc: "Financial audit", href: `${actionBase}/claims`, icon: Banknote, ...actionStyle },
    { name: "Claims Reports", desc: "Payment exports", href: `${actionBase}/claims-reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const nurseActions = [
    { name: "Auth Queue", desc: "Review pending", href: `${actionBase}/requests`, icon: FileText, ...actionStyle },
    { name: "Clinical Feed", desc: "Priority desk", href: `${actionBase}/whatsapp`, icon: MessageSquare, ...actionStyle },
    { name: "Pre-Auth Report", desc: "Export auth codes CSV", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const claimsActions = [
    { name: "Claims Analysis", desc: "Hospital performance", href: actionBase, icon: TrendingUp, ...actionStyle },
    { name: "Claims Queue", desc: "Review and audit claims", href: `${actionBase}/all`, icon: Banknote, ...actionStyle },
    { name: "Claims Reports", desc: "Export payment reports", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const financeActions = [
    { name: "Payments Queue", desc: "Awaiting payments", href: `${actionBase}/payments/awaiting`, icon: Banknote, ...actionStyle },
    { name: "Batches", desc: "Manage payment batches", href: `${actionBase}/payments/batches`, icon: LayoutDashboard, ...actionStyle },
    { name: "Paid Claims", desc: "History of paid claims", href: `${actionBase}/payments/paid`, icon: CheckCircle2, ...actionStyle },
    { name: "Reports", desc: "Export finance reports", href: `${actionBase}/reports`, icon: FileText, ...actionStyle },
  ];
  const actions = role === "admin"
    ? adminActions
    : role === "claims"
      ? claimsActions
      : role === "finance"
        ? financeActions
        : nurseActions;

  const mainStats = [
    { label: role === "admin" ? "Active Users" : role === "claims" ? "Total Claims" : "Total Load", value: role === "admin" ? stats.users : stats.total, icon: Users, color: "text-blue-600" },
    { label: "Facilities", value: stats.hospitals, icon: Building2, color: "text-slate-700" },
    { label: "Approved", value: stats.approved, icon: CheckCircle2, color: "text-emerald-600" },
    { label: role === "claims" ? "Pending Review" : "Rejected", value: role === "claims" ? stats.pending : stats.rejected, icon: role === "claims" ? Clock : XCircle, color: role === "claims" ? "text-amber-600" : "text-rose-600" },
  ];

  const isAdmin = role === "admin";
  const isClaims = role === "claims";
  const isFinance = role === "finance";
  const isNurseOrOther = role !== "admin" && role !== "claims" && role !== "finance";

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      {isAdmin && (
        <div className="space-y-3">
          {/* ── Row 1: Clinical Authorizations ── */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Clinical Authorizations</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {[
                { label: "Active Users",    value: stats.users,     icon: Users,         color: "text-blue-600" },
                { label: "Total Requests",  value: stats.total,     icon: FileText,      color: "text-slate-700" },
                { label: "Approved",        value: stats.approved,  icon: CheckCircle2,  color: "text-emerald-600" },
                { label: "Rejected",        value: stats.rejected,  icon: XCircle,       color: "text-rose-600" },
              ].map((item) => (
                <div key={item.label} className="border-slate-100 shadow-sm bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group flex flex-col p-0 cursor-pointer" title={item.label}>
                  <div className="p-2.5 sm:p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
                      <p className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight pr-1 max-w-[75%]">{item.label}</p>
                      <div className="flex h-6 w-6 sm:h-10 sm:w-10 md:h-12 md:w-12 rounded-md sm:rounded-xl items-center justify-center shrink-0 transition-colors duration-300 bg-slate-50 group-hover:bg-slate-100">
                        <item.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", item.color)} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 text-left w-full">
                      <p className="hidden sm:block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 break-words leading-tight group-hover:text-slate-500 transition-colors">{item.label}</p>
                      <div className={cn("text-sm sm:text-lg md:text-xl font-black tracking-tight break-words leading-tight sm:mt-1", item.color)}>
                        {loading ? <StatSkeleton /> : (item.value !== undefined ? Number(item.value).toLocaleString() : 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Row 2: Claims Processing ── */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Claims Processing</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {[
                { label: "Submitted",     value: claimStats.submitted,                  color: "text-blue-600", format: "number", icon: FileText },
                { label: "Paid",          value: claimStats.paid,                       color: "text-emerald-600", format: "number", icon: CheckCircle2 },
                { label: "Appr. Value",   value: money(claimStats.approvedValue),       color: "text-emerald-600", format: "money", icon: Banknote },
                { label: "Contested",     value: claimStats.contested,                  color: "text-amber-600", format: "number", icon: AlertTriangle },
              ].map((item) => (
                <div key={item.label} className="border-slate-100 shadow-sm bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group flex flex-col p-0 cursor-pointer" title={item.label}>
                  <div className="p-2.5 sm:p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
                      <p className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight pr-1 max-w-[75%]">{item.label}</p>
                      <div className="flex h-6 w-6 sm:h-10 sm:w-10 md:h-12 md:w-12 rounded-md sm:rounded-xl items-center justify-center shrink-0 transition-colors duration-300 bg-slate-50 group-hover:bg-slate-100">
                        <item.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", item.color)} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 text-left w-full">
                      <p className="hidden sm:block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 break-words leading-tight group-hover:text-slate-500 transition-colors">{item.label}</p>
                      <div className={cn("text-sm sm:text-lg md:text-xl font-black tracking-tight break-words leading-tight sm:mt-1", item.color)}>
                        {loading ? <StatSkeleton /> : (item.format === "number" ? Number(item.value || 0).toLocaleString() : item.value)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Row 3: Payment & Finance ── */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Payment &amp; Finance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {[
                { label: "Awaiting Value",  value: money(financeStats.awaitingValue),      color: "text-amber-600", icon: Clock },
                { label: "Paid Value",      value: money(financeStats.paidValue),          color: "text-emerald-600", icon: Banknote },
                { label: "Settled Batches", value: financeStats.paidBatches,               color: "text-indigo-600", icon: Layers },
                { label: "Batches Value",   value: money(financeStats.totalBatchesValue),  color: "text-violet-600", icon: Wallet },
              ].map((item) => (
                <div key={item.label} className="border-slate-100 shadow-sm bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group flex flex-col p-0 cursor-pointer" title={item.label}>
                  <div className="p-2.5 sm:p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
                    <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
                      <p className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight pr-1 max-w-[75%]">{item.label}</p>
                      <div className="flex h-6 w-6 sm:h-10 sm:w-10 md:h-12 md:w-12 rounded-md sm:rounded-xl items-center justify-center shrink-0 transition-colors duration-300 bg-slate-50 group-hover:bg-slate-100">
                        <item.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", item.color)} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 text-left w-full">
                      <p className="hidden sm:block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 break-words leading-tight group-hover:text-slate-500 transition-colors">{item.label}</p>
                      <div className={cn("text-sm sm:text-lg md:text-xl font-black tracking-tight break-words leading-tight sm:mt-1", item.color)}>
                        {loading ? <StatSkeleton /> : item.value}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isFinance && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          {[
            { label: "Awaiting Value",  value: money(financeStats.awaitingValue),      color: "text-amber-600", icon: Clock },
            { label: "Paid Value",      value: money(financeStats.paidValue),          color: "text-emerald-600", icon: Banknote },
            { label: "Settled Batches", value: financeStats.paidBatches,               color: "text-indigo-600", icon: Layers },
            { label: "Batches Value",   value: money(financeStats.totalBatchesValue),  color: "text-violet-600", icon: Wallet },
          ].map((item) => (
            <div key={item.label} className="border-slate-100 shadow-sm bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group flex flex-col p-0 cursor-pointer" title={item.label}>
              <div className="p-2.5 sm:p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
                <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
                  <p className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight pr-1 max-w-[75%]">{item.label}</p>
                  <div className="flex h-6 w-6 sm:h-10 sm:w-10 md:h-12 md:w-12 rounded-md sm:rounded-xl items-center justify-center shrink-0 transition-colors duration-300 bg-slate-50 group-hover:bg-slate-100">
                    <item.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", item.color)} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 text-left w-full">
                  <p className="hidden sm:block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 break-words leading-tight group-hover:text-slate-500 transition-colors">{item.label}</p>
                  <div className={cn("text-sm sm:text-lg md:text-xl font-black tracking-tight break-words leading-tight sm:mt-1", item.color)}>
                    {loading ? <StatSkeleton /> : item.value}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isNurseOrOther && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 md:gap-4 overflow-x-hidden">
          {mainStats.map((item) => (
            <div key={item.label} className="border-slate-100 shadow-sm bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group flex flex-col p-0 cursor-pointer" title={item.label}>
              <div className="p-2.5 sm:p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
                <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
                  <p className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight pr-1 max-w-[75%]">{item.label}</p>
                  <div className="flex h-6 w-6 sm:h-10 sm:w-10 md:h-12 md:w-12 rounded-md sm:rounded-xl items-center justify-center shrink-0 transition-colors duration-300 bg-slate-50 group-hover:bg-slate-100">
                    <item.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", item.color)} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 text-left w-full">
                  <p className="hidden sm:block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 break-words leading-tight group-hover:text-slate-500 transition-colors">{item.label}</p>
                  <div className={cn("text-sm sm:text-lg md:text-xl font-black tracking-tight break-words leading-tight sm:mt-1", item.color)}>
                    {loading ? <StatSkeleton /> : Number(item.value || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isClaims && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3 md:gap-4">
          {[
            { label: "Submitted", value: claimStats.submitted, color: "text-blue-600", icon: FileText },
            { label: "Approved", value: claimStats.approved, color: "text-emerald-600", icon: CheckCircle2 },
            { label: "Partial", value: claimStats.partiallyApproved, color: "text-amber-600", icon: Activity },
            { label: "Rejected", value: claimStats.rejected, color: "text-rose-600", icon: XCircle },
            { label: "Contested", value: claimStats.contested, color: "text-violet-600", icon: AlertTriangle },
            { label: "Appr. Value", value: money(claimStats.approvedValue), color: "text-emerald-600", icon: Banknote },
            { label: "Savings", value: money(claimStats.declinedValue), color: "text-teal-600", icon: Wallet },
          ].map((item) => (
            <div key={item.label} className="border-slate-100 shadow-sm bg-white rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1 group flex flex-col p-0 cursor-pointer" title={item.label}>
              <div className="p-2.5 sm:p-4 md:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-3">
                <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
                  <p className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-slate-500 break-words leading-tight pr-1 max-w-[75%]">{item.label}</p>
                  <div className="flex h-6 w-6 sm:h-10 sm:w-10 md:h-12 md:w-12 rounded-md sm:rounded-xl items-center justify-center shrink-0 transition-colors duration-300 bg-slate-50 group-hover:bg-slate-100">
                    <item.icon className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 md:h-6 md:w-6 transition-transform duration-300 group-hover:scale-110", item.color)} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 text-left w-full">
                  <p className="hidden sm:block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 break-words leading-tight group-hover:text-slate-500 transition-colors">{item.label}</p>
                  <div className={cn("text-sm sm:text-lg md:text-xl font-black tracking-tight break-words leading-tight sm:mt-1", item.color)}>
                    {loading ? <StatSkeleton /> : (typeof item.value === "number" ? item.value.toLocaleString() : item.value)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CHART SECTION ── */}
      {role === "admin" ? (
        // Admin: two charts side by side
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Auth Chart */}
          <Card className="med-card overflow-hidden p-6 flex flex-col">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-[#1D9E75]" strokeWidth={2} />
                  Authorization Activity
                </h3>
                <p className="mt-1 text-xs text-slate-500">Live volume by issue date (Last 7 Days)</p>
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
                  <Banknote className="h-4 w-4 text-[#BA7517]" strokeWidth={2} />
                  Claims Activity
                </h3>
                <p className="mt-1 text-xs text-slate-500">Live volume by submission date (Last 7 Days)</p>
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
        // Nurse / Claims: single chart + quick access sidebar
        <div className="grid gap-6 lg:grid-cols-[2.5fr_1fr]">
          <Card className="med-card overflow-hidden p-6">
            <div className="mb-6">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1E293B]">
                {role === "finance" ? (
                  <>
                    <Banknote className="h-4 w-4 text-[#BA7517]" strokeWidth={1.5} />
                    Payment Activity
                  </>
                ) : role === "claims" ? (
                  <>
                    <Banknote className="h-4 w-4 text-[#BA7517]" strokeWidth={1.5} />
                    Claims Activity
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4 text-[#93c34b]" strokeWidth={1.5} />
                    Volume Performance
                  </>
                )}
              </h3>
              <p className="mt-1 text-sm text-[#888780]">
                {role === "finance"
                  ? "Live payment activity, last 7 calendar days"
                  : role === "claims"
                  ? "Live claims activity, last 7 calendar days"
                  : "Live authorizations by issue date, last 7 days"}
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
                          ? (role === "finance" ? "Paid Claims" : "Submitted Volume")
                          : name === "approved"
                          ? (role === "finance" ? "Paid Value" : "Approved Volume")
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
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.06em] text-[#888780]">Quick Access</h3>
              <div className="grid grid-cols-1 gap-3">
                {actions.map((action) => (
                  <button key={action.name} onClick={() => navigate(action.href)} className="flex items-center gap-3 rounded-lg p-3 text-left transition hover:bg-slate-50">
                    <div className={cn("flex h-10 w-10 items-center justify-center rounded-[10px]", action.bg, action.color)}>
                      <action.icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-[#1a1a1a]">{action.name}</h4>
                      <p className="mt-0.5 text-xs text-[#888780]">{action.desc}</p>
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
