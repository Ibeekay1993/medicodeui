// src/features/dashboard/pages/DashboardHome.tsx
// Core orchestrator for the role-based HMO executive & operations dashboard.

import { useNavigate } from "react-router-dom";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { RoleDashboardOverview } from "@/components/dashboard/RoleDashboardOverview";
import {
  Activity,
  Banknote,
  Building2,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { useDashboardHomeMetrics } from "../hooks/useDashboardHomeMetrics";
import { DashboardActivityCharts } from "../components/DashboardActivityCharts";
import { DashboardShortcutsCard, type DashboardShortcutAction } from "../components/DashboardShortcutsCard";

export default function DashboardHome() {
  const navigate = useNavigate();
  const {
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
  } = useDashboardHomeMetrics();

  const actionStyle = { color: "text-slate-600", bg: "bg-slate-100" };
  const adminActions: DashboardShortcutAction[] = [
    { name: "Hospitals", desc: "Add and update hospitals", href: `${actionBase}/hospitals`, icon: Building2, ...actionStyle },
    { name: "Users", desc: "Manage staff access", href: `${actionBase}/users`, icon: Users, ...actionStyle },
    { name: "Authorizations", desc: "Review all requests", href: `${actionBase}/requests`, icon: ShieldCheck, ...actionStyle },
    { name: "Claims", desc: "Review and pay claims", href: `${actionBase}/claims`, icon: Banknote, ...actionStyle },
    { name: "Claims Reports", desc: "Analyze claims and export detailed reports", href: `${actionBase}/claims-reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const nurseActions: DashboardShortcutAction[] = [
    { name: "Authorization queue", desc: "Review pending requests", href: `${actionBase}/requests?status=action_required`, icon: FileText, ...actionStyle },
    { name: "Clinical inbox", desc: "Triage incoming clinical requests", href: `${actionBase}/whatsapp`, icon: MessageSquare, ...actionStyle },
    { name: "Pre-Auth Report", desc: "Download authorization codes", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const managerActions: DashboardShortcutAction[] = [
    { name: "Authorization queue", desc: "Review requests awaiting a decision", href: `${actionBase}/requests?status=action_required`, icon: ShieldCheck, ...actionStyle },
    { name: "SLA report", desc: "Review decision times and team performance", href: `${actionBase}/reports`, icon: Activity, ...actionStyle },
    { name: "Clinical inbox", desc: "Open incoming clinical requests", href: `${actionBase}/whatsapp`, icon: MessageSquare, ...actionStyle },
    { name: "Messages", desc: "Reply to hospitals and staff", href: `${actionBase}/messages`, icon: FileText, ...actionStyle },
  ];
  const claimsActions: DashboardShortcutAction[] = [
    { name: "Claims Analysis", desc: "Compare hospital claims", href: `${actionBase}/analysis`, icon: TrendingUp, ...actionStyle },
    { name: "Claims Queue", desc: "Review and resolve claims", href: `${actionBase}/all`, icon: Banknote, ...actionStyle },
    { name: "Claims Reports", desc: "Export claims data", href: `${actionBase}/reports`, icon: LayoutDashboard, ...actionStyle },
  ];
  const financeActions: DashboardShortcutAction[] = [
    { name: "Payments Queue", desc: "Pay approved claims", href: `${actionBase}/payments/awaiting`, icon: Banknote, ...actionStyle },
    { name: "Batches", desc: "Create and track batches", href: `${actionBase}/payments/batches`, icon: LayoutDashboard, ...actionStyle },
    { name: "Paid Claims", desc: "Review payment history", href: `${actionBase}/payments/paid`, icon: CheckCircle2, ...actionStyle },
    { name: "Reports", desc: "Export payment reports", href: `${actionBase}/payment-reports`, icon: FileText, ...actionStyle },
  ];

  const actions = isAdmin
    ? adminActions
    : isUtilizationManager
    ? managerActions
    : isClaims
    ? claimsActions
    : isFinance
    ? financeActions
    : nurseActions;

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      {!isAdmin && !isClaims && !isFinance && !loading && !refreshingStats && (statsError || authorizationStatsError || actionRequiredCountError || !statusBreakdownConsistent) && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>Dashboard totals could not be confirmed. Incomplete totals are hidden.</span>
          <button
            type="button"
            onClick={() => void fetchStats(true)}
            className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
          >
            Retry totals
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="space-y-4">
          {!loading && !refreshingStats && (statsError || authorizationStatsError || actionRequiredCountError || !statusBreakdownConsistent || authorizedAmountError || financeStatsError || claimStatsError) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <span>Some dashboard totals or status details could not be confirmed. Retry to refresh the dashboard.</span>
              <button
                type="button"
                onClick={() => void fetchStats(true)}
                className="min-h-11 rounded-md border border-amber-300 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
              >
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
            authStatusBreakdownError={!loading && !refreshingStats && !statusBreakdownConsistent}
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
            {
              label: "Awaiting payment",
              value: formatCount(financeStats.awaitingCount, roleFinanceError),
              detail: roleFinanceError ? undefined : compactMoney(financeStats.awaitingValue),
              fullValue: roleFinanceError ? undefined : money(financeStats.awaitingValue),
            },
            {
              label: "Paid value",
              value: roleFinanceError ? "—" : compactMoney(financeStats.paidValue),
              detail: "Disbursed claims",
              fullValue: roleFinanceError ? undefined : money(financeStats.paidValue),
            },
            {
              label: "Payment batches",
              value: formatCount(financeStats.paidBatches + financeStats.readyBatches + financeStats.draftBatches, roleFinanceError),
              detail: roleFinanceError ? undefined : `${compactMoney(financeStats.totalBatchesValue)} total value`,
              fullValue: roleFinanceError ? undefined : money(financeStats.totalBatchesValue),
            },
          ]}
          attention={
            roleFinanceError || financeStats.awaitingCount <= 0
              ? []
              : [
                  {
                    label: "Approved claims awaiting payment",
                    value: formatCount(financeStats.awaitingCount, roleFinanceError),
                    detail: compactMoney(financeStats.awaitingValue),
                    to: `${actionBase}/payments/awaiting`,
                  },
                ]
          }
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
            ...(!actionRequiredCountError && actionRequiredCount > 0
              ? [
                  {
                    label: "Authorization requests awaiting a decision",
                    value: formatCount(actionRequiredCount, false),
                    to: `${actionBase}/requests?status=action_required`,
                  },
                ]
              : []),
            ...(otherAuthorizationStatuses > 0
              ? [
                  {
                    label: "Requests in other workflow statuses",
                    value: formatCount(otherAuthorizationStatuses, roleAuthCountsError),
                    detail: otherAuthorizationStatusDetail,
                    to: `${actionBase}/requests`,
                  },
                ]
              : []),
          ]}
          steps={[
            { label: "Total requests", value: formatCount(stats.total, statsError) },
            { label: "Approved", value: formatCount(stats.approved, authorizationStatsError) },
            { label: "Referral in progress", value: formatCount(referralWorkflowCount, !statusBreakdownConsistent), detail: "Referral approved or accepted" },
            { label: "Rejected", value: formatCount(stats.rejected, authorizationStatsError) },
            { label: "Other statuses", value: formatCount(otherAuthorizationStatuses, roleAuthCountsError), detail: otherAuthorizationStatusDetail },
          ]}
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
          attention={
            actionRequiredCountError || actionRequiredCount <= 0
              ? []
              : [
                  {
                    label: "Authorization requests awaiting a decision",
                    value: formatCount(actionRequiredCount, false),
                    to: `${actionBase}/requests?status=action_required`,
                  },
                ]
          }
          steps={[
            { label: "Approved", value: formatCount(stats.approved, authorizationStatsError) },
            { label: "Referral in progress", value: formatCount(referralWorkflowCount, !statusBreakdownConsistent), detail: "Referral approved or accepted" },
            { label: "Rejected", value: formatCount(stats.rejected, authorizationStatsError) },
            { label: "Facilities", value: formatCount(stats.hospitals, statsError) },
            { label: "Other statuses", value: formatCount(otherAuthorizationStatuses, roleAuthCountsError), detail: otherAuthorizationStatusDetail },
          ]}
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
          attention={
            roleClaimsError
              ? []
              : [
                  ...(claimStats.contested > 0 ? [{ label: "Contested claims", value: formatCount(claimStats.contested, false), to: `${actionBase}/all` }] : []),
                  ...(claimStats.submitted > 0 ? [{ label: "Submitted claims to review", value: formatCount(claimStats.submitted, false), to: `${actionBase}/all` }] : []),
                ]
          }
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
      {isAdmin ? (
        <DashboardActivityCharts
          role={role}
          loading={loading}
          chartData={chartData}
          claimChartData={claimChartData}
          chartErrors={chartErrors}
          staffChartError={staffChartError}
          onRetry={() => void fetchStats(true)}
          money={money}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2.5fr_1fr]">
          <DashboardActivityCharts
            role={role}
            loading={loading}
            chartData={chartData}
            claimChartData={claimChartData}
            chartErrors={chartErrors}
            staffChartError={staffChartError}
            onRetry={() => void fetchStats(true)}
            money={money}
          />
          <DashboardShortcutsCard actions={actions} onNavigate={(href) => navigate(href)} />
        </div>
      )}
    </div>
  );
}
