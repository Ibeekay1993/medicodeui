import { useState, useEffect, useCallback } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useHospitalProfile, useHospitalDashboard, useHospitalAnnouncements } from "../hooks/useHospitalDashboard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ShieldCheck, 
  Clock, 
  XCircle, 
  TrendingUp, 
  Banknote,
  Plus,
  AlertCircle,
  RefreshCw,
  Layers,
  Receipt,
  Copy,
  ChevronRight,
  ArrowUpRight,
  Megaphone,
  Check,
  Lock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Solid pill colours matching Utilization Manager RequestList
const STATUS_SOLID: Record<string, string> = {
  approved:           "bg-emerald-600 text-white border-transparent",
  partially_approved: "bg-sky-600     text-white border-transparent",
  referral_approved:  "bg-indigo-600 text-white border-transparent",
  referral_accepted:  "bg-blue-600   text-white border-transparent",
  pending_referral:   "bg-amber-500  text-white border-transparent",
  paid:               "bg-emerald-700 text-white border-transparent",
  pending:            "bg-amber-500   text-white border-transparent",
  submitted:          "bg-amber-500   text-white border-transparent",
  under_review:       "bg-sky-500     text-white border-transparent",
  rejected:           "bg-rose-600    text-white border-transparent",
  declined:           "bg-rose-600    text-white border-transparent",
  referral_declined:  "bg-rose-600    text-white border-transparent",
  contested:          "bg-purple-600  text-white border-transparent",
  awaiting_admin_approval: "bg-rose-700 text-white border-transparent",
};
const solidBadgeClass = (status?: string | null) =>
  STATUS_SOLID[String(status || "").toLowerCase()] ?? "bg-slate-500 text-white border-transparent";

