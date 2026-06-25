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

      {/* Stats: 3 cols × 2 rows on mobile, 6 cols × 1 row on desktop — max 6 well-defined metrics */}
      <div className="grid gap-2 grid-cols-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Approved", val: metrics.approvedCount, color: "text-emerald-600", icon: CheckCircle2, bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Pending", val: metrics.pendingCount, color: "text-amber-600", icon: Clock, bg: "bg-amber-50", border: "border-amber-200" },
          { label: "Rejected", val: metrics.deniedCount, color: "text-rose-600", icon: XCircle, bg: "bg-rose-50", border: "border-rose-200" },
          { label: "Portfolio", val: `₦${metrics.totalValue.toLocaleString()}`, color: "text-blue-600", icon: TrendingUp, bg: "bg-blue-50", border: "border-blue-200" },
          { label: "Pending Payout", val: `₦${metrics.pendingPayout.toLocaleString()}`, color: "text-purple-600", icon: Banknote, bg: "bg-purple-50", border: "border-purple-200" },
          { label: "Paid", val: `₦${metrics.paidClaims.toLocaleString()}`, color: "text-emerald-600", icon: ShieldCheck, bg: "bg-emerald-50", border: "border-emerald-200" },
        ].map((m, i) => (
          <Card key={i} className={cn("rounded-xl overflow-hidden bg-white shadow-sm transition-all hover:shadow-md duration-300", m.border)}>
            <CardContent className="p-2.5 sm:p-3 flex items-center gap-2 relative overflow-hidden">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", m.bg)}>
                <m.icon className={cn("h-4 w-4", m.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs font-bold text-slate-500 truncate">{m.label}</p>
                <p className={cn("text-sm sm:text-base font-extrabold tracking-tight truncate", m.color)}>{m.val}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-4">
        <Card className="rounded-xl border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-4 border-b border-slate-50 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/new-request")}
              className="h-auto py-4 flex flex-col gap-2 items-center justify-center border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              <FileText className="h-6 w-6 text-emerald-600 mb-1" />
              <span className="font-bold text-sm">Create Request</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/claims")}
              className="h-auto py-4 flex flex-col gap-2 items-center justify-center border-slate-200 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              <Send className="h-6 w-6 text-blue-600 mb-1" />
              <span className="font-bold text-sm">Submit Claim</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/messages")}
              className="h-auto py-4 flex flex-col gap-2 items-center justify-center border-slate-200 hover:border-purple-500 hover:bg-purple-50 hover:text-purple-700 transition-colors"
            >
              <MessageSquare className="h-6 w-6 text-purple-600 mb-1" />
              <span className="font-bold text-sm">Message Support</span>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-4 border-b border-slate-50 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-500" />
              HMO Announcements
            </CardTitle>
          </CardHeader>
          <div className="divide-y divide-slate-50">
            {pageLoading ? (
              <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
            ) : announcements.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-slate-300">No new announcements</p>
              </div>
            ) : announcements.map((ann) => (
              <div key={ann.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-sm text-slate-900">{ann.title}</h4>
                  <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", 
                    ann.priority === 'high' || ann.priority === 'critical' ? 'text-rose-600 border-rose-200 bg-rose-50' : 
                    ann.priority === 'medium' ? 'text-amber-600 border-amber-200 bg-amber-50' : 
                    'text-blue-600 border-blue-200 bg-blue-50'
                  )}>
                    {ann.priority}
                  </Badge>
                </div>
                <p className="text-sm text-slate-600">{ann.content}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-2">
                  {new Date(ann.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
