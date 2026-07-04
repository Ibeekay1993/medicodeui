import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, Trash2, MessageSquare, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface RequestListProps {
  requests: any[];
  role: string | undefined;
  isClaimsRole: boolean;
  approverNames: Record<string, string>;
  otpValues: Record<string, string>;
  otpLoading: Record<string, boolean>;
  otpVerifiedStatus: Record<string, boolean>;
  onSelectRequest: (r: any) => void;
  onDeleteRequest: (r: any) => void;
  setOtpVerifiedStatus: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isLoading?: boolean;
}

export function RequestList({
  requests,
  role,
  isClaimsRole,
  approverNames,
  otpValues,
  otpLoading,
  otpVerifiedStatus,
  onSelectRequest,
  onDeleteRequest,
  setOtpVerifiedStatus,
  isLoading
}: RequestListProps) {
  const { toast } = useToast();
  const [unlockingReqId, setUnlockingReqId] = useState<string | null>(null);
  const [unlockOtpInput, setUnlockOtpInput] = useState("");

  const statusBadge = (s: string) => {
    const key = String(s || "").toLowerCase();
    const map: Record<string, string> = {
      approved: "border-emerald-200 text-emerald-700 bg-emerald-50",
      referral_approved: "border-blue-200 text-blue-700 bg-blue-50",
      referral_accepted: "border-indigo-200 text-indigo-700 bg-indigo-50",
      referral_declined: "border-rose-200 text-rose-700 bg-rose-50",
      rejected: "border-rose-200 text-rose-700 bg-rose-50",
      pending: "border-amber-200 text-amber-800 bg-amber-50",
      pending_referral: "border-amber-200 text-amber-800 bg-amber-50",
      deferred: "border-slate-200 text-slate-700 bg-slate-50",
      "awaiting deletion approval": "border-amber-200 text-amber-800 bg-amber-50",
      "awaiting delete": "border-amber-200 text-amber-800 bg-amber-50"
    };
    const formattedText = String(s || "").replace(/_/g, " ");
    return <Badge variant="outline" className={cn("rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-normal text-center leading-[1.2] max-w-[120px] w-fit", map[key] || "border-slate-200 bg-slate-50 text-slate-600")}>{formattedText}</Badge>;
  };

  const isAwaitingDelete = (r: any) => r.deletion_status === "awaiting_admin_approval";
  const displayStatus = (r: any) => isAwaitingDelete(r) ? "Awaiting Delete" : r.status;
  const rejectionReason = (r: any) => String(r.decision_reason || r.rejection_reason || r.clinical_notes || "").trim();
  const isRejected = (r: any) => ["rejected", "declined", "denied"].includes(String(r.status || "").toLowerCase());
  const isApproved = (r: any) => String(r.status || "").toLowerCase().includes("approved") || String(r.status || "").toLowerCase().includes("accepted");
  
  const codeOrDecisionText = (r: any) => {
    if (isAwaitingDelete(r)) return "Code revoked - Awaiting Delete";
    if (role === "hospital" && isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id]) return "🔒 Locked";
    if (r.authorization_code) return r.authorization_code;
    if (isRejected(r)) return rejectionReason(r) || "Rejected - reason not recorded";
    return "Pending";
  };
  
  const approverLabel = (r: any) => {
    const byName = String(r.authorized_by_name || "").trim();
    if (byName) return byName;
    const byId = r.approved_by || r.decided_by;
    if (byId && approverNames[byId]) return approverNames[byId];
    const initials = String(r.nurse_initials || "").trim();
    if (initials) return `UM ${initials}`;
    if (String(r.status || "").toLowerCase() === "approved") return "Unknown UM";
    return "Unassigned";
  };

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast({ title: "Copied to clipboard" });
  };

  const handleUnlockOtp = async (r: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!unlockOtpInput) return;
    const otpType = 'ARRIVAL';

    const { data, error } = await supabase.rpc("verify_otp" as any, {
      p_request_id: unlockingReqId,
      p_otp_plaintext: unlockOtpInput,
      p_otp_type: otpType,
      p_hospital_id: r.referred_hospital_id || r.hospital_id || null
    });
    
    if (error) {
      toast({ variant: "destructive", title: "Unlock Failed", description: error.message });
      return;
    }
    
    if (data?.verified) {
      toast({ title: "Unlocked", description: "Authorization code revealed." });
      setOtpVerifiedStatus(prev => ({ ...prev, [r.id]: true }));
      setUnlockingReqId(null);
      setUnlockOtpInput("");
    } else {
      toast({ variant: "destructive", title: "Unlock Failed", description: data?.error || "Invalid OTP" });
    }
  };

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto w-full">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="table-heading">
            <tr>
              <th className="p-4">Date</th>
              <th className="px-4 py-4">Patient / Diagnosis</th>
              <th className="px-4 py-4">Policy</th>
              <th className="px-4 py-4">Auth Code</th>
              {!isClaimsRole && !["hospital"].includes(role || "") && (
                <th className="px-4 py-4">OTP</th>
              )}
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Approver & SLA</th>
              {!isClaimsRole && <th className="px-4 py-4 text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={isClaimsRole ? 6 : 8} className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#3f3f95]" />
                  Loading requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={isClaimsRole ? 6 : 8} className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                  No authorization requests found.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="cursor-pointer text-sm transition-colors hover:bg-slate-50/70" onClick={() => onSelectRequest(r)}>
                  <td className="p-4 font-mono text-sm font-bold text-slate-600">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-black uppercase leading-snug text-slate-950">{r.patient_name}</p>
                    <p className="mt-1 max-w-[360px] text-xs font-semibold leading-snug text-slate-600">{r.diagnosis || "No diagnosis recorded"}</p>
                    {r.referred_hospital_name ? (
                      <p className="mt-1.5 inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider text-slate-500">
                        Referral To: {r.referred_hospital_name}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 font-mono text-sm font-bold text-slate-700">{r.policy_number || "-"}</td>
                  <td className="px-4 py-4">
                    {role === "hospital" && isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id] ? (
                      <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                        {unlockingReqId === r.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              autoFocus
                              value={unlockOtpInput}
                              onChange={e => setUnlockOtpInput(e.target.value.toUpperCase())}
                              placeholder="Enter OTP"
                              className="h-8 w-24 text-xs font-mono font-bold"
                            />
                            <Button size="sm" onClick={(e) => handleUnlockOtp(r, e)} className="h-8 px-2 text-xs">Unlock</Button>
                            <Button variant="ghost" size="sm" onClick={() => setUnlockingReqId(null)} className="h-8 px-2 text-xs text-slate-400">Cancel</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUnlockingReqId(r.id); }} className="h-8 w-fit text-xs border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                            🔒 Unlock Code
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className={cn("flex items-center font-mono text-sm font-black leading-snug", 
                        (isRejected(r) || isAwaitingDelete(r)) 
                          ? "max-w-[260px] text-rose-700" 
                          : r.authorization_code 
                          ? "text-slate-800" 
                          : "text-slate-500"
                      )}>
                        {codeOrDecisionText(r)}
                        {r.authorization_code && !isAwaitingDelete(r) && (
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleCopyCode(r.authorization_code); }} className="ml-2 h-8 w-8 text-slate-400 hover:text-slate-600">
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                    {!isClaimsRole && !["hospital"].includes(role || "") && (
                      <td className="px-4 py-4 font-mono text-sm font-bold">
                        {r.is_historical ? (
                          <span className="text-slate-400 font-black tracking-wider text-xs">N/A</span>
                        ) : r.status === "pending" ? (
                          <span className="text-slate-400 font-black tracking-wider text-xs">N/A</span>
                        ) : (r.source === "whatsapp" || r.source === "whatsapp_parser") ? (
                          <span className="text-emerald-600 font-black flex items-center justify-center" title="Verified via WhatsApp"><CheckCircle2 className="w-4 h-4" /></span>
                        ) : otpLoading[r.id] ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                        ) : otpVerifiedStatus[r.id] ? (
                          <span className="text-emerald-600 font-black flex items-center justify-center" title="OTP successfully consumed"><CheckCircle2 className="w-4 h-4" /></span>
                        ) : otpValues[r.id] ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-amber-700 font-black tracking-wider">{otpValues[r.id]}</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(otpValues[r.id]); toast({ title: "OTP Copied" }); }} 
                              className="h-5 w-5 text-slate-400 hover:text-amber-700"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : ["pending", "pending_authorization", "pending_referral", "info_provided"].includes(r.status) ? (
                          <span className="text-amber-700">••••••</span>
                        ) : (
                          <span className="text-slate-400 font-black tracking-wider text-xs">N/A</span>
                        )}
                      </td>
                    )}
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1">
                      {statusBadge(displayStatus(r))}
                      {r.is_historical && (
                        <Badge variant="outline" className="rounded-md border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-black uppercase text-indigo-700">Historical</Badge>
                      )}
                      {isAwaitingDelete(r) && (
                        <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-700">Delete pending</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      {(() => {
                        const created = r.treatment_submitted_at ? new Date(r.treatment_submitted_at).getTime() : new Date(r.created_at).getTime();
                        const resolved = r.decided_at ? new Date(r.decided_at).getTime() : Date.now();
                        const diffMins = Math.round((resolved - created) / (1000 * 60));
                        const slaType = diffMins <= 15 ? "good" : diffMins <= 30 ? "warning" : "danger";
                        const timeStr = diffMins >= 60 ? `${Math.floor(diffMins / 60)}h ${diffMins % 60}m` : `${diffMins}m`;
                        const timeColor = slaType === "good" ? "text-emerald-600" : slaType === "warning" ? "text-amber-600 font-bold" : "text-rose-600 font-bold";
                        return (
                          <div className="flex items-center gap-2">
                            <span className={cn("text-xs font-mono font-bold w-14", timeColor)}>{timeStr}</span>
                            <Badge variant="outline" className="max-w-[150px] rounded-md border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700">
                              <span className="truncate">{approverLabel(r)}</span>
                            </Badge>
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  {!isClaimsRole && (
                    <td className="px-4 py-4 text-right">
                      {!isAwaitingDelete(r) && (
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onDeleteRequest(r); }} className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="block md:hidden p-4 space-y-4 bg-slate-50 min-h-[50vh]">
        {isLoading ? (
          <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400 bg-white rounded-xl shadow-sm p-6 border border-slate-100">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#3f3f95]" />
            Loading requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400 bg-white rounded-xl shadow-sm p-6 border border-slate-100">
            No authorization requests found.
          </div>
        ) : (
          requests.map((r) => {
            const isRej = isRejected(r);
            const isPend = !isApproved(r) && !isRej;
            
            return (
              <div key={r.id} className="cursor-pointer bg-white border border-slate-200 rounded-[14px] p-4 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.99] flex flex-col" onClick={() => onSelectRequest(r)}>
                {/* Header Row */}
                <div className="flex items-start justify-between gap-3 mb-1">
                  <span className="text-[14px] font-bold text-slate-900 flex-1 min-w-0 uppercase leading-tight">{r.patient_name}</span>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0",
                    isApproved ? "bg-emerald-50 text-emerald-600" : isRej ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                  )}>
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      isApproved ? "bg-emerald-500" : isRej ? "bg-rose-500" : "bg-blue-500"
                    )} />
                    {displayStatus(r).replace(/_/g, " ")}
                  </div>
                </div>
                
                {/* Diagnosis */}
                <div className="text-xs text-slate-500 mb-2 truncate font-medium">
                  {r.diagnosis || "No diagnosis recorded"}
                </div>

                {/* Referral */}
                {r.referred_hospital_name && (
                  <div className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-md inline-block max-w-full truncate mb-3">
                    Referral to: {r.referred_hospital_name}
                  </div>
                )}
                {isRej && rejectionReason(r) && (
                  <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-1 rounded-md inline-block max-w-full line-clamp-2 mb-3">
                    Reason: {rejectionReason(r)}
                  </div>
                )}

                {/* Body / Actions */}
                <div className="flex justify-between items-end gap-3 mt-1 pt-3 border-t border-slate-100">
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[11px] font-medium text-slate-400">
                      {new Date(r.created_at).toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                    <span className={cn("text-[11px] font-mono font-bold mt-1", (isRej || isAwaitingDelete(r)) ? "text-rose-600" : r.authorization_code ? "text-slate-800" : "text-slate-400")}>
                      {codeOrDecisionText(r)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" className="h-8 px-3 rounded-md text-xs font-semibold text-slate-600 border-slate-200 bg-white" onClick={(e) => { e.stopPropagation(); onSelectRequest(r); }}>
                      View
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-full text-slate-600 border-slate-200 bg-white" aria-label="Message" onClick={(e) => { e.stopPropagation(); toast({ title: "Opening messages...", description: "Feature available in detailed view." }); onSelectRequest(r); }}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    {!isClaimsRole && !isAwaitingDelete(r) && (
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDeleteRequest(r); }} className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {role === "hospital" && isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id] && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end" onClick={e => e.stopPropagation()}>
                    {unlockingReqId === r.id ? (
                      <div className="flex items-center gap-2">
                        <Input autoFocus value={unlockOtpInput} onChange={e => setUnlockOtpInput(e.target.value.toUpperCase())} placeholder="OTP" className="h-8 w-20 text-xs font-mono font-bold px-2" />
                        <Button size="sm" onClick={(e) => handleUnlockOtp(r, e)} className="h-8 px-3 text-xs bg-amber-500 hover:bg-amber-600 text-white">Unlock</Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUnlockingReqId(r.id); }} className="h-8 px-3 text-xs border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md font-semibold">
                        🔒 Unlock Code
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
