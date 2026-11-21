// src/features/dashboard/hooks/useDashboardHomeMetrics.ts
// Handles dashboard statistics, RPC aggregates, legacy fallback queries,
// activity 7-day metrics, role breakdowns, and throttling.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ACTION_REQUIRED_AUTHORIZATION_STATUSES } from "@/features/dashboard/constants/requestStatuses";
import { type RoleDashboardRecord } from "@/components/dashboard/RoleDashboardOverview";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";

export const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value || 0);

export const compactMoney = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);

export const APPROVED_AUTHORIZATION_STATUSES = new Set([
  "approved",
  "partially_approved",
  "authorization_approved",
  "referral_approved",
  "referral_accepted",
]);

export const REJECTED_AUTHORIZATION_STATUSES = new Set([
  "rejected",
  "declined",
  "denied",
  "referral_declined",
  "referral_expired",
  "accepted_referral_expired",
]);

export type AuthorizationStatusCount = { status: string; count: number };

export const parseAggregateNumber = (value: unknown) => {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

export type ActivityRow = {
  dateStr: string;
  name: string;
  tickLabel: string;
  volume: number;
  approved: number;
};

export const parseActivityRows = (rows: any[] | null | undefined): ActivityRow[] | null => {
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
  return parsed.every(Boolean) ? (parsed as ActivityRow[]) : null;
};

export const groupLegacyRejectedStatuses = (rows: AuthorizationStatusCount[]) => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = ["declined", "denied"].includes(row.status) ? "rejected" : row.status;
    counts.set(status, (counts.get(status) || 0) + row.count);
  }
  return Array.from(counts, ([status, count]) => ({ status, count }));
};

export type DashboardFinanceAggregate = {
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

export type DashboardStats = {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  hospitals: number;
  users: number;
  authorizedAmount: number;
  historical: number;
};

export type DashboardClaimStats = {
  submitted: number;
  approved: number;
  partiallyApproved: number;
  rejected: number;
  contested: number;
  paid: number;
  claimedValue: number;
  approvedValue: number;
  declinedValue: number;
};

export type DashboardFinanceStats = {
  awaitingCount: number;
  awaitingValue: number;
  paidCount: number;
  paidValue: number;
  draftBatches: number;
  readyBatches: number;
  paidBatches: number;
  totalBatchesValue: number;
};

export type ChartErrors = {
  authorization: boolean;
  claims: boolean;
  finance: boolean;
};

export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  total: 0,
  approved: 0,
  rejected: 0,
  pending: 0,
  hospitals: 0,
  users: 0,
  authorizedAmount: 0,
  historical: 0,
};

export const formatCount = (value: number, hasError: boolean) =>
  hasError || !Number.isFinite(value) ? "—" : value.toLocaleString("en-NG");