export default function HospitalPortalPage() {
  const { user, hospitalId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data: hospital, isLoading: profileLoading } = useHospitalProfile(hospitalId || undefined, user?.id, user?.email);
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
        toast({ title: "Metrics Updated", description: "Ledger data synchronized." });
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [hospital, refreshDashboard, toast]);

  useTabVisibilityRefresh(refresh, Boolean(hospital));

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: "Copied", description: `Auth code ${code} copied.` });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-3.5 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-200">
      
      {/* 1. Sleek Action Bar (Non-redundant, no bulky icon box) */}
      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
              Facility Dashboard
            </h1>
            {hospital?.code && (
              <Badge variant="outline" className="font-mono text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 px-1.5 py-0">
                {hospital.code}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isRefreshing || pageLoading}
              className="h-8.5 px-3 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-none"
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isRefreshing && "animate-spin text-emerald-600")} />
              Sync
            </Button>
            <Button
              onClick={() => navigate("/dashboard/new-request")}
              size="sm"
              className="h-8.5 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold gap-1.5 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              New Pre-Auth
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Active Announcements Ticker (Clean Banner) */}
      {announcements.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 shadow-sm flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-800">
              <Megaphone className="h-3 w-3" />
            </span>
            <span className="font-semibold text-slate-900 truncate">
              {announcements[currentAnnouncementIndex].title}:
            </span>
            <span className="text-slate-600 truncate font-normal">
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
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900">
                  {approachingDeadlineClaims.length} Partially Approved {approachingDeadlineClaims.length === 1 ? "Claim Requires" : "Claims Require"} Review
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Contest window closes in 5 days. Undisputed deductions lock automatically for payout.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/dashboard/claims")}
              className="h-7.5 text-xs font-semibold rounded-lg bg-amber-700 hover:bg-amber-800 text-white shrink-0 px-3"
            >
              Review Deductions <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* 4. Professional KPI Grid (Clean, High Density, No Micro-Copy Slop) */}
      <section aria-labelledby="kpi-heading" className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 id="kpi-heading" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Authorization &amp; Financial Ledger
          </h2>
          <span className="text-[10px] font-semibold text-slate-600">
            Real-time Aggregation
          </span>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
          
          {/* 1. Authorized Care Value */}
          <Card className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">Authorized Care</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.totalValue || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.totalValue || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[11px] font-bold text-emerald-700 truncate mt-0.5">
                {metrics.approvedCount.toLocaleString()} approved
              </p>
            </div>
          </Card>

          {/* 2. Awaiting Payout */}
          <Card className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">Awaiting Payout</span>
              <Banknote className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm sm:text-base font-bold text-amber-700 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.pendingPayout || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.pendingPayout || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[11px] font-semibold text-slate-600 truncate mt-0.5">
                {metrics.awaitingPaymentCount || 0} in queue
              </p>
            </div>
          </Card>

          {/* 3. Settled Funds */}
          <Card className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">Settled Funds</span>
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.paidClaims || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.paidClaims || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[11px] font-semibold text-slate-600 truncate mt-0.5">
                {metrics.paidCount || 0} disbursed
              </p>
            </div>
          </Card>

          {/* 4. In Claims Audit */}
          <Card className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">In Claims Audit</span>
              <Clock className="h-3.5 w-3.5 text-sky-600" />
            </div>
            <div>
              <p 
                className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums leading-tight truncate"
                title={`₦${Number(metrics.inAuditValue || 0).toLocaleString("en-NG")}`}
              >
                ₦{Number(metrics.inAuditValue || 0).toLocaleString("en-NG")}
              </p>
              <p className="text-[11px] font-bold text-sky-700 truncate mt-0.5">
                {metrics.inAuditCount || 0} under review
              </p>
            </div>
          </Card>

          {/* 5. Pending Review */}
          <Card className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">Pending Review</span>
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <p className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums leading-tight">
                {metrics.pendingCount.toLocaleString()}
              </p>
              <p className="text-[11px] font-semibold text-slate-600 truncate mt-0.5">
                Awaiting decision
              </p>
            </div>
          </Card>

          {/* 6. Declined Auths */}
          <Card className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700">Declined Auths</span>
              <XCircle className="h-3.5 w-3.5 text-rose-600" />
            </div>
            <div>
              <p className="font-mono text-sm sm:text-base font-bold text-slate-900 tabular-nums leading-tight">
                {metrics.deniedCount.toLocaleString()}
              </p>
              <p className="text-[11px] font-bold text-rose-600 truncate mt-0.5">
                Declined requests
              </p>
            </div>
          </Card>

        </div>
      </section>

      {/* 5. Live Data Ledgers (Solid Badges, Compact Tables) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
        
        {/* Recent Authorizations Ledger */}
        <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <CardHeader className="py-2.5 px-3.5 border-b border-slate-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Recent Authorizations
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
                    <td colSpan={5} className="py-8 text-center text-xs font-bold uppercase tracking-wider text-slate-600">
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
                        <p className="font-mono text-[10px] font-medium text-slate-600 truncate">
                          {r.policy_number}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        {(() => {
                          const s = String(r.status || "").toLowerCase();
                          const isApprovedReq = s.includes("approved") || s.includes("accepted");
                          const isLocked = isApprovedReq && !r.is_unlocked;

                          if (isLocked) {
                            return (
                              <span
                                className="inline-flex items-center gap-1 font-sans text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full cursor-pointer hover:bg-amber-100 transition-colors"
                                title="Authorization code locked. Click to view and unlock in Authorizations."
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate("/dashboard/authorizations");
                                }}
                              >
                                <Lock className="h-2.5 w-2.5 text-amber-700" /> Locked
                              </span>
                            );
                          }

                          if (!r.authorization_code) {
                            return <span className="text-[10px] font-mono text-slate-400">—</span>;
                          }

                          return (
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
                          );
                        })()}
                      </td>
                      <td className="py-2 pr-3 font-mono font-bold text-slate-900 tabular-nums">
                        ₦{Number(r.total_amount || 0).toLocaleString("en-NG")}
                      </td>
                      <td className="py-2 pr-3.5 text-right">
                        <Badge
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-none capitalize",
                            solidBadgeClass(r.status)
                          )}
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
              <Receipt className="h-4 w-4 text-slate-700" />
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Claims &amp; Settlements
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
                  <th className="py-2 pr-3.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentClaims.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs font-bold uppercase tracking-wider text-slate-600">
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
                        <p className="font-mono text-[10px] font-medium text-slate-600 truncate">
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
                          className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-full border shadow-none capitalize",
                            solidBadgeClass(c.status)
                          )}
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
    </div>
  );
}
