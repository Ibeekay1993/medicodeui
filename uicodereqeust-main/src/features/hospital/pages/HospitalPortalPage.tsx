import { useState, useEffect, useCallback } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { useHospitalProfile, useHospitalDashboard, useHospitalAnnouncements } from "../hooks/useHospitalDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMetricGrid } from "@/components/dashboard/DashboardMetricGrid";
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
  FileText,
  Loader2,
  Megaphone,
  Send,
  MessageSquare,
  Building2,
  RefreshCw,
  Layers,
  ArrowUpRight,
  HelpCircle,
  Check,
  ChevronRight,
  FileCheck
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

  const { data: hospital, isLoading: profileLoading } = useHospitalProfile(hospitalId, user?.id, user?.email);
  const { data: dashboardData, isLoading: dashboardLoading, refetch: refreshDashboard } = useHospitalDashboard(hospital);
  const { data: announcements = [] } = useHospitalAnnouncements();

  const metrics = dashboardData?.metrics || { 
    approvedCount: 0, 
    pendingCount: 0, 
    deniedCount: 0, 
    totalValue: 0, 
    pendingPayout: 0, 
    paidClaims: 0 
  };
  const approachingDeadlineClaims = dashboardData?.approachingDeadlineClaims || [];
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
        toast({ title: "Dashboard refreshed", description: "All facility metrics are up to date." });
      } finally {
        setIsRefreshing(false);
      }
    }
  }, [hospital, refreshDashboard, toast]);

  useTabVisibilityRefresh(refresh, Boolean(hospital));

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-300">
      {/* Facility Header Command Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Building2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                  {hospital?.name || fullName || "Healthcare Provider"}
                </h1>
                <Badge variant="outline" className="font-mono text-[11px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                  {hospital?.code || "HOSP"}
                </Badge>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Facility
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 truncate">
                Hospital Provider Portal · Role: Authorized Facility Provider
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isRefreshing || pageLoading}
              className="h-8 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isRefreshing && "animate-spin text-emerald-600")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/dashboard/authorizations")}
              className="h-8 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Layers className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
              Authorizations
            </Button>
            <Button
              onClick={() => navigate("/dashboard/new-request")}
              className="h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold gap-1.5 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-400" />
              New Auth Request
            </Button>
          </div>
        </div>
      </div>

      {/* Approaching Contest Deadline Banner */}
      {approachingDeadlineClaims.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-sm animate-in slide-in-from-top duration-300">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <AlertCircle className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Contest Deadline Notice
                  </h4>
                  <Badge variant="outline" className="border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-800">
                    {approachingDeadlineClaims.length} Action Required
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-amber-800">
                  You have {approachingDeadlineClaims.length} partially approved {approachingDeadlineClaims.length === 1 ? "claim" : "claims"} expiring in the next 5 days. Review and submit contestations to avoid forfeiture.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => navigate("/dashboard/claims")}
              className="h-8 shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3"
            >
              Review Claims
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Dashboard Stats Grid */}
      <section aria-labelledby="hospital-metrics-heading" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 id="hospital-metrics-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Authorization & Financial Overview
          </h2>
          <span className="text-[11px] font-medium text-slate-400">
            Real-time Aggregation
          </span>
        </div>
        <DashboardMetricGrid
          loading={pageLoading}
          columns="grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          items={[
            { label: "Approved Auths", value: metrics.approvedCount, icon: CheckCircle2, color: "text-emerald-600" },
            { label: "Pending Review", value: metrics.pendingCount, icon: Clock, color: "text-amber-600" },
            { label: "Declined Auths", value: metrics.deniedCount, icon: XCircle, color: "text-rose-600" },
            { label: "Total Auth Value", value: `₦${Number(metrics.totalValue || 0).toLocaleString("en-NG")}`, icon: TrendingUp, color: "text-slate-900" },
            { label: "Awaiting Payment", value: `₦${Number(metrics.pendingPayout || 0).toLocaleString("en-NG")}`, icon: Banknote, color: "text-amber-600" },
            { label: "Settled Claims", value: `₦${Number(metrics.paidClaims || 0).toLocaleString("en-NG")}`, icon: ShieldCheck, color: "text-emerald-600" },
          ]}
        />
      </section>

      {/* Quick Workflows / Navigation Cards */}
      <section aria-labelledby="quick-actions-heading" className="space-y-2">
        <h2 id="quick-actions-heading" className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Operational Workflows
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card
            onClick={() => navigate("/dashboard/new-request")}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <FileText className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
              New Pre-Auth
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Submit routine, emergency, or referral care requests for instant medical review.
            </p>
          </Card>

          <Card
            onClick={() => navigate("/dashboard/authorizations")}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-500 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Layers className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
              Authorizations Ledger
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Track approval decisions, unlock patient codes, and convert auths to claims.
            </p>
          </Card>

          <Card
            onClick={() => navigate("/dashboard/claims")}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-purple-500 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Send className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-purple-600 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
              Claims Management
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Monitor claim reimbursement progress, audit deductions, and dispute settlements.
            </p>
          </Card>

          <Card
            onClick={() => navigate("/dashboard/messages")}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-800 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                <MessageSquare className="h-5 w-5" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-slate-900 transition-colors" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-slate-900 transition-colors">
              Utilization Support
            </h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Direct secure messaging with HMO nurses and medical utilization leads.
            </p>
          </Card>
        </div>
      </section>

      {/* Announcements and Operating Guidelines */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Announcements Card */}
        <Card className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
          <CardHeader className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-500" />
              Facility Notices & Announcements
            </CardTitle>
            {announcements.length > 0 && (
              <span className="text-[11px] font-medium text-slate-400">
                {currentAnnouncementIndex + 1} of {announcements.length}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-4 flex-1 flex flex-col justify-between">
            {pageLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : announcements.length === 0 ? (
              <div className="py-10 text-center">
                <Megaphone className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  No active announcements
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Updates from the HMO Medical Board will appear here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-slate-900">
                      {announcements[currentAnnouncementIndex].title}
                    </h4>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                        announcements[currentAnnouncementIndex].priority === "high" ||
                        announcements[currentAnnouncementIndex].priority === "critical"
                          ? "text-rose-700 border-rose-200 bg-rose-50"
                          : announcements[currentAnnouncementIndex].priority === "medium"
                          ? "text-amber-700 border-amber-200 bg-amber-50"
                          : "text-slate-600 border-slate-200 bg-slate-50"
                      )}
                    >
                      {announcements[currentAnnouncementIndex].priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {announcements[currentAnnouncementIndex].content}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                  <p className="text-[11px] text-slate-400 font-medium">
                    Posted on {new Date(announcements[currentAnnouncementIndex].created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  {announcements.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      {announcements.map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCurrentAnnouncementIndex(idx)}
                          className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            idx === currentAnnouncementIndex ? "w-4 bg-emerald-600" : "w-1.5 bg-slate-300 hover:bg-slate-400"
                          )}
                          aria-label={`Go to announcement ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Operating Guidelines Card */}
        <Card className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
          <CardHeader className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-emerald-600" />
              Provider Operating Standards
            </CardTitle>
            <Badge variant="outline" className="border-slate-200 text-[10px] font-semibold text-slate-600">
              Clinical Guidelines
            </Badge>
          </CardHeader>
          <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-around">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold">
                1
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">Contest Window (7 Days)</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Partially approved claims must be reviewed and contested within 7 days before automated finance release.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700 text-xs font-bold">
                2
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">Patient Arrival OTP</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Referral cases generate an arrival PIN sent to the patient. Input this OTP to unlock the full authorization code.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-50 text-purple-700 text-xs font-bold">
                3
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">WhatsApp Intake</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Prescription snapshots received on the official WhatsApp intake line are parsed and queued in real-time.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700 text-xs font-bold">
                4
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800">Direct Claims Submission</p>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Once care is delivered, submit your claim directly from the Authorizations Ledger with one click.
                </p>
              </div>
            </div>
          </CardContent>
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
