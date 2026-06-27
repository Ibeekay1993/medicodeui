import { useState, useEffect, useCallback } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
  const [hospital, setHospital] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [approachingDeadlineClaims, setApproachingDeadlineClaims] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ approvedCount: 0, pendingCount: 0, deniedCount: 0, totalValue: 0, pendingPayout: 0, paidClaims: 0 });
  const [pageLoading, setPageLoading] = useState(true);

  const fetchData = useCallback(async (hosp: any) => {
    const safeName = String(hosp.name || "").replace(/[%(),]/g, " ");
    const safeCode = String(hosp.code || "").replace(/[%(),]/g, " ");

    const fuzzyQuery = [
      `hospital_name.ilike.%${safeName}%`
    ];

    if (safeCode.trim()) {
      fuzzyQuery.push(`hospital_name.ilike.%${safeCode}%`);
    }
    
    const isUHS = safeName.toLowerCase().includes("university health") || safeCode.toUpperCase().includes("UHS");
    if (isUHS) {
      fuzzyQuery.push(`hospital_name.ilike.%UHS%`);
      fuzzyQuery.push(`hospital_name.ilike.%U.H.S%`);
      fuzzyQuery.push(`hospital_name.ilike.%University Health%`);
    }

    let allData: any[] = [];
    let page = 0;
    let hasMore = true;
    
    try {
      while (hasMore) {
        const { data, error } = await supabase
          .from("authorization_requests")
          .select("*")
          // Use exact ID-based filters for owned, referred, and claiming hospital relationships.
          // Also include name-based fuzzy fallback for legacy records created before ID columns existed.
          .or([
            `hospital_id.eq.${hosp.id}`,
            `requesting_hospital_id.eq.${hosp.id}`,
            `referring_hospital_id.eq.${hosp.id}`,
            `referred_hospital_id.eq.${hosp.id}`,
            `claiming_hospital_id.eq.${hosp.id}`,
            ...fuzzyQuery,
          ].join(","))
          .order("created_at", { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);
          
        if (error) throw error;
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          page++;
          hasMore = data.length === 1000;
        } else {
          hasMore = false;
        }
      }

      let allClaims: any[] = [];
      let claimPage = 0;
      let claimHasMore = true;
      const claimQuery = [
        `hospital_id.eq.${hosp.id}`,
        `hospital_name.ilike.%${safeName}%`
      ];

      if (safeCode.trim()) {
        claimQuery.push(`hospital_name.ilike.%${safeCode}%`);
      }
      if (isUHS) {
        claimQuery.push(`hospital_name.ilike.%UHS%`);
        claimQuery.push(`hospital_name.ilike.%U.H.S%`);
        claimQuery.push(`hospital_name.ilike.%University Health%`);
      }

      while (claimHasMore) {
        const { data: claimsData, error: claimsError } = await supabase
          .from("hospital_claims" as any)
          .select("*")
          .or(claimQuery.join(","))
          .range(claimPage * 1000, (claimPage + 1) * 1000 - 1);
          
        if (claimsError) throw claimsError;
        if (claimsData && claimsData.length > 0) {
          allClaims = [...allClaims, ...claimsData];
          claimPage++;
          claimHasMore = claimsData.length === 1000;
        } else {
          claimHasMore = false;
        }
      }

      setMetrics({
        // approvedCount: fully approved (standard + referral post-treatment)
        approvedCount: allData.filter(d => ["approved", "authorization_approved"].includes(String(d.status).toLowerCase())).length,
        // pendingCount: includes incoming referrals awaiting acceptance AND standard pending
        pendingCount: allData.filter(d => [
          "pending",
          "pending_referral",
          "referral_approved",
          "referral_accepted",
          "pending_authorization",
        ].includes(String(d.status).toLowerCase())).length,
        deniedCount: allData.filter(d => ["rejected", "referral_declined", "referral_expired"].includes(String(d.status).toLowerCase())).length,
        totalValue: allData
          .filter(d => !(d.referred_hospital_id && d.hospital_id === hosp.id))
          .reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0),
        pendingPayout: allClaims.filter(c => ["approved", "partially_approved"].includes(String(c.status).toLowerCase())).reduce((sum, c) => sum + (Number(c.approved_amount || c.total_amount) || 0), 0),
        paidClaims: allClaims.filter(c => String(c.status).toLowerCase() === "paid").reduce((sum, c) => sum + (Number(c.approved_amount || c.total_amount) || 0), 0)
      });
      
      const { data: annData } = await supabase
        .from("hmo_announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(3);
      if (annData) setAnnouncements(annData);
      
      // Filter for claims that are partially_approved and their contest_deadline is within the next 5 days (but still in the future)
      const now = new Date();
      const fiveDaysFromNow = new Date();
      fiveDaysFromNow.setDate(now.getDate() + 5);

      const approaching = allClaims.filter(c => {
        if (String(c.status).toLowerCase() !== 'partially_approved') return false;
        if (!c.contest_deadline) return false;
        const deadline = new Date(c.contest_deadline);
        return deadline > now && deadline <= fiveDaysFromNow;
      });
      setApproachingDeadlineClaims(approaching);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to sync hospital records") });
    }
  }, [toast]);

  useEffect(() => {
    if (announcements.length > 1) {
      const timer = setInterval(() => {
        setCurrentAnnouncementIndex((prev) => (prev + 1) % announcements.length);
      }, 10000); // 10 seconds
      return () => clearInterval(timer);
    }
  }, [announcements.length]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!user) return;
      try {
        let hospData = null;
        if (hospitalId) {
          const { data, error } = await supabase
            .from("hospitals")
            .select("*")
            .eq("id", hospitalId)
            .maybeSingle();
          if (error) throw error;
          hospData = data;
        } else {
          const email = String(user.email ?? "").replace(/[(),]/g, " ").trim();
          const { data, error } = await supabase
            .from("hospitals")
            .select("*")
            .or(`user_id.eq.${user.id},email.eq.${email}`)
            .maybeSingle();
          if (error) throw error;
          hospData = data;
        }

        if (hospData) {
          if (!mounted) return;
          setHospital(hospData);
          await fetchData(hospData);
        } else {
          const email = String(user.email ?? "").replace(/[(),]/g, " ").trim();
          if (email) {
            const { data: healed } = await (supabase.rpc as any)("heal_hospital_user_link", {
              p_user_id: user.id,
              p_email: email,
            });
            if (healed?.[0]) {
              const { data: retry } = await supabase
                .from("hospitals")
                .select("*")
                .or(`user_id.eq.${user.id},email.eq.${email}`)
                .maybeSingle();
              if (retry) {
                if (!mounted) return;
                setHospital(retry);
                await fetchData(retry);
              }
            }
          }
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load hospital dashboard") });
      }
    };
    init().finally(() => { if (mounted) setPageLoading(false); });
    return () => { mounted = false; };
  }, [user?.id, user?.email, hospitalId, fetchData, toast]);

  useEffect(() => {
    let mounted = true;
    const channel = supabase
      .channel("public:hmo_announcements:portal")
      .on("postgres_changes", { event: "*", schema: "public", table: "hmo_announcements" }, async () => {
        const { data } = await supabase
          .from("hmo_announcements")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(3);
        if (data && mounted) {
          setAnnouncements(data);
          setCurrentAnnouncementIndex(0);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (hospital) {
      await fetchData(hospital);
    }
  }, [hospital, fetchData]);

  useTabVisibilityRefresh(refresh, Boolean(hospital));

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      {approachingDeadlineClaims.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 flex items-start gap-3 shadow-sm animate-in slide-in-from-top duration-300">
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
              className="h-auto p-2 sm:p-3 flex flex-col gap-1 items-center justify-center border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 hover:text-blue-700 transition-all rounded-xl group"
            >
              <Send className="h-5 w-5 text-blue-600 mb-1 group-hover:scale-110 transition-transform" />
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
                    'text-blue-600 border-blue-200 bg-blue-50'
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
