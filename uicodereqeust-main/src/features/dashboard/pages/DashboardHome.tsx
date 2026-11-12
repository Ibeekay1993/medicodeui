import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { DashboardMetricGrid } from "@/components/dashboard/DashboardMetricGrid";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
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

const parseAggregateNumber = (value: unknown) => {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

type DashboardFinanceAggregate = {
  awaiting_count: number;
  awaiting_value: number;
  paid_count: number;
  paid_value: number;
  draft_batches: number;
  ready_batches: number;
  paid_batches: number;
  total_batches_value: number;
  admin_claims: {
    submitted: number;
    approved: number;
    partially_approved: number;
    rejected: number;
    contested: number;
    paid: number;
    claimed_value: number;
    approved_value: number;
    declined_value: number;
  } | null;
};

type DashboardStats = {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  hospitals: number;
  users: number;
  authorizedAmount: number;
  historical: number;
};

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  total: 0,
  approved: 0,
  rejected: 0,
  pending: 0,
  hospitals: 0,
  users: 0,
  authorizedAmount: 0,
  historical: 0,
};

export default function DashboardHome() {
  const { role } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(EMPTY_DASHBOARD_STATS);
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
  const [financeStatsError, setFinanceStatsError] = useState(false);
  const [claimStatsError, setClaimStatsError] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [authorizationStatsError, setAuthorizationStatsError] = useState(false);
  const [authorizedAmountError, setAuthorizedAmountError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [claimChartData, setClaimChartData] = useState<any[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const lastFetchedRef = useRef(0);

  const fetchStats = useCallback(async (force = false, silent = false) => {
    const now = Date.now();
    const THROTTLE_MS = 60000;
    if (!force && now - lastFetchedRef.current < THROTTLE_MS) {
      return;
    }
    lastFetchedRef.current = now;

    if (!silent) setLoading(true);
    try {
      const isClaimsRole = role === "claims" || role === "claims_lead";
      const isFinanceRole = role === "finance";
      const isAdmin = role === "admin";

      if (isFinanceRole || isAdmin) {
        try {
          const { data: financeResponse, error: financeError } = await supabase.rpc("get_dashboard_finance_stats");
          const financeData = financeResponse as unknown as DashboardFinanceAggregate | null;
          if (financeError || !financeData || typeof financeData !== "object") {
            console.error("Failed to fetch complete dashboard finance aggregates:", financeError || "Invalid response");
            setFinanceStatsError(true);
            if (isAdmin) setClaimStatsError(true);
          } else {
            const financeValues = [
              financeData.awaiting_count,
              financeData.awaiting_value,
              financeData.paid_count,
              financeData.paid_value,
              financeData.draft_batches,
              financeData.ready_batches,
              financeData.paid_batches,
              financeData.total_batches_value,
            ].map(parseAggregateNumber);
            if (financeValues.some((value: number) => !Number.isFinite(value) || value < 0)) {
              console.error("Dashboard finance aggregate response is incomplete.");
              setFinanceStatsError(true);
              if (isAdmin) setClaimStatsError(true);
            } else {
              setFinanceStats({
                awaitingCount: financeValues[0],
                awaitingValue: financeValues[1],
                paidCount: financeValues[2],
                paidValue: financeValues[3],
                draftBatches: financeValues[4],
                readyBatches: financeValues[5],
                paidBatches: financeValues[6],
                totalBatchesValue: financeValues[7],
              });
              setFinanceStatsError(false);

              if (isAdmin) {
                const adminClaims = financeData.admin_claims;
                const claimValues = adminClaims && [
                  adminClaims.submitted,
                  adminClaims.approved,
                  adminClaims.partially_approved,
                  adminClaims.rejected,
                  adminClaims.contested,
                  adminClaims.paid,
                  adminClaims.claimed_value,
                  adminClaims.approved_value,
                  adminClaims.declined_value,
                ].map(parseAggregateNumber);
                if (!claimValues || claimValues.some((value: number) => !Number.isFinite(value) || value < 0)) {
                  console.error("Dashboard claims aggregate response is incomplete.");
                  setClaimStatsError(true);
                } else {
                  setClaimStats({
                    submitted: claimValues[0],
                    approved: claimValues[1],
                    partiallyApproved: claimValues[2],
                    rejected: claimValues[3],
                    contested: claimValues[4],
                    paid: claimValues[5],
                    claimedValue: claimValues[6],
                    approvedValue: claimValues[7],
                    declinedValue: claimValues[8],
                  });
                  setClaimStatsError(false);
                }
              }
            }
          }
        } catch (financeError) {
          console.error("Dashboard finance aggregate request failed:", financeError);
          setFinanceStatsError(true);
          if (isAdmin) setClaimStatsError(true);
        }

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
          const claimValues = [
            rpcData.claims?.total,
            rpcData.claims?.approved,
            rpcData.claims?.rejected,
            rpcData.historical_claims,
            rpcData.hospitals,
            rpcData.users,
          ].map(parseAggregateNumber);
          const [liveTotal, liveApproved, liveRejected, historical, hospitals, users] = claimValues;
          const claimCountsValid =
            claimValues.every((value) => Number.isFinite(value) && value >= 0) &&
            liveApproved + liveRejected <= liveTotal;
          if (claimCountsValid) {
            setStats({
              total: liveTotal + historical,
              approved: liveApproved,
              rejected: liveRejected,
              pending: liveTotal - liveApproved - liveRejected,
              hospitals,
              users,
              authorizedAmount: 0,
              historical,
            });
            setStatsError(false);
          } else {
            setStats(EMPTY_DASHBOARD_STATS);
            setStatsError(true);
          }
          setAuthorizationStatsError(false);
          setAuthorizedAmountError(false);

          if (isClaimsRole) {
            const claimSummary = rpcData.admin_claims;
            const claimValues = claimSummary && [
              claimSummary.submitted,
              claimSummary.approved,
              claimSummary.partially_approved,
              claimSummary.rejected,
              claimSummary.contested,
              claimSummary.paid,
              claimSummary.claimed_value,
              claimSummary.approved_value,
              claimSummary.declined_value,
            ].map(parseAggregateNumber);
            if (!claimValues || claimValues.some((value: number) => !Number.isFinite(value) || value < 0)) {
              setClaimStatsError(true);
            } else {
              setClaimStats({
                submitted: claimValues[0],
                approved: claimValues[1],
                partiallyApproved: claimValues[2],
                rejected: claimValues[3],
                contested: claimValues[4],
                paid: claimValues[5],
                claimedValue: claimValues[6],
                approvedValue: claimValues[7],
                declinedValue: claimValues[8],
              });
              setClaimStatsError(false);
            }
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
          const authValues = [
            rpcData.auth?.total,
            rpcData.auth?.approved,
            rpcData.auth?.rejected,
            rpcData.historical_auths,
            rpcData.hospitals,
            rpcData.users,
          ].map(parseAggregateNumber);
          const [liveTotal, liveApproved, liveRejected, historical, hospitals, users] = authValues;
          const authorizedAmount = parseAggregateNumber(rpcData.auth?.approved_amount);
          const authCountsValid =
            authValues.every((value) => Number.isFinite(value) && value >= 0) &&
            liveApproved + liveRejected <= liveTotal;
          if (authCountsValid) {
            setStats({
              total: liveTotal + historical,
              approved: liveApproved,
              rejected: liveRejected,
              pending: liveTotal - liveApproved - liveRejected,
              hospitals,
              users,
              authorizedAmount: Number.isFinite(authorizedAmount) ? authorizedAmount : 0,
              historical,
            });
            setStatsError(false);
          } else {
            setStats(EMPTY_DASHBOARD_STATS);
            setStatsError(true);
          }
          setAuthorizationStatsError(!authCountsValid);
          setAuthorizedAmountError(!Number.isFinite(authorizedAmount));

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

        }
      } else {
        console.warn("get_dashboard_stats RPC failed or not found, falling back to legacy queries:", rpcError);
        if (isClaimsRole) {
          setClaimStatsError(true);
          const [allClaims, approvedClaims, rejectedClaims, hospitalsRes, usersRes, historicalClaims] = await Promise.all([
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }),
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }).eq("status", "approved"),
            supabase.from("hospital_claims" as any).select("id", { count: "exact", head: true }).eq("status", "rejected"),
            supabase.from("hospitals").select("id", { count: "exact", head: true }),
            supabase.from("user_roles").select("id", { count: "exact", head: true }),
            supabase.from("historical_codes" as any).select("id", { count: "exact", head: true }).eq("record_type", "claim"),
          ]);
          const liveTotal = allClaims.count;
          const approved = approvedClaims.count;
          const rejected = rejectedClaims.count;
          const historical = historicalClaims.count;
          const countsAvailable =
            !allClaims.error && !approvedClaims.error && !rejectedClaims.error &&
            !hospitalsRes.error && !usersRes.error && !historicalClaims.error &&
            [liveTotal, approved, rejected, historical, hospitalsRes.count, usersRes.count].every(
              (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
            ) && (approved as number) + (rejected as number) <= (liveTotal as number);
          if (countsAvailable) {
            setStats({
              total: (liveTotal as number) + (historical as number),
              approved: approved as number,
              rejected: rejected as number,
              pending: (liveTotal as number) - (approved as number) - (rejected as number),
              hospitals: hospitalsRes.count as number,
              users: usersRes.count as number,
              authorizedAmount: 0,
              historical: historical as number,
            });
            setStatsError(false);
          } else {
            setStats(EMPTY_DASHBOARD_STATS);
            setStatsError(true);
          }
          setAuthorizationStatsError(false);
          setAuthorizedAmountError(true);

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
          const [totalRes, approvedRes, rejectedRes, hospitalsRes, usersRes, authChartRes, claimChartRes2, historicalAuths] = await Promise.all([
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }).or("status.is.null,status.neq.deferred"),
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }).in("status", ["approved", "partially_approved", "authorization_approved", "referral_approved", "referral_accepted"]),
            supabase.from("authorization_requests").select("id", { count: "exact", head: true }).in("status", ["rejected", "referral_declined", "referral_expired", "accepted_referral_expired"]),
            supabase.from("hospitals").select("id", { count: "exact", head: true }),
            supabase.from("user_roles").select("id", { count: "exact", head: true }),
            supabase.rpc("dashboard_live_activity_7d" as any),
            supabase.rpc("dashboard_claims_activity_7d" as any),
            supabase.from("historical_codes" as any).select("id", { count: "exact", head: true }).eq("record_type", "authorization"),
          ]);
          const liveTotal = totalRes.count;
          const approved = approvedRes.count;
          const rejected = rejectedRes.count;
          const historical = historicalAuths.count;
          const authCountsAvailable =
            !totalRes.error && !approvedRes.error && !rejectedRes.error &&
            !historicalAuths.error &&
            [liveTotal, approved, rejected, historical].every(
              (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
            ) && (approved as number) + (rejected as number) <= (liveTotal as number);
          const allStatsAvailable =
            authCountsAvailable && !hospitalsRes.error && !usersRes.error &&
            typeof hospitalsRes.count === "number" && Number.isFinite(hospitalsRes.count) &&
            typeof usersRes.count === "number" && Number.isFinite(usersRes.count);
          if (allStatsAvailable) {
            setStats({
              total: (liveTotal as number) + (historical as number),
              approved: approved as number,
              rejected: rejected as number,
              pending: (liveTotal as number) - (approved as number) - (rejected as number),
              hospitals: hospitalsRes.count as number,
              users: usersRes.count as number,
              authorizedAmount: 0,
              historical: historical as number,
            });
          } else {
            setStats(EMPTY_DASHBOARD_STATS);
          }
          setStatsError(!allStatsAvailable);
          setAuthorizationStatsError(!authCountsAvailable);
          setAuthorizedAmountError(true);
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

        }
      }
    }
  } catch (error) {
      console.error("Dashboard stats fetch failed:", error);
      setStats(EMPTY_DASHBOARD_STATS);
      setStatsError(true);
      setAuthorizationStatsError(role !== "claims" && role !== "claims_lead" && role !== "finance");
      setAuthorizedAmountError(role === "admin");
      toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load dashboard") });
    } finally {
      setLoading(false);
    }
  }, [role, toast]);

  useEffect(() => {
    if (role) fetchStats(true);
  }, [role, fetchStats]);

  useTabVisibilityRefresh(() => fetchStats(false, true), Boolean(role));

  const isAdmin = role === "admin";
  const isClaims = role === "claims" || role === "claims_lead";
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
    { name: "Claims Reports", desc: "Analyze claims and export detailed reports", href: `${actionBase}/claims-reports`, icon: LayoutDashboard, ...actionStyle },
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
      {!isAdmin && (statsError || authorizationStatsError) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>Dashboard totals could not be confirmed. Incomplete totals are hidden.</span>
          <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
            Retry totals
          </button>
        </div>
      )}
      {isAdmin && (
        <div className="space-y-4">
          {(statsError || authorizationStatsError || authorizedAmountError || financeStatsError || claimStatsError) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span>Some dashboard totals could not be confirmed. Incomplete totals are hidden.</span>
              <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
                Retry totals
              </button>
            </div>
          )}
          <AdminOverview
            loading={loading}
            basePath={actionBase}
            authError={authorizationStatsError}
            authAmountError={authorizedAmountError}
            claimsError={claimStatsError}
            paymentsError={financeStatsError}
            auth={{
              total: stats.total,
              approved: stats.approved,
              rejected: stats.rejected,
              historical: stats.historical,
              authorizedAmount: stats.authorizedAmount,
            }}
            claims={{
              submitted: claimStats.submitted,
              paid: claimStats.paid,
              contested: claimStats.contested,
              approvedValue: claimStats.approvedValue,
            }}
            payments={{
              awaitingCount: financeStats.awaitingCount,
              awaitingValue: financeStats.awaitingValue,
              paidValue: financeStats.paidValue,
              settledBatches: financeStats.paidBatches,
              totalBatchValue: financeStats.totalBatchesValue,
            }}
          />
        </div>
      )}

      {isFinance && (
        <section aria-labelledby="finance-summary-heading" className="space-y-1 sm:space-y-1.5">
          {financeStatsError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span>Payment totals could not be confirmed. Incomplete totals are hidden.</span>
              <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
                Retry totals
              </button>
            </div>
          )}
          <div id="finance-summary-heading" role="heading" aria-level={2} className="text-[10.5px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Payment Summary</div>
          <DashboardMetricGrid loading={loading} items={[
          { label: "Awaiting payment", value: financeStatsError ? "—" : money(financeStats.awaitingValue), icon: Clock, color: "text-amber-700" },
          { label: "Paid value", value: financeStatsError ? "—" : money(financeStats.paidValue), icon: Banknote },
          { label: "Settled batches", value: financeStatsError ? "—" : financeStats.paidBatches, icon: Layers },
          { label: "Total batch value", value: financeStatsError ? "—" : money(financeStats.totalBatchesValue), icon: Wallet },
          ]} />
        </section>
      )}

      {isUtilizationManager && (
        <section aria-labelledby="manager-summary-heading" className="space-y-1 sm:space-y-1.5">
          <div id="manager-summary-heading" role="heading" aria-level={2} className="text-[10.5px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Authorization Workload</div>
          <DashboardMetricGrid loading={loading} columns="grid-cols-2" items={[
            { label: "Total requests", value: statsError ? "—" : stats.total, icon: FileText },
            { label: "Action needed", value: statsError ? "—" : stats.pending, icon: Clock, color: "text-amber-700" },
            { label: "Approved", value: statsError ? "—" : stats.approved, icon: CheckCircle2, color: "text-emerald-700" },
            { label: "Rejected", value: statsError ? "—" : stats.rejected, icon: XCircle, color: "text-rose-700" },
          ]} />
        </section>
      )}

      {isNurseOrOther && !isUtilizationManager && (
        <section aria-labelledby="requests-summary-heading" className="space-y-1 sm:space-y-1.5">
          <div id="requests-summary-heading" role="heading" aria-level={2} className="text-[10.5px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Request Summary</div>
          <DashboardMetricGrid loading={loading} items={[
            { label: "Total requests", value: statsError ? "—" : stats.total, icon: FileText },
            { label: "Facilities", value: statsError ? "—" : stats.hospitals, icon: Building2 },
            { label: "Approved", value: statsError ? "—" : stats.approved, icon: CheckCircle2, color: "text-emerald-700" },
            { label: "Rejected", value: statsError ? "—" : stats.rejected, icon: XCircle, color: "text-rose-700" },
          ]} />
        </section>
      )}

      {isClaims && (
        <section aria-labelledby="claims-summary-heading" className="space-y-1 sm:space-y-1.5">
          {claimStatsError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span>Claim totals could not be confirmed. Incomplete totals are hidden.</span>
              <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
                Retry totals
              </button>
            </div>
          )}
          <div id="claims-summary-heading" role="heading" aria-level={2} className="text-[10.5px] sm:text-xs font-bold uppercase tracking-wider text-slate-500">Claims Overview</div>
          <DashboardMetricGrid loading={loading} items={[
          { label: "Submitted", value: claimStatsError ? "—" : claimStats.submitted, icon: FileText },
          { label: "Approved", value: claimStatsError ? "—" : claimStats.approved, icon: CheckCircle2, color: "text-emerald-700" },
          { label: "Partially approved", value: claimStatsError ? "—" : claimStats.partiallyApproved, icon: Activity, color: "text-amber-700" },
          { label: "Rejected", value: claimStatsError ? "—" : claimStats.rejected, icon: XCircle, color: "text-rose-700" },
          { label: "Contested", value: claimStatsError ? "—" : claimStats.contested, icon: AlertTriangle, color: "text-amber-700" },
          { label: "Approved value", value: claimStatsError ? "—" : money(claimStats.approvedValue), icon: Banknote },
          { label: "Savings", value: claimStatsError ? "—" : money(claimStats.declinedValue), icon: Wallet },
          ]} />
        </section>
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
                      labelFormatter={(label) => chartData.find((item) => item.dateStr === String(label))?.name ?? ""}
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
                      labelFormatter={(label) => claimChartData.find((item) => item.dateStr === String(label))?.name ?? ""}
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
