import re

with open("src/pages/hospital/HospitalPortalPage.tsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('import { Card, CardContent } from "@/components/ui/card";', 'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";')

jsx_start = content.find("  return (")
if jsx_start != -1:
    new_jsx = """  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <div className="pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Hospital Portal</h1>
            <p className="text-xs text-slate-500">Facility: {hospital?.name || fullName || "Loading..."} · {hospital?.code || "???"}</p>
          </div>
          <Button 
            onClick={() => navigate("/dashboard/new-request")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg h-8 px-4 text-xs font-bold gap-1.5 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4" /> New Auth
          </Button>
        </div>
      </div>

      {approachingDeadlineClaims.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-start gap-3 shadow-md animate-in slide-in-from-top duration-300">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">Approaching Contest Deadline</h4>
            <p className="text-xs font-semibold text-amber-700 mt-1">
              You have {approachingDeadlineClaims.length} partially approved {approachingDeadlineClaims.length === 1 ? 'claim' : 'claims'} with contest deadlines expiring in the next 5 days. Please review and submit any contestations to avoid losing your eligibility.
            </p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
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
      
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="rounded-xl border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-50 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">Recent Records</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/authorizations")} className="text-xs font-black uppercase text-slate-400">View All</Button>
        </CardHeader>
        <div className="divide-y divide-slate-50 overflow-x-auto min-w-[300px]">
          {pageLoading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          ) : recentAuths.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-200 mb-2" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-300">No authorization records yet</p>
              <p className="text-xs font-medium text-slate-400 mt-1">Submit your first request to get started</p>
            </div>
          ) : recentAuths.map((auth) => {
            const patientInitial = (auth.patient_name || "").trim().charAt(0) || "?";
            return (
              <div key={auth.id} className="p-3 flex items-center justify-between hover:bg-slate-50 cursor-pointer" onClick={() => navigate("/dashboard/authorizations")}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-500 shrink-0">{patientInitial}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 leading-tight uppercase">{auth.patient_name || "Unnamed Patient"}</p>
                    <p className="text-xs font-semibold text-slate-400 uppercase leading-tight mt-0.5">{auth.diagnosis || "No Diagnosis Specified"}</p>
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-xs font-black uppercase px-2.5 py-0.5 shrink-0 rounded-full", ["approved", "authorization_approved"].includes(String(auth.status).toLowerCase()) ? "border-emerald-100 text-emerald-600 bg-emerald-50/20" : ["rejected", "referral_declined", "referral_expired"].includes(String(auth.status).toLowerCase()) ? "border-rose-100 text-rose-600 bg-rose-50/20" : "border-amber-100 text-amber-600 bg-amber-50/20")}>{auth.status || "pending"}</Badge>
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="rounded-xl border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="p-4 border-b border-slate-50 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500">Recent Claims</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/claims")} className="text-xs font-black uppercase text-slate-400">Track All</Button>
        </CardHeader>
        <div className="divide-y divide-slate-50 overflow-x-auto min-w-[300px]">
          {pageLoading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          ) : recentClaims.length === 0 ? (
            <div className="p-8 text-center">
              <Banknote className="mx-auto h-8 w-8 text-slate-200 mb-2" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-300">No claims submitted yet</p>
              <p className="text-xs font-medium text-slate-400 mt-1">Claims will appear here after submission</p>
            </div>
          ) : recentClaims.map((claim) => (
            <div key={claim.id} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer" onClick={() => navigate("/dashboard/claims")}>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 leading-tight uppercase">{claim.patient_name || "Unnamed Patient"}</p>
                <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">{claim.claim_number || claim.auth_code || "No reference"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-black text-emerald-600 font-mono">₦{Number(claim.total_amount || 0).toLocaleString()}</span>
                <Badge variant="outline" className={cn(
                  "text-xs font-black uppercase px-2.5 py-0.5 rounded-full",
                  String(claim.status).toLowerCase() === "paid" ? "border-emerald-100 text-emerald-600 bg-emerald-50/20"
                  : ["contested", "under_contest"].includes(String(claim.status).toLowerCase()) ? "border-blue-100 text-blue-600 bg-blue-50/20"
                  : "border-amber-100 text-amber-600 bg-amber-50/20"
                )}>{claim.status || "submitted"}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
      </div>
    </div>
  );
}
"""
    content = content[:jsx_start] + new_jsx

with open("src/pages/hospital/HospitalPortalPage.tsx", "w", encoding="utf-8") as f:
    f.write(content)
