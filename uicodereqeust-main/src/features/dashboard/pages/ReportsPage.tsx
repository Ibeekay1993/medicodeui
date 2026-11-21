import { BrandSpinner } from "@/components/BrandSpinner";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { BarChart3, ShieldAlert, Eye, EyeOff, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";
import { exportReportToExcel } from "../reports/reportsExcelExport";
import {
  RequestStatus,
  ReportStats,
  HospitalPerformance,
  TrendPoint,
  PreAuthRecord,
  FilterState,
  defaultStats,
  getReportStatusPredicate,
  fetchAllReportPages,
  calculateReportStats,
  buildDateFilter,
  groupByDate,
  calculateHospitalPerformance,
  calculateApprovedAmount,
  PREAUTH_REPORT_SELECT_COLUMNS,
} from "@/lib/reports-helpers";

import ReportFilters from "@/components/reports/ReportFilters";
import KPIStatsGrid from "@/components/reports/KPIStatsGrid";
import StatusDistributionChart from "@/components/reports/StatusDistributionChart";

import MonthlyTrendChart from "@/components/reports/MonthlyTrendChart";
import HospitalPerformanceTable from "@/components/reports/HospitalPerformanceTable";
import UtilizationSlaAnalysis from "@/components/reports/UtilizationSlaAnalysis";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ReportResult {
  records: PreAuthRecord[];
  stats: ReportStats;
  hospitalPerformance: HospitalPerformance[];
  dailyTrend: TrendPoint[];
  monthlyTrend: TrendPoint[];
  utilizationManagerNames: Record<string, string>;
}

type ReportState =
  | { status: "INITIAL" }
  | { status: "LOADING"; filterKey: string }
  | { status: "SUCCESS_EMPTY"; filterKey: string; result: ReportResult; loadedAt: number }
  | { status: "SUCCESS_COMPLETE"; filterKey: string; result: ReportResult; loadedAt: number }
  | { status: "ERROR"; filterKey: string; diagnostic?: string };

const reportErrorMessage = "The report could not be fully loaded. No report totals are available. Check your connection and retry.";

function getReportErrorDiagnostic(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" && /^[A-Z0-9]{4,10}$/.test(record.code) ? record.code : "";
  const message = typeof record.message === "string"
    ? Array.from(record.message, (character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? " " : character;
    }).join("").replace(/\s+/g, " ").trim().slice(0, 240)
    : "";
  const diagnostic = [code, message].filter(Boolean).join(" · ");
  return diagnostic || undefined;
}

function makeFilterKey(filters: FilterState, hospitalName?: string) {
  return JSON.stringify([filters.statusFilter, filters.dateFilter, filters.startDate, filters.endDate, filters.hospitalFilter, hospitalName]);
}

function formatScopeDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatReportScope(filters: FilterState, hospitalName?: string) {
  const range = buildDateFilter(filters.dateFilter, filters.startDate, filters.endDate);
  let dateLabel = "All available dates";
  if (range.from && range.to) {
    const from = formatScopeDate(range.from);
    const to = formatScopeDate(range.to);
    dateLabel = from === to ? from : `${from}–${to}`;
  } else if (range.from) {
    dateLabel = `From ${formatScopeDate(range.from)}`;
  } else if (range.to) {
    dateLabel = `Through ${formatScopeDate(range.to)}`;
  }

  const statusLabels: Record<string, string> = {
    all: "All statuses",
    pending: "Pending",
    pending_referral: "Pending Referral",
    referral_approved: "Referral Approved",
    referral_accepted: "Referral Accepted",
    pending_authorization: "Pending Authorization",
    approved: "Approved",
    partially_approved: "Partially Approved",
    rejected: "Rejected",
    referral_declined: "Referral Declined",
    referral_expired: "Referral Expired",
  };
  const statusLabel = statusLabels[filters.statusFilter] || "All statuses";
  const hospitalLabel = filters.hospitalFilter === "all" ? "All hospitals" : hospitalName || filters.hospitalFilter;
  return `Requests created: ${dateLabel} (local time) · Status: ${statusLabel} · Hospital: ${hospitalLabel}`;
}

export default function ReportsPage() {
  const { role, user } = useAuth();
  const normalizedRole = role?.toLowerCase();

  const [hospitals, setHospitals] = useState<{ id: string; name: string; code?: string }[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    statusFilter: "all",
    dateFilter: "30days",
    startDate: "",
    endDate: "",
    hospitalFilter: "all",
  });
  const [reportState, setReportState] = useState<ReportState>({ status: "INITIAL" });
  const [isExporting, setIsExporting] = useState(false);
  const [showHospitalPerformance, setShowHospitalPerformance] = useState(true);
  const requestGeneration = useRef(0);

  const selectedHospitalName = filters.hospitalFilter === "all"
    ? undefined
    : hospitals.find((hospital) => hospital.id === filters.hospitalFilter)?.name || filters.hospitalFilter;
  const currentFilterKey = makeFilterKey(filters, selectedHospitalName);
  const scopeLabel = formatReportScope(filters, selectedHospitalName);
  const visibleReportState = "filterKey" in reportState && reportState.filterKey !== currentFilterKey
    ? { status: "LOADING" as const, filterKey: currentFilterKey }
    : reportState;
  const currentResult = visibleReportState.status === "SUCCESS_EMPTY" || visibleReportState.status === "SUCCESS_COMPLETE"
    ? visibleReportState.result
    : null;
  const records = currentResult?.records || [];
  const stats = currentResult?.stats || defaultStats;
  const hospitalPerformance = currentResult?.hospitalPerformance || [];
  const dailyTrend = currentResult?.dailyTrend || [];
  const monthlyTrend = currentResult?.monthlyTrend || [];
  const utilizationManagerNames = currentResult?.utilizationManagerNames || {};

  const fetchAnalytics = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const filterSnapshot = { ...filters };
    const filterKey = makeFilterKey(filterSnapshot, selectedHospitalName);
    setReportState({ status: "LOADING", filterKey });

    try {
      const pageSize = 1000;
      const statusPredicate = getReportStatusPredicate(filterSnapshot.statusFilter);
      const dateRange = buildDateFilter(filterSnapshot.dateFilter, filterSnapshot.startDate, filterSnapshot.endDate);
      const allData = await fetchAllReportPages<any>(async ({ from, to }) => {
        let q = supabase.from("authorization_requests").select(PREAUTH_REPORT_SELECT_COLUMNS)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true });

        if (statusPredicate?.operator === "eq") q = q.eq("status", statusPredicate.value);
        else if (statusPredicate?.operator === "in") q = q.in("status", statusPredicate.values);
        if (filterSnapshot.hospitalFilter !== "all") q = q.ilike("hospital_name", `%${selectedHospitalName}%`);
        if (dateRange.from) q = q.gte("created_at", dateRange.from.toISOString());
        if (dateRange.to) q = q.lte("created_at", dateRange.to.toISOString());

        const { data, error } = await q.range(from, to);
        return { data, error };
      }, pageSize);

      const mappedRecords: PreAuthRecord[] = allData.map((item: any) => ({
        id: item.id,
        created_at: item.created_at,
        request_id: item.request_id || "",
        patient_name: item.patient_name || "",
        patient_phone: item.patient_phone || item.phone || item.phone_number || "",
        patient_email: item.patient_email || item.email || "",
        policy_number: item.policy_number || "",
        diagnosis: item.diagnosis || "",
        treatment: item.treatment || "",
        requesting_hospital: item.requesting_hospital || item.requesting_hospital_name || item.hospital_name || "",
        hospital_id: item.requesting_hospital_id || item.hospital_id,
        source: item.source || "Manual",
        authorization_code: item.authorization_code ?? "",
        status: item.status as RequestStatus,
        approved_amount: calculateApprovedAmount(item),
        approved_items: Array.isArray(item.approved_items) ? item.approved_items : undefined,
        rejection_reason: item.decision_reason || "",
        decision_reason: item.decision_reason || "",
        decided_at: item.decided_at,
        decided_by: item.decided_by,
        approved_by: item.approved_by,
        treatment_submitted_at: item.treatment_submitted_at,
        urgency: item.urgency,
        clinician: item.authorized_by_name || undefined,
        is_historical: Boolean(item.is_historical),
      }));

      const managerIds = Array.from(new Set(
        mappedRecords.flatMap((record) => [record.approved_by, record.decided_by]).filter((id): id is string => Boolean(id)),
      ));
      let managerNames: Record<string, string> = {};
      if (managerIds.length) {
        const { data: managers, error: managersError } = await supabase.rpc("rpc_get_utilization_manager_directory", { _user_ids: managerIds });
        if (managersError) {
          console.warn("Could not load utilization manager names for SLA report", managersError);
        } else {
          managerNames = Object.fromEntries((managers || []).map((manager) => [manager.user_id, manager.full_name]));
        }
      }

      const validRecords = mappedRecords.filter((r) => r.status !== "deferred");
      const currentYear = new Date().getFullYear();
      const currentYearRecords = validRecords.filter(r => new Date(r.created_at).getFullYear() === currentYear);
      const result: ReportResult = {
        records: validRecords,
        stats: calculateReportStats(validRecords),
        hospitalPerformance: calculateHospitalPerformance(validRecords),
        dailyTrend: groupByDate(validRecords, "day"),
        monthlyTrend: groupByDate(currentYearRecords, "month"),
        utilizationManagerNames: managerNames,
      };

      if (generation !== requestGeneration.current) return;
      setReportState({
        status: validRecords.length ? "SUCCESS_COMPLETE" : "SUCCESS_EMPTY",
        filterKey,
        result,
        loadedAt: Date.now(),
      });
    } catch (error) {
      console.error("Analytics fetch error:", error);
      if (generation === requestGeneration.current) {
        setReportState({ status: "ERROR", filterKey, diagnostic: getReportErrorDiagnostic(error) });
      }
    }
  }, [filters, selectedHospitalName]);

  const fetchHospitals = useCallback(async () => {
    setLoadingHospitals(true);
    let allHospitals: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id,name,code")
        .order("name")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        toast.error(getErrorMessage(error, "Unable to load hospital filter"));
        setHospitals([]);
        setLoadingHospitals(false);
        return;
      }

      if (data && data.length > 0) {
        allHospitals = [...allHospitals, ...data];
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setHospitals(allHospitals);
    setLoadingHospitals(false);
  }, []);

  useEffect(() => {
    fetchHospitals();
  }, [fetchHospitals]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useTabVisibilityRefresh(fetchAnalytics);

  const exportExcel = async (mode: "detailed" | "full" | "payment_advice" = "full") => {
    await exportReportToExcel({
      mode,
      filters,
      records,
      stats,
      hospitalPerformance,
      dailyTrend,
      hospitals,
      selectedHospitalName,
      onStart: () => setIsExporting(true),
      onFinish: () => setIsExporting(false),
    });
  };

  if (normalizedRole !== "admin" && normalizedRole !== "finance" && normalizedRole !== "utilization_manager" && normalizedRole !== "utilization_manager_lead" && normalizedRole !== "nurse") {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center space-y-4">
        <ShieldAlert className="h-12 w-12 text-rose-500" />
        <h2 className="text-xl font-bold text-slate-800">Access Denied</h2>
        <p className="text-sm text-slate-500">You do not have permission to view performance reports.</p>
      </div>
    );
  }

  return (
    <div className="max-w-full space-y-5 overflow-x-hidden pb-10">

      {/* Filters */}
      <div>
        <ReportFilters
          filters={filters}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          hospitals={hospitals}
          loadingHospitals={loadingHospitals}
          onExport={exportExcel}
          isExporting={isExporting}
        />
      </div>

      <div aria-label="Report scope" className="space-y-1 text-xs text-slate-600">
        <p className="font-medium">{scopeLabel}</p>
        <p>
          SLA metrics use this same filtered request set.
          {currentResult && (visibleReportState.status === "SUCCESS_EMPTY" || visibleReportState.status === "SUCCESS_COMPLETE") && (
            <span> Data loaded: {new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date(visibleReportState.loadedAt))} (local time).</span>
          )}
        </p>
      </div>

      {(visibleReportState.status === "INITIAL" || visibleReportState.status === "LOADING") && (
        <div role="status" aria-live="polite" className="flex min-h-24 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
          <BrandSpinner className="h-5 w-5 animate-spin text-brand-700" aria-hidden="true" />
          <span>Loading authorization report…</span>
        </div>
      )}

      {visibleReportState.status === "ERROR" && (
        <Alert variant="destructive" className="bg-white">
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Report unavailable</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <span>{reportErrorMessage}</span>
              {visibleReportState.status === "ERROR" && visibleReportState.diagnostic && (
                <details className="max-w-full break-words text-xs text-rose-700">
                  <summary className="cursor-pointer">Technical details</summary>
                  <span className="block pt-1 [overflow-wrap:anywhere]">{visibleReportState.diagnostic}</span>
                </details>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => void fetchAnalytics()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {visibleReportState.status === "SUCCESS_EMPTY" && (
        <div role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No authorization requests match the selected report filters.
        </div>
      )}

      {visibleReportState.status === "SUCCESS_COMPLETE" && currentResult && (
        <>
          <div>
            <KPIStatsGrid stats={stats} isLoading={false} />
          </div>

          {(normalizedRole === "admin" || normalizedRole === "utilization_manager" || normalizedRole === "utilization_manager_lead") && (
            <div>
              <UtilizationSlaAnalysis
                records={records}
                managerNames={utilizationManagerNames}
                viewerId={user?.id}
                canSeeTeamPerformance={normalizedRole === "admin" || normalizedRole === "utilization_manager_lead"}
              />
            </div>
          )}

          {/* Analytics Dashboard */}
          <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Request analytics</h2>
              <p className="text-xs text-slate-500">Status mix and approved value over time</p>
            </div>
          </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatusDistributionChart stats={stats} />
          <MonthlyTrendChart data={monthlyTrend} />
        </div>

        {/* Hospital Performance Toggle & Section */}
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowHospitalPerformance(!showHospitalPerformance)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 group"
            >
              {showHospitalPerformance ? (
                <>
                  <EyeOff className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" />
                  Hide Hospital Performance
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  Show Hospital Performance
                </>
              )}
            </button>
          </div>
          {showHospitalPerformance && (
            <div>
              <HospitalPerformanceTable data={hospitalPerformance} />
            </div>
          )}
        </div>
          </div>
        </>
      )}
    </div>
  );
}
