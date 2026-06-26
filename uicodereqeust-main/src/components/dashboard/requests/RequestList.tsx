import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, Trash2 } from "lucide-react";
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
  setOtpVerifiedStatus
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
    return <Badge variant="outline" className={cn("rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider whitespace-nowrap w-fit", map[key] || "border-slate-200 bg-slate-50 text-slate-600")}>{formattedText}</Badge>;
  };

  const isAwaitingDelete = (r: any) => r.deletion_status === "awaiting_admin_approval";
  const displayStatus = (r: any) => isAwaitingDelete(r) ? "Awaiting Delete" : r.status;
  const rejectionReason = (r: any) => String(r.decision_reason || r.rejection_reason || r.clinical_notes || "").trim();
  const isRejected = (r: any) => ["rejected", "declined", "denied"].includes(String(r.status || "").toLowerCase());
  
  const codeOrDecisionText = (r: any) => {
    if (isAwaitingDelete(r)) return "Code revoked - Awaiting Delete";
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
    
    const { data, error } = await supabase.rpc("verify_otp" as any, {
      p_request_id: r.id,
      p_otp_plaintext: unlockOtpInput
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
            {requests.map((r) => (
              <tr key={r.id} className="cursor-pointer text-sm transition-colors hover:bg-slate-50/70" onClick={() => onSelectRequest(r)}>
                <td className="p-4 font-mono text-sm font-bold text-slate-500">{new Date(r.created_at).toLocaleDateString("en-GB")}</td>
                <td className="px-4 py-4">
                  <p className="text-sm font-black uppercase leading-snug text-slate-950">{r.patient_name}</p>
                  <p className="mt-1 max-w-[360px] text-xs font-semibold leading-snug text-slate-500">{r.diagnosis || "No diagnosis recorded"}</p>
                  {r.referred_hospital_name ? (
                    <p className="mt-2 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                      Referral To: {r.referred_hospital_name}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-4 font-mono text-sm font-bold text-slate-600">{r.policy_number || "-"}</td>
                <td className="px-4 py-4">
                  {role === "hospital" && r.status === "approved" && r.patient_email && !otpVerifiedStatus[r.id] ? (
                    <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                      {unlockingReqId === r.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            value={unlockOtpInput}
                            onChange={e => setUnlockOtpInput(e.target.value)}
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
                    {r.source === "whatsapp" || r.source === "whatsapp_parser" ? (
                      <span className="text-emerald-600 font-black" title="Verified via WhatsApp">✓</span>
                    ) : (
                      r.status === "pending" || r.status === "pending_referral" ? (
                        otpLoading[r.id] ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
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
                        ) : (
                          <span className="text-amber-700">••••••</span>
                        )
                      ) : r.status === "approved" || r.status === "referral_approved" || r.status === "referral_accepted" ? (
                        <span className="text-emerald-600 font-black">✓</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )
                    )}
                  </td>
                )}
                <td className="px-4 py-4">
                  <div className="flex flex-col items-start gap-1">
                    {statusBadge(displayStatus(r))}
                    {isAwaitingDelete(r) && (
                      <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black uppercase text-amber-700">Delete pending</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col items-start gap-1.5">
                    {(() => {
                      const created = new Date(r.created_at).getTime();
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="block md:hidden divide-y divide-slate-100">
        {requests.map((r) => (
          <div key={r.id} className="cursor-pointer space-y-3 p-4 transition-colors hover:bg-slate-50 active:bg-slate-100" onClick={() => onSelectRequest(r)}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-sm font-black uppercase leading-tight text-slate-950">{r.patient_name}</p>
                <p className="mt-1 text-xs font-mono font-bold text-slate-500">{r.policy_number}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {statusBadge(displayStatus(r))}
                <span className="text-xs font-mono font-bold text-slate-400">{new Date(r.created_at).toLocaleDateString("en-GB")}</span>
              </div>
            </div>
            <div className="flex justify-between items-end pt-1">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs font-semibold leading-snug text-slate-600">{r.diagnosis || "No diagnosis recorded"}</p>
                {isRejected(r) && rejectionReason(r) && (
                  <p className="mt-2 rounded-lg border border-rose-100 bg-rose-50 p-2 text-xs font-semibold leading-snug text-rose-700">Reason: {rejectionReason(r)}</p>
                )}
              </div>
            </div>
            {role === "hospital" && r.status === "approved" && r.patient_email && !otpVerifiedStatus[r.id] ? (
              <div className="pt-2" onClick={e => e.stopPropagation()}>
                {unlockingReqId === r.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      autoFocus
                      value={unlockOtpInput}
                      onChange={e => setUnlockOtpInput(e.target.value)}
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
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
                <div className={cn("font-mono text-sm font-black", (isRejected(r) || isAwaitingDelete(r)) ? "text-rose-700" : r.authorization_code ? "text-slate-800" : "text-slate-400")}>
                  {codeOrDecisionText(r)}
                </div>
                {!isClaimsRole && !isAwaitingDelete(r) && (
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDeleteRequest(r); }} className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
