import { useState, useEffect, useCallback } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useHospitalProfile, useHospitalDashboard, useHospitalAnnouncements } from "../hooks/useHospitalDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  Banknote,
  Plus,
  AlertCircle,
  Building2,
  RefreshCw,
  Layers,
  Receipt,
  Copy,
  ChevronRight,
  ArrowUpRight,
  Megaphone,
  Check
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function HospitalPortalPage() {
  const { user, fullName, hospitalId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: hospital, isLoading: profileLoading } = useHospitalProfile(hospitalId, user?.id, user?.email);
  const { data: dashboardData, isLoading: dashboardLoading, refetch: refreshDashboard } = useHospitalDashboard(hospital);
  const { data: announcements = [] } = useHospitalAnnouncements();

  const metrics = dashboardData?.metrics || { 
    approvedCount: 0, 
    pendingCount: 0, 
    deniedCount: 0, 
    totalValue: 0, 
    inAuditCount: 0,
    inAuditValue: 0,
    awaitingPaymentCount: 0,
    pendingPayout: 0, 
    paidCount: 0,
    paidClaims: 0,
    totalClaimsCount: 0,
    totalClaimedValue: 0,
  };

  const approachingDeadlineClaims = dashboardData?.approachingDeadlineClaims || [];
  const recentAuthorizations = dashboardData?.recentAuthorizations || [];
  const recentClaims = dashboardData?.recentClaims || [];
  const pageLoading = profileLoading || dashboardLoading;

  useEffect(() => {
    if (announcements.length > 1) {
      const timer = setInterval(() => {
        setCurrentAnnouncementIndex((prev) => (prev + 1) % announcements.length);
      }, 10000);
      return () => clearInterval(timer);
    }
  }, [announcements.length]);

  const refresh = useCallback(async () => {
    if (hospital) {
      setIsRefreshing(true);
      try {
        await refreshDashboard();
        toast({ title: "Metrics Updated", description: "Real-time ledger synchronized." });
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [hospital, refreshDashboard, toast]);

  useTabVisibilityRefresh(refresh, Boolean(hospital));

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: "Copied", description: `Auth code ${code} copied to clipboard.` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const statusPillClass = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (s === "approved" || s === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "partially_approved") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "pending" || s === "submitted" || s === "under_review" || s.includes("pending")) return "bg-sky-50 text-sky-700 border-sky-200";
    if (s === "rejected" || s === "declined") return "bg-rose-50 text-rose-700 border-rose-200";
    if (s === "contested") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  return (
    <div className="space-y-3.5 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-200">
      
      {/* 1. Compact Header Strip (No redundant Authorizations button) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white font-mono text-xs font-bold shadow-sm">
              <Building2 className="h-4 w-4 text-emerald-400" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                  {hospital?.name || fullName || "Facility Provider"}
                </h1>
                <Badge variant="outline" className="font-mono text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200 px-1.5 py-0">
                  {hospital?.code || "HOSP"}
                </Badge>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Facility
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isRefreshing || pageLoading}
              className="h-8 px-2.5 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", isRefreshing && "animate-spin text-emerald-600")} />
              Sync
            </Button>
            <Button
              onClick={() => navigate("/dashboard/new-request")}
              className="h-8 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold gap-1.5 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              New Pre-Auth
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Active Announcements Ticker (High-Density Top Pill) */}
      {announcements.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 shadow-sm flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-800">
              <Megaphone className="h-3 w-3" />
            </span>
            <span className="font-bold text-slate-900 truncate">
              {announcements[currentAnnouncementIndex].title}:
            </span>
            <span className="text-slate-600 truncate">
              {announcements[currentAnnouncementIndex].content}
            </span>
          </div>
          {announcements.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              {announcements.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentAnnouncementIndex(idx)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    idx === currentAnnouncementIndex ? "w-3 bg-slate-900" : "w-1.5 bg-slate-300"
                  )}
                  aria-label={`Announcement ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Approaching Contest Deadline Alert */}
      {approachingDeadlineClaims.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 shadow-sm animate-in slide-in-from-top duration-200">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">
                  {approachingDeadlineClaims.length} Partially Approved {approachingDeadlineClaims.length === 1 ? "Claim Requires" : "Claims Require"} Review
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Contestation deadlines expire within 5 days. Undisputed deductions lock automatically for payment.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/dashboard/claims")}
              className="h-7 text-xs font-semibold rounded-lg bg-amber-700 hover:bg-amber-800 text-white shrink-0 px-3"
            >
              Review Deductions <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 4. Compact KPI Grid (Values auto-scale and never truncate) */}
      <section aria-labelledby="kpi-heading" className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 id="kpi-heading" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Authorization & Financial Ledger
          </h2>
          <span className="text-[10px] font-medium text-slate-400">
            Real-time Aggregation
          </span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          
          {/* 1. Authorized Care Value */}
          <Card className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm flex flex-col justify-between min-h-[72px]">
            <div className="flex items-center justify-between text-slate-500 mb-0.5">
              <span className="text-[11px] font-medium text-slate-500">Authorized Care</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm min-[420px]:text-base xl:text-sm 2xl:text-base font-bold text-slate-900 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.totalValue || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.totalValue || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[10px] font-medium text-emerald-700 truncate mt-0.5">
                {metrics.approvedCount.toLocaleString()} approved auths
              </p>
            </div>
          </Card>

          {/* 2. Awaiting Payout */}
          <Card className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm flex flex-col justify-between min-h-[72px]">
            <div className="flex items-center justify-between text-slate-500 mb-0.5">
              <span className="text-[11px] font-medium text-slate-500">Awaiting Payout</span>
              <Banknote className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm min-[420px]:text-base xl:text-sm 2xl:text-base font-bold text-amber-700 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.pendingPayout || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.pendingPayout || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                {metrics.awaitingPaymentCount || 0} claims in pay queue
              </p>
            </div>
          </Card>

          {/* 3. Settled Cash Funds */}
          <Card className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm flex flex-col justify-between min-h-[72px]">
            <div className="flex items-center justify-between text-slate-500 mb-0.5">
              <span className="text-[11px] font-medium text-slate-500">Settled Funds</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm min-[420px]:text-base xl:text-sm 2xl:text-base font-bold text-slate-900 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.paidClaims || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.paidClaims || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                {metrics.paidCount || 0} claims disbursed
              </p>
            </div>
          </Card>

          {/* 4. In Claims Audit */}
          <Card className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm flex flex-col justify-between min-h-[72px]">
            <div className="flex items-center justify-between text-slate-500 mb-0.5">
              <span className="text-[11px] font-medium text-slate-500">In Claims Audit</span>
              <Clock className="h-3.5 w-3.5 text-sky-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm min-[420px]:text-base xl:text-sm 2xl:text-base font-bold text-slate-900 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.inAuditValue || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.inAuditValue || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[10px] font-medium text-sky-700 truncate mt-0.5">
                {metrics.inAuditCount || 0} under examiner audit
              </p>
            </div>
          </Card>

          {/* 5. Pending Pre-Auths */}
          <Card className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm flex flex-col justify-between min-h-[72px]">
            <div className="flex items-center justify-between text-slate-500 mb-0.5">
              <span className="text-[11px] font-medium text-slate-500">Pending Review</span>
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <p className="font-mono text-sm min-[420px]:text-base xl:text-sm 2xl:text-base font-bold text-slate-900 tabular-nums leading-tight">
                {metrics.pendingCount.toLocaleString()}
              </p>
              <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">
                Awaiting HMO decision
              </p>
            </div>
          </Card>

          {/* 6. Declined Auths */}
          <Card className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm flex flex-col justify-between min-h-[72px]">
            <div className="flex items-center justify-between text-slate-500 mb-0.5">
              <span className="text-[11px] font-medium text-slate-500">Declined Auths</span>
              <XCircle className="h-3.5 w-3.5 text-rose-600" />
            </div>
            <div>
              <p className="font-mono text-sm min-[420px]:text-base xl:text-sm 2xl:text-base font-bold text-slate-900 tabular-nums leading-tight">
                {metrics.deniedCount.toLocaleString()}
              </p>
              <p className="text-[10px] font-medium text-rose-600 truncate mt-0.5">
                Ineligible care requests
              </p>
            </div>
          </Card>

        </div>
      </section>

      {/* 5. Live Data Ledgers (Non-Repetitive, Direct Utility) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
        
        {/* Recent Authorizations Ledger */}
        <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="py-2.5 px-3.5 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Authorizations Ledger
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard/authorizations")}
              className="h-7 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2"
            >
              View All <ArrowUpRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3.5 py-2">Date</th>
                  <th className="py-2 pr-3">Patient</th>
                  <th className="py-2 pr-3">Auth Code</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAuthorizations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                      No authorization requests found.
                    </td>
                  </tr>
                ) : (
                  recentAuthorizations.map((r: any) => (
                    <tr
                      key={r.id}
                      onClick={() => navigate("/dashboard/authorizations")}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-3.5 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                      </td>
                      <td className="py-2 pr-3 max-w-[140px]">
                        <p className="font-semibold text-slate-900 truncate leading-tight">
                          {r.patient_name}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400 truncate">
                          {r.policy_number}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        {r.authorization_code ? (
                          <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-slate-800">
                            <span>{r.authorization_code}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyCode(r.authorization_code);
                              }}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                              title="Copy authorization code"
                            >
                              {copiedCode === r.authorization_code ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono font-bold text-slate-900 tabular-nums">
                        ₦{Number(r.total_amount || 0).toLocaleString("en-NG")}
                      </td>
                      <td className="py-2 pr-3.5 text-right">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-none", statusPillClass(r.status))}
                        >
                          {String(r.status || "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Claims Ledger */}
        <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="py-2.5 px-3.5 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-purple-600" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Claims & Settlements Queue
              </CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard/claims")}
              className="h-7 text-xs font-semibold text-slate-600 hover:text-slate-900 px-2"
            >
              View All <ArrowUpRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-3.5 py-2">Claim ID</th>
                  <th className="py-2 pr-3">Patient</th>
                  <th className="py-2 pr-3">Claimed</th>
                  <th className="py-2 pr-3">Approved</th>
                  <th className="py-2 pr-3.5 text-right">Payout Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentClaims.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                      No claims submitted yet.
                    </td>
                  </tr>
                ) : (
                  recentClaims.map((c: any) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate("/dashboard/claims")}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="px-3.5 py-2 font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap">
                        {c.claim_number}
                      </td>
                      <td className="py-2 pr-3 max-w-[140px]">
                        <p className="font-semibold text-slate-900 truncate leading-tight">
                          {c.patient_name}
                        </p>
                        <p className="font-mono text-[10px] text-slate-400 truncate">
                          {c.auth_code ? `Auth ${c.auth_code}` : "—"}
                        </p>
                      </td>
                      <td className="py-2 pr-3 font-mono font-bold text-slate-900 tabular-nums">
                        ₦{Number(c.total_amount || 0).toLocaleString("en-NG")}
                      </td>
                      <td className="py-2 pr-3 font-mono font-bold text-emerald-700 tabular-nums">
                        {c.approved_amount !== null && c.approved_amount !== undefined
                          ? `₦${Number(c.approved_amount).toLocaleString("en-NG")}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3.5 text-right">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-none", statusPillClass(c.status))}
                        >
                          {String(c.status || "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

      </div>

      {/* Floating Action Button (Mobile Only) */}
      <button 
        onClick={() => navigate("/dashboard/new-request")}
        className="md:hidden fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xl z-40 active:scale-95 transition-transform" 
        aria-label="New Authorization Request"
      >
        <Plus className="h-5 w-5 text-emerald-400" strokeWidth={2.5} />
      </button>

    </div>
  );
}