export function useDashboardHomeMetrics() {
  const { role } = useAuth();
  const location = useLocation();
  const { toast } = useToast();

  const [stats, setStats] = useState<DashboardStats>(EMPTY_DASHBOARD_STATS);
  const [claimStats, setClaimStats] = useState<DashboardClaimStats>({
    submitted: 0,
    approved: 0,
    partiallyApproved: 0,
    rejected: 0,
    contested: 0,
    paid: 0,
    claimedValue: 0,
    approvedValue: 0,
    declinedValue: 0,
  });
  const [financeStats, setFinanceStats] = useState<DashboardFinanceStats>({
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
  const [refreshingStats, setRefreshingStats] = useState(false);
  const [chartData, setChartData] = useState<ActivityRow[]>([]);
  const [claimChartData, setClaimChartData] = useState<ActivityRow[]>([]);
  const [chartErrors, setChartErrors] = useState<ChartErrors>({
    authorization: false,
    claims: false,
    finance: false,
  });

  const lastFetchedRef = useRef(0);
  const activeStatsFetchesRef = useRef(0);

  const fetchStats = useCallback(
    async (force = false, silent = false) => {
      const now = Date.now();
      const THROTTLE_MS = 60000;
      if (!force && now - lastFetchedRef.current < THROTTLE_MS) {
        return;
      }
      lastFetchedRef.current = now;

      activeStatsFetchesRef.current += 1;
      setRefreshingStats(true);
      if (!silent) setLoading(true);
      try {
        const isClaimsRole = role === "claims" || role === "claims_lead";
        const isFinanceRole = role === "finance";
        const isAdminRole = role === "admin";
        let exactAuthorizationStatusCounts: AuthorizationStatusCount[] | null = null;

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
            setRecentDashboardRecords(
              ((data || []) as any[]).map((row) => {
                const amount = parseAggregateNumber(row.total_amount);
                const timestamp = row.created_at ? new Date(row.created_at) : null;
                const createdLabel =
                  timestamp && Number.isFinite(timestamp.getTime())
                    ? `Created ${timestamp.toLocaleDateString("en-NG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}`
                    : "Creation date unavailable";
                return {
                  id: String(row.id),
                  title: String(isClaimsRole ? row.claim_number || "Claim record" : row.batch_reference || "Payment batch"),
                  detail: createdLabel,
                  status: String(row.status || "unknown"),
                  amount: Number.isFinite(amount) && amount >= 0 ? compactMoney(amount) : undefined,
                  to: route,
                };
              }),
            );
            setRecentDashboardRecordsError(false);
          } catch (recentError) {
            console.error("Recent dashboard records could not be fetched:", recentError);
            setRecentDashboardRecords([]);
            setRecentDashboardRecordsError(true);
          }
        } else {
          setRecentDashboardRecords([]);
          setRecentDashboardRecordsError(false);
        }

        // Action needed attention count
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
              ? rawStatusCounts.map((row: any) => ({
                  status: String(row?.status ?? ""),
                  count: parseAggregateNumber(row?.count),
                }))
              : null;
            if (
              statusBreakdownResult.error ||
              !parsedStatusCounts ||
              parsedStatusCounts.some((row) => !row.status || !Number.isFinite(row.count) || row.count < 0)
            ) {
              console.error("Authorization status breakdown could not be confirmed:", statusBreakdownResult.error || "Invalid response");
              setAuthorizationStatusCountsError(true);
            } else {
              const groupedStatusCounts = groupLegacyRejectedStatuses(parsedStatusCounts);
              exactAuthorizationStatusCounts = groupedStatusCounts;
              setAuthorizationStatusCounts(groupedStatusCounts);
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

        if (isFinanceRole || isAdminRole) {
          try {
            const { data: financeResponse, error: financeError } = await supabase.rpc("get_dashboard_finance_stats");
            const financeData = financeResponse as unknown as DashboardFinanceAggregate | null;
            if (financeError || !financeData || typeof financeData !== "object") {
              console.error("Failed to fetch complete dashboard finance aggregates:", financeError || "Invalid response");
              setFinanceStatsError(true);
              if (isAdminRole) setClaimStatsError(true);
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
                if (isAdminRole) setClaimStatsError(true);
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

                if (isAdminRole) {
                  const adminClaims = financeData.admin_claims;
                  const claimValues =
                    adminClaims &&
                    [
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
            if (isAdminRole) setClaimStatsError(true);
          }

          if (isFinanceRole) {
            const { data: financeChart, error: chartError } = await supabase.rpc("dashboard_finance_activity_7d" as any);
            const rows = parseActivityRows(financeChart as any[] | null);
            if (chartError || !rows) {
              console.error("Failed to fetch dashboard_finance_activity_7d:", chartError || "Invalid chart response");
            }
            setChartErrors((current) => ({ ...current, finance: Boolean(chartError || !rows) }));
            setChartData(chartError || !rows ? [] : rows);
          }
        }

        if (!isFinanceRole) {
          // Consolidated RPC
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
                const claimValues =
                  claimSummary &&
                  [
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
              const [liveTotal, liveApproved, rpcLiveRejected, historical, hospitals, users] = authValues;
              const liveRejected = exactAuthorizationStatusCounts
                ? exactAuthorizationStatusCounts
                    .filter((row) => REJECTED_AUTHORIZATION_STATUSES.has(row.status))
                    .reduce((sum, row) => sum + row.count, 0)
                : rpcLiveRejected;
              const authorizedAmount = parseAggregateNumber(rpcData.auth?.approved_amount);
              const authCountsValid =
                [liveTotal, liveApproved, liveRejected, historical, hospitals, users].every(
                  (value) => Number.isFinite(value) && value >= 0,
                ) && liveApproved + liveRejected <= liveTotal;
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
                !allClaims.error &&
                !approvedClaims.error &&
                !rejectedClaims.error &&
                !hospitalsRes.error &&
                !usersRes.error &&
                !historicalClaims.error &&
                [liveTotal, approved, rejected, historical, hospitalsRes.count, usersRes.count].every(
                  (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
                ) &&
                (approved as number) + (rejected as number) <= (liveTotal as number);
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
              const [totalRes, approvedRes, rejectedRes, hospitalsRes, usersRes, authChartRes, claimChartRes2, historicalAuths] =
                await Promise.all([
                  supabase
                    .from("authorization_requests")
                    .select("id", { count: "exact", head: true })
                    .or("status.is.null,status.neq.deferred"),
                  supabase
                    .from("authorization_requests")
                    .select("id", { count: "exact", head: true })
                    .in("status", ["approved", "partially_approved", "authorization_approved", "referral_approved", "referral_accepted"]),
                  supabase
                    .from("authorization_requests")
                    .select("id", { count: "exact", head: true })
                    .in("status", [
                      "rejected",
                      "declined",
                      "denied",
                      "referral_declined",
                      "referral_expired",
                      "accepted_referral_expired",
                    ]),
                  supabase.from("hospitals").select("id", { count: "exact", head: true }),
                  supabase.from("user_roles").select("id", { count: "exact", head: true }),
                  supabase.rpc("dashboard_live_activity_7d" as any),
                  supabase.rpc("dashboard_claims_activity_7d" as any),
                  supabase
                    .from("historical_codes" as any)
                    .select("id", { count: "exact", head: true })
                    .eq("record_type", "authorization"),
                ]);
              const liveTotal = totalRes.count;
              const approved = approvedRes.count;
              const rejected = rejectedRes.count;
              const historical = historicalAuths.count;
              const authCountsAvailable =
                !totalRes.error &&
                !approvedRes.error &&
                !rejectedRes.error &&
                !historicalAuths.error &&
                [liveTotal, approved, rejected, historical].every(
                  (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
                ) &&
                (approved as number) + (rejected as number) <= (liveTotal as number);
              const allStatsAvailable =
                authCountsAvailable &&
                !hospitalsRes.error &&
                !usersRes.error &&
                typeof hospitalsRes.count === "number" &&
                Number.isFinite(hospitalsRes.count) &&
                typeof usersRes.count === "number" &&
                Number.isFinite(usersRes.count);
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
        activeStatsFetchesRef.current = Math.max(0, activeStatsFetchesRef.current - 1);
        setRefreshingStats(activeStatsFetchesRef.current > 0);
      }
    },
    [role, toast],
  );

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

  // Derived breakdown consistency math
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

  const getOtherAuthorizationStatuses = () =>
    statusBreakdownConsistent
      ? authorizationStatusCounts.filter(
          (row) =>
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
    ? getOtherAuthorizationStatuses()
        .filter((row) => row.count > 0)
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

  return {
    role,
    isAdmin,
    isClaims,
    isFinance,
    isUtilizationManager,
    isNurseOrOther,
    actionBase,
    stats,
    claimStats,
    financeStats,
    actionRequiredCount,
    actionRequiredCountError,
    authorizationStatusCounts,
    authorizationStatusCountsError,
    recentDashboardRecords,
    recentDashboardRecordsError,
    loading,
    refreshingStats,
    chartData,
    claimChartData,
    chartErrors,
    statsError,
    authorizationStatsError,
    authorizedAmountError,
    financeStatsError,
    claimStatsError,
    roleAuthError,
    roleAuthCountsError,
    roleClaimsError,
    roleFinanceError,
    staffChartError,
    statusBreakdownConsistent,
    otherAuthorizationStatuses,
    otherAuthorizationStatusDetail,
    referralWorkflowCount,
    authLiveTotal,
    fetchStats,
    formatCount,
    money,
    compactMoney,
  };
}
