import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Loader2, Trash2, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { writeClipboardText } from "@/lib/clipboard";
import {
  authorizationSlaColor,
  formatAuthorizationSla,
  formatNigeriaDate,
  formatNigeriaTime,
  getAuthorizationListTimestamp,
  getAuthorizationSlaMinutes,
} from "@/lib/authorizationTime";

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
  otpVerifiedStatus,
  onSelectRequest,
  onDeleteRequest,
  setOtpVerifiedStatus,
  isLoading
}: RequestListProps) {
  const { toast } = useToast();
  const { user, hospitalId } = useAuth();
  const [unlockingReqId, setUnlockingReqId] = useState<string | null>(null);
  const [unlockOtpInput, setUnlockOtpInput] = useState("");

  const statusBadge = (s: string) => {
    const key = String(s || "").toLowerCase();
    const map: Record<string, string> = {
      approved: "border-emerald-200 text-emerald-700 bg-emerald-50",
      partially_approved: "border-sky-200 text-sky-700 bg-sky-50",
      referral_approved: "border-slate-200 text-slate-700 bg-slate-100",
      referral_accepted: "border-slate-200 text-slate-700 bg-slate-100",
      referral_declined: "border-rose-200 text-rose-700 bg-rose-50",
      rejected: "border-rose-200 text-rose-700 bg-rose-50",
      pending: "border-amber-200 text-amber-800 bg-amber-50",
      pending_referral: "border-amber-200 text-amber-800 bg-amber-50",
      deferred: "border-slate-200 text-slate-700 bg-slate-50",
      "awaiting deletion approval": "border-amber-200 text-amber-800 bg-amber-50",
      "awaiting delete": "border-amber-200 text-amber-800 bg-amber-50"
    };
    const formattedText = String(s || "").replace(/_/g, " ");
    return (
      <Badge
        variant="outline"
        className={cn(
          "inline-flex items-center justify-center w-[124px] h-[26px] whitespace-nowrap rounded-full px-2 text-[11px] font-semibold tracking-tight capitalize leading-none shadow-none border",
          map[key] || "border-slate-200 bg-slate-50 text-slate-600"
        )}
      >
        {formattedText}
      </Badge>
    );
  };

  const isAwaitingDelete = (r: any) => r.deletion_status === "awaiting_admin_approval";
  const canRequestDeletion = (r: any) =>
    !isClaimsRole &&
    (role !== "hospital" || (r.submitted_by === user?.id && r.hospital_id === hospitalId));
  const displayStatus = (r: any) => isAwaitingDelete(r) ? "Awaiting Delete" : r.status;
  const rejectionReason = (r: any) => String(r.decision_reason || r.rejection_reason || r.clinical_notes || "").trim();
  const isRejected = (r: any) => ["rejected", "declined", "denied"].includes(String(r.status || "").toLowerCase());
  const isApproved = (r: any) => String(r.status || "").toLowerCase().includes("approved") || String(r.status || "").toLowerCase().includes("accepted");
  const canShowAuthorizationCode = (r: any) => Boolean(r.authorization_code) && !isAwaitingDelete(r) && !(role === "hospital" && isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id]);
  
  const codeOrDecisionText = (r: any) => {
    if (isAwaitingDelete(r)) return "Code revoked - Awaiting Delete";
    if (role === "hospital" && isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id]) return "Locked";
    if (r.authorization_code) return r.authorization_code;
    if (isRejected(r)) return rejectionReason(r) || "Declined";
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
  const approverShortLabel = (r: any) => approverLabel(r).split(/\s+/)[0];

  const handleCopyCode = async (code: string) => {
    if (!code) return;
    try {
      await writeClipboardText(code);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Allow clipboard access or copy the code manually." });
    }
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
      <div className="hidden w-full md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-[13%]" />
            <col className="w-[20%]" />
            <col className="w-[9%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className={isClaimsRole ? "w-[18%]" : "w-[10%]"} />
            <col className="w-[6%]" />
            {!isClaimsRole && <col className="w-[8%]" />}
          </colgroup>
          <thead className="table-heading">
            <tr>
              <th className="p-2">Date</th>
              <th className="p-2">Patient / Diagnosis</th>
              <th className="p-2">Policy</th>
              <th className="p-2">Auth Code</th>
              <th className="p-2">Status</th>
              <th className="p-2">Approver</th>
              <th className="px-1.5 py-2">SLA</th>
              {!isClaimsRole && <th className="p-2 text-right">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && requests.length === 0 ? (
              <tr>
                <td colSpan={isClaimsRole ? 7 : 8} className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-brand-700" />
                  Loading requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={isClaimsRole ? 7 : 8} className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                  No authorization requests found.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <Fragment key={r.id}>
                <tr className="cursor-pointer text-sm transition-colors hover:bg-slate-50/70" onClick={() => onSelectRequest(r)}>
                  <td className="min-w-0 p-2 font-mono text-xs font-bold text-slate-600">
                    <div className="flex min-w-0 flex-col">
                      {(() => {
                        const { label, timestamp } = getAuthorizationListTimestamp(r);
                        return (
                          <>
                            <span className="whitespace-nowrap tabular-nums">{formatNigeriaDate(timestamp)}</span>
                            <span className="mt-0.5 whitespace-nowrap font-sans text-[10px] font-medium leading-3 text-slate-600 tabular-nums">
                              {label} at {formatNigeriaTime(timestamp)}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="min-w-0 p-2">
                    <p className="break-words text-sm font-semibold normal-case leading-snug text-slate-950">{r.patient_name}</p>
                    <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug text-slate-600">{r.diagnosis || "No diagnosis recorded"}</p>
                  </td>
                  <td className="min-w-0 break-all p-2 font-mono text-xs font-semibold text-slate-700">{r.policy_number || "-"}</td>
                  <td className="min-w-0 p-2">
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
                            <LockKeyhole className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Unlock code
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className={cn("flex min-w-0 items-center gap-1 font-mono text-xs font-bold leading-snug",
                        (isRejected(r) || isAwaitingDelete(r))
                          ? "text-rose-700"
                          : r.authorization_code 
                          ? "text-slate-800" 
                          : "text-slate-500"
                      )}>
                        {codeOrDecisionText(r) === "Locked" && <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0 break-all">{codeOrDecisionText(r)}</span>
                        {r.authorization_code && !isAwaitingDelete(r) && (
                          <Button variant="ghost" size="icon" aria-label={`Copy authorization code for ${r.patient_name}`} title={`Copy authorization code for ${r.patient_name}`} onClick={(e) => { e.stopPropagation(); handleCopyCode(r.authorization_code); }} className="h-7 w-7 shrink-0 text-slate-600 hover:text-slate-800">
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="min-w-0 p-2">
                    <div className="flex flex-col items-start gap-1">
                      <div className="max-w-full">{statusBadge(displayStatus(r))}</div>
                      {r.is_historical && (
                        <Badge variant="outline" className="inline-flex items-center justify-center w-[124px] h-5 rounded-full border-indigo-200 bg-indigo-50 px-2 text-[10px] font-bold uppercase tracking-wider text-indigo-700">Historical</Badge>
                      )}
                      {isAwaitingDelete(r) && (
                        <Badge variant="outline" className="inline-flex items-center justify-center w-[124px] h-5 rounded-full border-amber-200 bg-amber-50 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-700">Delete pending</Badge>
                      )}
                    </div>
                  </td>
                  <td className="min-w-0 p-2">
                    <Badge
                      variant="outline"
                      title={approverLabel(r)}
                      className="mx-auto inline-flex h-8 w-[96px] max-w-full min-w-0 items-center justify-center truncate rounded-md border-slate-200 bg-slate-50 px-2 py-1 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-700"
                    >
                      {approverShortLabel(r)}
                    </Badge>
                  </td>
                  <td className="min-w-0 px-1.5 py-2 text-center">
                    {(() => {
                      const slaMinutes = getAuthorizationSlaMinutes(r);
                      return (
                        <span className={cn("whitespace-nowrap text-xs font-mono font-bold", slaMinutes === null ? "text-slate-400" : authorizationSlaColor(slaMinutes))}>
                          {slaMinutes === null ? "—" : formatAuthorizationSla(slaMinutes)}
                        </span>
                      );
                    })()}
                  </td>
                  {!isClaimsRole && (
                    <td className="px-1.5 py-2 text-right">
                      {canRequestDeletion(r) && !isAwaitingDelete(r) && (
                        <Button variant="ghost" size="icon" aria-label={`Request deletion for ${r.patient_name}`} title={`Request deletion for ${r.patient_name}`} onClick={e => { e.stopPropagation(); onDeleteRequest(r); }} className="h-8 w-8 text-slate-600 hover:text-rose-700 hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
                {r.referred_hospital_name && (
                  <tr className="cursor-pointer bg-slate-50/40 text-xs hover:bg-slate-50/70" onClick={() => onSelectRequest(r)}>
                    <td colSpan={isClaimsRole ? 7 : 8} className="px-2 pb-2 pt-0">
                      <span
                        className="ml-[13%] inline-block max-w-[min(28rem,70%)] break-words rounded border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-slate-600"
                        title={`Referral: ${r.referred_hospital_name}`}
                      >
                        Referral: {r.referred_hospital_name}
                      </span>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="block md:hidden min-h-[50vh] space-y-3 bg-slate-100/70 px-1 py-3 min-[420px]:px-2 sm:px-2">
        {isLoading && requests.length === 0 ? (
          <div className="py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400 bg-white rounded-xl shadow-sm p-6 border border-slate-100">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-brand-700" />
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
              <div key={r.id} className="flex cursor-pointer flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-50" onClick={() => onSelectRequest(r)}>
                {/* Header Row */}
                <div className="mb-1 flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold normal-case leading-snug text-slate-900">{r.patient_name}</span>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold shrink-0",
                    isApproved(r) ? "bg-emerald-50 text-emerald-600" : isRej ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-600"
                  )}>
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      isApproved(r) ? "bg-emerald-500" : isRej ? "bg-rose-500" : "bg-slate-400"
                    )} />
                    {displayStatus(r).replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase())}
                  </div>
                </div>
                
                {/* Diagnosis */}
                <div className="mb-1.5 line-clamp-2 text-xs font-medium leading-relaxed text-slate-600">
                  {r.diagnosis || "No diagnosis recorded"}
                </div>

                {/* Referral */}
                {r.referred_hospital_name && (
                  <div
                    className="text-[11px] font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-md inline-block max-w-full truncate mb-3"
                    title={`Referral: ${r.referred_hospital_name}`}
                  >
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
                    <span className="flex min-w-0 flex-col text-[11px] font-medium text-slate-400">
                      {(() => {
                        const { label, timestamp } = getAuthorizationListTimestamp(r);
                        return (
                          <>
                            <span className="whitespace-nowrap tabular-nums">{formatNigeriaDate(timestamp)}</span>
                            <span className="mt-0.5 whitespace-nowrap font-sans text-[10px] font-medium leading-3 text-slate-600 tabular-nums">
                              {label} at {formatNigeriaTime(timestamp)}
                            </span>
                          </>
                        );
                      })()}
                    </span>
                    <span className={cn(
                      "mt-1 text-[11px] font-mono font-bold",
                      canShowAuthorizationCode(r)
                        ? "inline-flex w-fit max-w-full items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-semibold leading-tight text-slate-700"
                        : (isRej || isAwaitingDelete(r)) ? "text-rose-600" : "text-slate-400"
                    )}>
                      {codeOrDecisionText(r) === "Locked" && <LockKeyhole className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}{codeOrDecisionText(r)}
                    </span>
                    {(() => {
                      const slaMinutes = getAuthorizationSlaMinutes(r);
                      return slaMinutes === null ? null : (
                        <span className="mt-1 flex items-center gap-1 text-[11px] leading-tight">
                          <span className="font-semibold uppercase tracking-wide text-slate-400">SLA</span>
                          <span className={cn("font-mono font-bold", authorizationSlaColor(slaMinutes))}>
                            {formatAuthorizationSla(slaMinutes)}
                          </span>
                          {!r.decided_at && <span className="text-slate-400">elapsed</span>}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="default" size="sm" className="group h-11 min-w-[56px] rounded-md border-0 bg-transparent p-0 text-xs font-semibold text-white shadow-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-slate-500" title="View authorization details" onClick={(e) => { e.stopPropagation(); onSelectRequest(r); }}>
                      <span className="flex h-8 w-full items-center justify-center rounded-md bg-slate-800 transition-colors group-hover:bg-slate-700 group-active:bg-slate-900">View</span>
                    </Button>
                    {canShowAuthorizationCode(r) && (
                      <Button variant="outline" size="icon" className="group h-11 w-11 rounded-md border-0 bg-transparent p-0 text-slate-600 shadow-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-slate-500" aria-label="Copy authorization code" title="Copy authorization code" onClick={(e) => { e.stopPropagation(); void handleCopyCode(r.authorization_code); }}>
                        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white transition-colors group-hover:border-slate-300 group-hover:bg-slate-50 group-active:bg-slate-100">
                          <Copy className="h-4 w-4" />
                        </span>
                      </Button>
                    )}
                    {canRequestDeletion(r) && !isAwaitingDelete(r) && (
                      <Button variant="ghost" size="icon" aria-label="Request record deletion" title="Request record deletion" onClick={(e) => { e.stopPropagation(); onDeleteRequest(r); }} className="h-11 w-11 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700">
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
                        <LockKeyhole className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Unlock code
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
