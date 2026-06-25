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
  Loader2
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
  const [recentAuths, setRecentAuths] = useState<any[]>([]);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
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
      setRecentAuths(allData.slice(0, 5));
      setRecentClaims([...allClaims].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 5));

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
    <div className="max-w-full overflow-x-hidden min-h-screen bg-slate-50/50 pb-10">
      {/* Modern Gradient Header */}
      <div className="bg-[#1a1a2e] text-white p-4 pb-16 relative">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Hospital Portal</h1>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {hospital?.name || fullName || "Loading..."} · {hospital?.code || "???"}
            </p>
          </div>
          <Button 
            onClick={() => navigate("/dashboard/new-request")}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full h-9 px-5 text-xs font-bold gap-1.5 shadow-lg border-none w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" /> New Auth
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-10 space-y-6">
        {approachingDeadlineClaims.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-start gap-3 shadow-md animate-in slide-in-from-top duration-300">
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

        {/* Stats Grid - Modern Card Style */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Approved", val: metrics.approvedCount, color: "text-emerald-600", icon: CheckCircle2, border: "border-l-emerald-500" },
            { label: "Pending", val: metrics.pendingCount, color: "text-amber-500", icon: Clock, border: "border-l-amber-500" },
            { label: "Rejected", val: metrics.deniedCount, color: "text-rose-500", icon: XCircle, border: "border-l-rose-500" },
            { label: "Portfolio", val: `₦${metrics.totalValue.toLocaleString()}`, color: "text-blue-500", icon: TrendingUp, border: "border-l-blue-500" },
            { label: "Pending Payout", val: `₦${metrics.pendingPayout.toLocaleString()}`, color: "text-purple-500", icon: Banknote, border: "border-l-purple-500" },
            { label: "Paid", val: `₦${metrics.paidClaims.toLocaleString()}`, color: "text-emerald-600", icon: ShieldCheck, border: "border-l-emerald-500" },
          ].map((m, i) => (
            <Card key={i} className={cn("rounded-[12px] bg-white border border-slate-100 shadow-sm border-l-4 transition-all hover:shadow-md", m.border)}>
              <CardContent className="p-3 flex items-center gap-3">
                <m.icon className={cn("h-4 w-4 shrink-0", m.color)} />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{m.label}</p>
                  <p className={cn("text-sm font-black tracking-tight truncate", m.color)}>{m.val}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Records Card */}
          <Card className="rounded-[16px] border border-slate-100 shadow-sm bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-white">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Recent Records</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/authorizations")} className="text-[10px] font-black uppercase text-emerald-600 h-6 px-2 hover:bg-emerald-50">View All</Button>
            </div>
            <div className="divide-y divide-slate-50/80">
              {pageLoading ? (
                <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
              ) : recentAuths.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-300">No records yet</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">Submit your first request to get started</p>
                </div>
              ) : recentAuths.map((auth) => {
                const patientInitial = (auth.patient_name || "").trim().charAt(0) || "?";
                return (
                  <div key={auth.id} className="p-3 flex items-center justify-between hover:bg-slate-50/50 cursor-pointer transition-colors" onClick={() => navigate("/dashboard/authorizations")}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600 shrink-0 border border-slate-200/50">{patientInitial}</div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-black text-slate-900 truncate uppercase">{auth.patient_name || "Unnamed Patient"}</p>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase truncate mt-0.5">{auth.diagnosis || "No Diagnosis Specified"}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 shrink-0 rounded-full", 
                      ["approved", "authorization_approved"].includes(String(auth.status).toLowerCase()) ? "border-emerald-100 text-emerald-700 bg-emerald-50" : 
                      ["rejected", "referral_declined", "referral_expired"].includes(String(auth.status).toLowerCase()) ? "border-rose-100 text-rose-700 bg-rose-50" :
                      "border-amber-100 text-amber-700 bg-amber-50"
                    )}>
                      {auth.status || "pending"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Recent Claims Card */}
          <Card className="rounded-[16px] border border-slate-100 shadow-sm bg-white overflow-hidden">
            <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-white">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Recent Claims</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/claims")} className="text-[10px] font-black uppercase text-emerald-600 h-6 px-2 hover:bg-emerald-50">Track All</Button>
            </div>
            <div className="divide-y divide-slate-50/80">
              {pageLoading ? (
                <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
              ) : recentClaims.length === 0 ? (
                <div className="p-8 text-center">
                  <Banknote className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-300">No claims yet</p>
                  <p className="text-[10px] font-medium text-slate-400 mt-1">Claims will appear here after submission</p>
                </div>
              ) : recentClaims.map((claim) => (
                <div key={claim.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 cursor-pointer transition-colors" onClick={() => navigate("/dashboard/claims")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-slate-900 truncate uppercase">{claim.patient_name || "Unnamed Patient"}</p>
                    <p className="text-[11px] font-mono font-bold text-slate-400 mt-0.5">{claim.claim_number || claim.auth_code || "No reference"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[13px] font-black text-emerald-600 font-mono">₦{Number(claim.total_amount || 0).toLocaleString()}</span>
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black uppercase px-2 py-0 rounded-full",
                      String(claim.status).toLowerCase() === "paid" ? "border-emerald-100 text-emerald-700 bg-emerald-50"
                      : ["contested", "under_contest"].includes(String(claim.status).toLowerCase()) ? "border-blue-100 text-blue-700 bg-blue-50"
                      : "border-amber-100 text-amber-700 bg-amber-50"
                    )}>
                      {claim.status || "submitted"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
