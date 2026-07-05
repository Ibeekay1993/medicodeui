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
  FileText,
  Loader2,
  Megaphone,
  Send,
  MessageSquare
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

export default function HospitalPortalPage() {
  const { user, fullName, hospitalId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);

  const { data: hospital, isLoading: profileLoading } = useHospitalProfile(hospitalId, user?.id, user?.email);
  const { data: dashboardData, isLoading: dashboardLoading, refetch: refreshDashboard } = useHospitalDashboard(hospital);
  const { data: announcements = [] } = useHospitalAnnouncements();

  const metrics = dashboardData?.metrics || { approvedCount: 0, pendingCount: 0, deniedCount: 0, totalValue: 0, pendingPayout: 0, paidClaims: 0 };
  const approachingDeadlineClaims = dashboardData?.approachingDeadlineClaims || [];
  const pageLoading = profileLoading || dashboardLoading;

  useEffect(() => {
    if (announcements.length > 1) {
      const timer = setInterval(() => {
        setCurrentAnnouncementIndex((prev) => (prev + 1) % announcements.length);
      }, 10000); // 10 seconds
      return () => clearInterval(timer);
    }
  }, [announcements.length]);

  const refresh = useCallback(async () => {
    if (hospital) {
      await refreshDashboard();
    }
  }, [hospital, refreshDashboard]);

  useTabVisibilityRefresh(refresh, Boolean(hospital));

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      {approachingDeadlineClaims.length > 0 && (
        <div className="bg-slate-50/50 border border-slate-200 text-slate-700 rounded-lg p-3 flex items-start gap-3 shadow-sm animate-in slide-in-from-top duration-300">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">Approaching Contest Deadline</h4>
            <p className="text-xs font-semibold text-amber-700 mt-1">
              You have {approachingDeadlineClaims.length} partially approved {approachingDeadlineClaims.length === 1 ? 'claim' : 'claims'} with contest deadlines expiring in the next 5 days (minimum {Math.min(...approachingDeadlineClaims.map(c => {
                const diff = new Date(c.contest_deadline!).getTime() - new Date().getTime();
                return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
              }))} days remaining). Please review and submit any contestations to avoid losing your eligibility.
            </p>
          </div>
        </div>
      )}
      <div className="pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-800">Facility: {hospital?.name || fullName || "Loading..."} · {hospital?.code || "???"}</p>
          </div>
          <Button 
            onClick={() => navigate("/dashboard/new-request")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-8 px-4 text-xs font-bold gap-1.5 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" /> New Auth
          </Button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid gap-2 sm:gap-4 grid-cols-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Approved", val: metrics.approvedCount, isZero: metrics.approvedCount === 0, color: "text-emerald-600", icon: CheckCircle2, accent: "#10B981" },
          { label: "Pending", val: metrics.pendingCount, isZero: metrics.pendingCount === 0, color: "text-amber-600", icon: Clock, accent: "#F59E0B" },
          { label: "Rejected", val: metrics.deniedCount, isZero: metrics.deniedCount === 0, color: "text-rose-600", icon: XCircle, accent: "#EF4444" },
          { label: "Portfolio", val: `₦${metrics.totalValue.toLocaleString()}`, isZero: metrics.totalValue === 0, color: "text-blue-600", icon: TrendingUp, accent: "#3B82F6" },
          { label: "Unpaid", val: `₦${metrics.pendingPayout.toLocaleString()}`, isZero: metrics.pendingPayout === 0, color: "text-purple-600", icon: Banknote, accent: "#8B5CF6" },
          { label: "Paid", val: `₦${metrics.paidClaims.toLocaleString()}`, isZero: metrics.paidClaims === 0, color: "text-emerald-600", icon: ShieldCheck, accent: "#10B981" },
        ].map((m, i) => (
          <div key={i} className="flex flex-1 min-w-0 flex-col p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer relative overflow-hidden" title={m.label}>
            <div className="flex justify-between items-start mb-2 gap-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight break-words">{m.label}</p>
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: `${m.accent}1A`, color: m.accent }}>
                <m.icon className="h-[10px] w-[10px]" strokeWidth={3} />
              </div>
            </div>
            <div className="mt-auto">
              <h3 className={cn("text-base font-black leading-none tracking-tight break-words", m.isZero ? "text-slate-400" : m.color)}>
                {m.val}
              </h3>
            </div>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-4">
        <Card className="premium-card rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden transition-shadow hover:shadow-md">
          <CardHeader className="p-3 sm:p-4 flex flex-row items-center justify-between">
            <CardTitle className="text-[14px] font-medium text-slate-500 tracking-normal capitalize">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 grid grid-cols-3 gap-2 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/new-request")}
              className="h-auto p-2 sm:p-3 flex flex-col gap-1 items-center justify-center border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 hover:text-emerald-700 transition-all rounded-xl group"
            >
              <FileText className="h-5 w-5 text-emerald-600 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs leading-tight min-h-[2.6em] flex items-center justify-center text-center">New Auth<br/>Request</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/claims")}
              className="h-auto p-2 sm:p-3 flex flex-col gap-1 items-center justify-center border-slate-200 hover:border-primary/40 hover:bg-slate-50 hover:text-primary transition-all rounded-xl group"
            >
              <Send className="h-5 w-5 text-slate-500 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs leading-tight min-h-[2.6em] flex items-center justify-center text-center">Submit<br/>Claim</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/messages")}
              className="h-auto p-2 sm:p-3 flex flex-col gap-1 items-center justify-center border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 hover:text-purple-700 transition-all rounded-xl group"
            >
              <MessageSquare className="h-5 w-5 text-purple-600 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs leading-tight min-h-[2.6em] flex items-center justify-center text-center">Support</span>
            </Button>
          </CardContent>
        </Card>

        <Card className="premium-card rounded-xl border border-slate-100 shadow-sm bg-white overflow-hidden transition-shadow hover:shadow-md">
          <CardHeader className="p-3 sm:p-4 flex flex-row items-center justify-between">
            <CardTitle className="text-[14px] font-medium text-slate-500 tracking-normal capitalize flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-500" />
              Announcements
            </CardTitle>
          </CardHeader>
          <div className="p-0">
            {pageLoading ? (
              <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
            ) : announcements.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-slate-300">No new announcements</p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50/40 relative min-h-[140px] flex flex-col justify-center transition-all duration-500 ease-in-out">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm text-slate-900">{announcements[currentAnnouncementIndex].title}</h4>
                  <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", 
                    announcements[currentAnnouncementIndex].priority === 'high' || announcements[currentAnnouncementIndex].priority === 'critical' ? 'text-rose-600 border-rose-200 bg-rose-50' : 
                    announcements[currentAnnouncementIndex].priority === 'medium' ? 'text-amber-600 border-amber-200 bg-amber-50' : 
                    'text-slate-600 border-slate-200 bg-slate-50'
                  )}>
                    {announcements[currentAnnouncementIndex].priority}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">{announcements[currentAnnouncementIndex].content}</p>
                <div className="flex items-center justify-between mt-4">
                  <p className="text-[10px] text-slate-400 font-medium">
                    {new Date(announcements[currentAnnouncementIndex].created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {announcements.length > 1 && (
                    <div className="flex gap-1">
                      {announcements.map((_, idx) => (
                        <div 
                          key={idx} 
                          className={cn("h-1.5 rounded-full transition-all duration-300", 
                            idx === currentAnnouncementIndex ? "w-4 bg-emerald-500" : "w-1.5 bg-slate-300"
                          )} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Floating Action Button (Mobile Only) */}
      <button 
        onClick={() => navigate("/dashboard/new-request")}
        className="md:hidden fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg z-40 active:scale-95 transition-transform" 
        aria-label="New Authorization Request"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  );
}
