import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { RoleDashboardOverview, type RoleDashboardRecord } from "@/components/dashboard/RoleDashboardOverview";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ACTION_REQUIRED_AUTHORIZATION_STATUSES } from "@/features/dashboard/constants/requestStatuses";
import {
  ArrowUpRight,
  Banknote,
  Building2,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Users,
  Activity,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
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

const compactMoney = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  notation: "compact",
  maximumFractionDigits: 1,
}).format(value || 0);

const APPROVED_AUTHORIZATION_STATUSES = new Set([
  "approved",
  "partially_approved",
  "authorization_approved",
  "referral_approved",
  "referral_accepted",
]);
const REJECTED_AUTHORIZATION_STATUSES = new Set([
  "rejected",
  "referral_declined",
  "referral_expired",
  "accepted_referral_expired",
]);

type AuthorizationStatusCount = { status: string; count: number };

const parseAggregateNumber = (value: unknown) => {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseActivityRows = (rows: any[] | null | undefined) => {
  if (!Array.isArray(rows)) return null;
  const parsed = rows.map((row: any) => {
    const volume = parseAggregateNumber(row?.volume);
    const approved = parseAggregateNumber(row?.approved ?? row?.amount);
    if (typeof row?.day !== "string" || !Number.isFinite(volume) || volume < 0 || !Number.isFinite(approved) || approved < 0) {
      return null;
    }
    return {
      dateStr: row.day,
      name: typeof row.day_label === "string" ? row.day_label : row.day,
      tickLabel: typeof row.day_label === "string" ? row.day_label.split(" ").slice(1).join(" ") || row.day : row.day,
      volume,
      approved,
    };
  });
  return parsed.every(Boolean) ? parsed : null;
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
  const [actionRequiredCount, setActionRequiredCount] = useState(0);
  const [actionRequiredCountError, setActionRequiredCountError] = useState(false);
  const [authorizationStatusCounts, setAuthorizationStatusCounts] = useState<AuthorizationStatusCount[]>([]);
  const [authorizationStatusCountsError, setAuthorizationStatusCountsError] = useState(false);
  const [recentDashboardRecords, setRecentDashboardRecords] = useState<RoleDashboardRecord[]>([]);
  const [recentDashboardRecordsError, setRecentDashboardRecordsError] = useState(false);
  const [authorizedAmountError, setAuthorizedAmountError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<any[]>([]);
  const [claimChartData, setClaimChartData] = useState<any[]>([]);
  const [chartErrors, setChartErrors] = useState({ authorization: false, claims: false, finance: false });
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

      if (isClaimsRole || isFinanceRole) {
        try {
          const recentQuery = isClaimsRole
            ? supabase
                .from("hospital_claims" as any)
                .select("id, claim_number, status, total_amount, created_at")
                .order("created_at", { ascending: false })
                .limit(5)
            : (supabase as any)
                .from("payment_batches")
                .select("id, batch_reference, status, total_amount, created_at")
                .order("created_at", { ascending: false })
                .limit(5);
          const { data, error } = await recentQuery;
          if (error) throw error;
          const route = isClaimsRole ? "/backoffice/claims/all" : "/backoffice/finance/payments/batches";
          setRecentDashboardRecords(((data || []) as any[]).map((row) => {
            const amount = parseAggregateNumber(row.total_amount);
            const timestamp = row.created_at ? new Date(row.created_at) : null;
            const createdLabel = timestamp && Number.isFinite(timestamp.getTime())
              ? `Created ${timestamp.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`
              : "Creation date unavailable";
            return {
              id: String(row.id),
              title: String(isClaimsRole ? row.claim_number || "Claim record" : row.batch_reference || "Payment batch"),
              detail: createdLabel,
              status: String(row.status || "unknown"),
              amount: Number.isFinite(amount) && amount >= 0 ? compactMoney(amount) : undefined,
              to: route,
            };
          }));
          setRecentDashboardRecordsError(false);
        } catch (recentError) {
          console.error("Recent dashboard records could not be fetched:", recentError);
          setRecentDashboardRecords([]);
          setRecentDashboardRecordsError(true);
        }
      } else if (!isAdmin) {
        try {
          const { data, error } = await supabase
            .from("authorization_requests")
            .select("id, request_id, status, total_amount, created_at")
            .in("status", [...ACTION_REQUIRED_AUTHORIZATION_STATUSES])
            .order("created_at", { ascending: false })
            .limit(5);
          if (error) throw error;
          setRecentDashboardRecords(((data || []) as any[]).map((row) => {
            const timestamp = row.created_at ? new Date(row.created_at) : null;
            const createdLabel = timestamp && Number.isFinite(timestamp.getTime())
              ? `Submitted ${timestamp.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`
              : "Submission date unavailable";
            const amount = parseAggregateNumber(row.total_amount);
            return {
              id: String(row.id),
              title: String(row.request_id || "Authorization request"),
              detail: createdLabel,
              status: String(row.status || "unknown"),
              amount: Number.isFinite(amount) && amount >= 0 ? compactMoney(amount) : undefined,
              to: "/backoffice/utilization-manager/requests?status=action_required",
            };
          }));
          setRecentDashboardRecordsError(false);
        } catch (recentError) {
          console.error("Recent authorization requests could not be fetched:", recentError);
          setRecentDashboardRecords([]);
          setRecentDashboardRecordsError(true);
        }
      } else {
        setRecentDashboardRecords([]);
        setRecentDashboardRecordsError(false);
      }

      // Keep the dashboard's attention count identical to the Action Needed tab.
      // A head-only exact count evaluates the complete RLS-visible result set.
      if (!isClaimsRole && !isFinanceRole) {
        try {
          const [actionCountResult, statusBreakdownResult] = await Promise.all([
            supabase
              .from("authorization_requests")
              .select("id", { count: "exact", head: true })
              .in("status", [...ACTION_REQUIRED_AUTHORIZATION_STATUSES]),
            supabase.rpc("get_dashboard_authorization_status_breakdown" as any),
          ]);
          const { count: actionCount, error: actionCountError } = actionCountResult;
          if (actionCountError || typeof actionCount !== "number" || !Number.isFinite(actionCount) || actionCount < 0) {
            console.error("Failed to fetch exact action-required authorization count:", actionCountError || "Invalid count");
            setActionRequiredCountError(true);
          } else {
            setActionRequiredCount(actionCount);
            setActionRequiredCountError(false);
          }
          const rawStatusCounts = statusBreakdownResult.data;
          const parsedStatusCounts = Array.isArray(rawStatusCounts)
            ? rawStatusCounts.map((row: any) => ({ status: String(row?.status ?? ""), count: parseAggregateNumber(row?.count) }))
            : null;
          if (
            statusBreakdownResult.error ||
            !parsedStatusCounts ||
            parsedStatusCounts.some((row) => !row.status || !Number.isFinite(row.count) || row.count < 0)
          ) {
            console.error("Authorization status breakdown could not be confirmed:", statusBreakdownResult.error || "Invalid response");
            setAuthorizationStatusCountsError(true);
          } else {
            setAuthorizationStatusCounts(parsedStatusCounts);
            setAuthorizationStatusCountsError(false);
          }
        } catch (actionCountError) {
          console.error("Action-required authorization count request failed:", actionCountError);
          setActionRequiredCountError(true);
          setAuthorizationStatusCountsError(true);
        }
      } else {
        setActionRequiredCount(0);
        setActionRequiredCountError(false);
        setAuthorizationStatusCounts([]);
        setAuthorizationStatusCountsError(false);
      }

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
          const rows = parseActivityRows(financeChart as any[] | null);
          if (chartError || !rows) console.error("Failed to fetch dashboard_finance_activity_7d:", chartError || "Invalid chart response");
          setChartErrors((current) => ({ ...current, finance: Boolean(chartError || !rows) }));
          setChartData(chartError || !rows ? [] : rows);
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
          
          const { data: claimChart, error: claimChartError } = await supabase.rpc("dashboard_claims_activity_7d" as any);
          const claimRows = parseActivityRows(claimChart as any[] | null);
          setChartErrors((current) => ({ ...current, claims: Boolean(claimChartError || !claimRows) }));
          setChartData(claimChartError || !claimRows ? [] : claimRows);
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
          const authRows = parseActivityRows(chartRes.data as any[] | null);
          const claimsRows = parseActivityRows(claimChartRes.data as any[] | null);
          setChartErrors((current) => ({
            ...current,
            authorization: Boolean(chartRes.error || !authRows),
            claims: Boolean(claimChartRes.error || !claimsRows),
          }));
          setChartData(chartRes.error || !authRows ? [] : authRows);
          setClaimChartData(claimChartRes.error || !claimsRows ? [] : claimsRows);

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

          const { data: claimChart, error: claimChartError } = await supabase.rpc("dashboard_claims_activity_7d" as any);
          const claimRows = parseActivityRows(claimChart as any[] | null);
          setChartErrors((current) => ({ ...current, claims: Boolean(claimChartError || !claimRows) }));
          setChartData(claimChartError || !claimRows ? [] : claimRows);
          setClaimChartData(claimChartError || !claimRows ? [] : claimRows);
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
          const authRows = parseActivityRows(authChartRes.data as any[] | null);
          const claimsRows = parseActivityRows(claimChartRes2.data as any[] | null);
          setChartErrors((current) => ({
            ...current,
            authorization: Boolean(authChartRes.error || !authRows),
            claims: Boolean(claimChartRes2.error || !claimsRows),
          }));
          setChartData(authChartRes.error || !authRows ? [] : authRows);
          setClaimChartData(claimChartRes2.error || !claimsRows ? [] : claimsRows);

        }
      }
    }
  } catch (error) {
      console.error("Dashboard stats fetch failed:", error);
      setStats(EMPTY_DASHBOARD_STATS);
      setStatsError(true);
      setAuthorizationStatsError(role !== "claims" && role !== "claims_lead" && role !== "finance");
      setAuthorizedAmountError(role === "admin");
      setChartErrors({
        authorization: role !== "claims" && role !== "claims_lead" && role !== "finance",
        claims: role === "admin" || role === "claims" || role === "claims_lead",
        finance: role === "finance",
      });
      setAuthorizationStatusCountsError(role !== "claims" && role !== "claims_lead" && role !== "finance");
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
  const isNurseOrOther = !isAdmin && !isClaims && !isFinance;

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
    { name: "Authorization queue", desc: "Review pending requests", href: `${actionBase}/requests?status=action_required`, icon: FileText, ...actionStyle },
    { name: "Clinical inbox", desc: "Triage incoming clinical requests", href: `${actionBase}/whatsapp`, icon: MessageSquare, ...actionStyle },
    { name: "Pre-Auth Report", desc: "Download authorization codes", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const managerActions = [
    { name: "Authorization queue", desc: "Review requests awaiting a decision", href: `${actionBase}/requests?status=action_required`, icon: ShieldCheck, ...actionStyle },
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
    : isClaims
      ? claimsActions
      : role === "finance"
        ? financeActions
        : nurseActions;

  const authLiveTotal = Math.max(0, stats.total - stats.historical);
  const statusCountTotal = authorizationStatusCounts
    .filter((row) => row.status !== "deferred")
    .reduce((sum, row) => sum + row.count, 0);
  const statusGroupCount = (statuses: ReadonlySet<string> | readonly string[]) => {
    const statusSet = new Set(statuses);
    return authorizationStatusCounts
      .filter((row) => statusSet.has(row.status))
      .reduce((sum, row) => sum + row.count, 0);
  };
  const statusBreakdownConsistent =
    !authorizationStatusCountsError &&
    authorizationStatusCounts.every((row) => Number.isSafeInteger(row.count) && row.count >= 0) &&
    statusCountTotal === authLiveTotal &&
    statusGroupCount(APPROVED_AUTHORIZATION_STATUSES) === stats.approved &&
    statusGroupCount(REJECTED_AUTHORIZATION_STATUSES) === stats.rejected &&
    statusGroupCount(ACTION_REQUIRED_AUTHORIZATION_STATUSES) === actionRequiredCount;
  const getOtherAuthorizationStatuses = () => statusBreakdownConsistent
    ? authorizationStatusCounts.filter((row) =>
        !ACTION_REQUIRED_AUTHORIZATION_STATUSES.includes(row.status as (typeof ACTION_REQUIRED_AUTHORIZATION_STATUSES)[number]) &&
        !APPROVED_AUTHORIZATION_STATUSES.has(row.status) &&
        !REJECTED_AUTHORIZATION_STATUSES.has(row.status) &&
        row.status !== "deferred",
      )
    : [];
  const otherAuthorizationStatuses = statusBreakdownConsistent
    ? getOtherAuthorizationStatuses().reduce((sum, row) => sum + row.count, 0)
    : Math.max(0, authLiveTotal - stats.approved - stats.rejected - actionRequiredCount);
  const otherAuthorizationStatusDetail = statusBreakdownConsistent
    ? getOtherAuthorizationStatuses().filter((row) => row.count > 0)
        .map((row) => `${row.status === "(blank)" ? "Blank status" : row.status.replace(/_/g, " ")} ${row.count.toLocaleString("en-NG")}`)
        .join(" · ")
    : "Status names unavailable";
  const referralWorkflowCount = statusBreakdownConsistent
    ? statusGroupCount(["referral_approved", "referral_accepted"])
    : 0;
  const roleAuthCountsError = statsError || authorizationStatsError || actionRequiredCountError;
  const roleAuthError = roleAuthCountsError || !statusBreakdownConsistent;
  const roleClaimsError = statsError || claimStatsError;
  const roleFinanceError = financeStatsError;
  const staffChartError = isFinance ? chartErrors.finance : isClaims ? chartErrors.claims : chartErrors.authorization;
  const formatCount = (value: number, hasError: boolean) =>
    hasError || !Number.isFinite(value) ? "—" : value.toLocaleString("en-NG");

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      {!isAdmin && !isClaims && !isFinance && (statsError || authorizationStatsError || actionRequiredCountError || authorizationStatusCountsError) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>Dashboard totals could not be confirmed. Incomplete totals are hidden.</span>
          <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">
            Retry totals
          </button>
        </div>
      )}
      {isAdmin && (
        <div className="space-y-4">
          {(statsError || authorizationStatsError || actionRequiredCountError || !statusBreakdownConsistent || authorizedAmountError || financeStatsError || claimStatsError) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span>Some dashboard totals or status details could not be confirmed. Retry to refresh the dashboard.</span>
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
            authPendingError={actionRequiredCountError}
            authStatusBreakdownError={!statusBreakdownConsistent}
            authStatusCounts={authorizationStatusCounts}
            claimsError={claimStatsError}
            paymentsError={financeStatsError}
            auth={{
              total: stats.total,
              approved: stats.approved,
              rejected: stats.rejected,
              pending: actionRequiredCount,
              otherStatuses: otherAuthorizationStatuses,
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
        <RoleDashboardOverview
          title="Payments overview"
          loading={loading}
          error={roleFinanceError}
          onRetry={() => void fetchStats(true)}
          metrics={[
            { label: "Awaiting payment", value: formatCount(financeStats.awaitingCount, roleFinanceError), detail: roleFinanceError ? undefined : compactMoney(financeStats.awaitingValue), fullValue: roleFinanceError ? undefined : money(financeStats.awaitingValue) },
            { label: "Paid value", value: roleFinanceError ? "—" : compactMoney(financeStats.paidValue), detail: "Disbursed claims", fullValue: roleFinanceError ? undefined : money(financeStats.paidValue) },
            { label: "Payment batches", value: formatCount(financeStats.paidBatches + financeStats.readyBatches + financeStats.draftBatches, roleFinanceError), detail: roleFinanceError ? undefined : `${compactMoney(financeStats.totalBatchesValue)} total value`, fullValue: roleFinanceError ? undefined : money(financeStats.totalBatchesValue) },
          ]}
          attention={roleFinanceError || financeStats.awaitingCount <= 0 ? [] : [
            { label: "Approved claims awaiting payment", value: formatCount(financeStats.awaitingCount, roleFinanceError), detail: compactMoney(financeStats.awaitingValue), to: `${actionBase}/payments/awaiting` },
          ]}
          steps={[
            { label: "Awaiting payment", value: formatCount(financeStats.awaitingCount, roleFinanceError), detail: roleFinanceError ? undefined : compactMoney(financeStats.awaitingValue) },
            { label: "Paid claims", value: formatCount(financeStats.paidCount, roleFinanceError), detail: roleFinanceError ? undefined : compactMoney(financeStats.paidValue) },
            { label: "Settled batches", value: formatCount(financeStats.paidBatches, roleFinanceError) },
          ]}
          recentRecords={{
            title: "Recent payment batches",
            viewAllHref: `${actionBase}/payments/batches`,
            loading,
            error: recentDashboardRecordsError,
            items: recentDashboardRecords,
          }}
        />
      )}

      {isUtilizationManager && (
        <RoleDashboardOverview
          title="Authorization workload"
          loading={loading}
          error={roleAuthError}
          onRetry={() => void fetchStats(true)}
          metrics={[
            { label: "Action needed", value: formatCount(actionRequiredCount, actionRequiredCountError), detail: "In the review queue" },
            { label: "Total requests", value: formatCount(stats.total, statsError), detail: "Including historical records" },
            { label: "Approval rate", value: roleAuthError || authLiveTotal === 0 ? "—" : `${((stats.approved / authLiveTotal) * 100).toFixed(1)}%`, detail: "Of live requests" },
          ]}
          attention={[
            ...(!actionRequiredCountError && actionRequiredCount > 0 ? [
              { label: "Authorization requests awaiting a decision", value: formatCount(actionRequiredCount, false), to: `${actionBase}/requests?status=action_required` },
            ] : []),
            ...(otherAuthorizationStatuses > 0 ? [
              { label: "Requests in other workflow statuses", value: formatCount(otherAuthorizationStatuses, roleAuthCountsError), detail: otherAuthorizationStatusDetail, to: `${actionBase}/requests` },
            ] : []),
          ]}
          steps={[
            { label: "Total requests", value: formatCount(stats.total, statsError) },
            { label: "Approved", value: formatCount(stats.approved, authorizationStatsError) },
            { label: "Referral in progress", value: formatCount(referralWorkflowCount, !statusBreakdownConsistent), detail: "Referral approved or accepted" },
            { label: "Rejected", value: formatCount(stats.rejected, authorizationStatsError) },
            { label: "Other statuses", value: formatCount(otherAuthorizationStatuses, roleAuthCountsError), detail: otherAuthorizationStatusDetail },
          ]}
          recentRecords={{
            title: "Recent action-needed requests",
            viewAllHref: `${actionBase}/requests?status=action_required`,
            loading,
            error: recentDashboardRecordsError,
            items: recentDashboardRecords,
          }}
        />
      )}

      {isNurseOrOther && !isUtilizationManager && (
        <RoleDashboardOverview
          title="Request overview"
          loading={loading}
          error={roleAuthError}
          onRetry={() => void fetchStats(true)}
          metrics={[
            { label: "Action needed", value: formatCount(actionRequiredCount, actionRequiredCountError), detail: "In the review queue" },
            { label: "Total requests", value: formatCount(stats.total, statsError) },
            { label: "Approved", value: formatCount(stats.approved, authorizationStatsError) },
          ]}
          attention={actionRequiredCountError || actionRequiredCount <= 0 ? [] : [
            { label: "Authorization requests awaiting a decision", value: formatCount(actionRequiredCount, false), to: `${actionBase}/requests?status=action_required` },
          ]}
          steps={[
            { label: "Approved", value: formatCount(stats.approved, authorizationStatsError) },
            { label: "Referral in progress", value: formatCount(referralWorkflowCount, !statusBreakdownConsistent), detail: "Referral approved or accepted" },
            { label: "Rejected", value: formatCount(stats.rejected, authorizationStatsError) },
            { label: "Facilities", value: formatCount(stats.hospitals, statsError) },
            { label: "Other statuses", value: formatCount(otherAuthorizationStatuses, roleAuthCountsError), detail: otherAuthorizationStatusDetail },
          ]}
          recentRecords={{
            title: "Recent action-needed requests",
            viewAllHref: `${actionBase}/requests?status=action_required`,
            loading,
            error: recentDashboardRecordsError,
            items: recentDashboardRecords,
          }}
        />
      )}

      {isClaims && (
        <RoleDashboardOverview
          title="Claims overview"
          loading={loading}
          error={roleClaimsError}
          onRetry={() => void fetchStats(true)}
          metrics={[
            { label: "Submitted", value: formatCount(claimStats.submitted, roleClaimsError), detail: "Claims in the workflow" },
            { label: "Approved", value: formatCount(claimStats.approved, roleClaimsError) },
            { label: "Contested", value: formatCount(claimStats.contested, roleClaimsError) },
          ]}
          attention={roleClaimsError ? [] : [
            ...(claimStats.contested > 0 ? [{ label: "Contested claims", value: formatCount(claimStats.contested, false), to: `${actionBase}/all` }] : []),
            ...(claimStats.submitted > 0 ? [{ label: "Submitted claims to review", value: formatCount(claimStats.submitted, false), to: `${actionBase}/all` }] : []),
          ]}
          steps={[
            { label: "Submitted", value: formatCount(claimStats.submitted, roleClaimsError) },
            { label: "Approved", value: formatCount(claimStats.approved, roleClaimsError), detail: roleClaimsError ? undefined : compactMoney(claimStats.approvedValue) },
            { label: "Paid", value: formatCount(claimStats.paid, roleClaimsError) },
            { label: "Rejected", value: formatCount(claimStats.rejected, roleClaimsError) },
          ]}
          recentRecords={{
            title: "Recent claims",
            viewAllHref: `${actionBase}/all`,
            loading,
            error: recentDashboardRecordsError,
            items: recentDashboardRecords,
          }}
        />
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
              ) : chartErrors.authorization ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-center">
                  <span className="text-sm text-amber-900">Authorization activity could not be loaded.</span>
                  <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 px-3 text-sm font-semibold text-amber-950 underline underline-offset-2">Retry</button>
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
              ) : chartErrors.claims ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-center">
                  <span className="text-sm text-amber-900">Claims activity could not be loaded.</span>
                  <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 px-3 text-sm font-semibold text-amber-950 underline underline-offset-2">Retry</button>
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
                ) : isClaims ? (
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
                  : isClaims
                  ? "Claims activity · last 7 days"
                  : isUtilizationManager
                    ? "Requests by issue date · last 7 days"
                    : "Requests by issue date · last 7 days"}
              </p>
            </div>
            <div className="h-[300px] w-full">
              {loading ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-500">Loading activity…</div>
              ) : staffChartError ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-center">
                  <span className="text-sm text-amber-900">Activity could not be loaded.</span>
                  <button type="button" onClick={() => void fetchStats(true)} className="min-h-11 px-3 text-sm font-semibold text-amber-950 underline underline-offset-2">Retry</button>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-sm text-slate-500">No activity in the last 7 days.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isClaims || isFinance ? "#BA7517" : "#1D9E75"} stopOpacity={0.16} />
                      <stop offset="95%" stopColor={isClaims || isFinance ? "#BA7517" : "#1D9E75"} stopOpacity={0} />
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
                          ? (isFinance ? "Paid claims" : isUtilizationManager ? "Requests" : "Submitted volume")
                          : name === "approved"
                          ? (isFinance ? "Paid value" : isUtilizationManager ? "Approved" : "Approved volume")
                          : name;
                      const formattedValue =
                        isFinance && name === "approved"
                          ? money(Number(value))
                          : typeof value === "number"
                          ? value.toLocaleString()
                          : value;
                      return [formattedValue, formattedName];
                    }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#CBD5E1" fill="transparent" strokeWidth={2} />
                  <Area type="monotone" dataKey="approved" stroke={isClaims || isFinance ? "#BA7517" : "#1D9E75"} fillOpacity={1} fill="url(#colorVolume)" strokeWidth={3} />
                </AreaChart>
                </ResponsiveContainer>
              )}
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
