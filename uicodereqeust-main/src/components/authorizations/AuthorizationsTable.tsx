import { BrandSpinner } from "@/components/BrandSpinner";
import { useState } from "react";
import { Copy, MessageSquare, Eye, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatNigeriaDate, formatNigeriaTime, getAuthorizationListTimestamp } from "@/lib/authorizationTime";
import {
  isReferralFor,
  claimOwnerNameFor,
  isRejected,
  rejectionReason,
  isClaimEligible,
  canSubmitClaimFor
} from "@/lib/authorizations-helpers";

// Solid pill colours — matches Utilization Officer / RequestList badge style
const STATUS_BADGE: Record<string, string> = {
  approved:           "bg-emerald-600 text-white border-transparent",
  partially_approved: "bg-sky-600    text-white border-transparent",
  referral_approved:  "bg-indigo-600 text-white border-transparent",
  referral_accepted:  "bg-blue-600   text-white border-transparent",
  pending_referral:   "bg-amber-500  text-white border-transparent",
  pending:            "bg-amber-500  text-white border-transparent",
  rejected:           "bg-rose-600   text-white border-transparent",
  referral_declined:  "bg-rose-600   text-white border-transparent",
  awaiting_admin_approval: "bg-rose-700 text-white border-transparent",
};
const STATUS_BADGE_DEFAULT = "bg-slate-500 text-white border-transparent";

interface AuthorizationsTableProps {
  paginatedRequests: any[];
  hospital: any;
  claimStatusFor: (request: any) => string | undefined;
  handleCopyAuth: (request: any) => void;
  openRequestChat: (request: any) => void;
  setSelectedRequest: (request: any) => void;
  setIsReviewing: (open: boolean) => void;
  onProcessReferral?: (request: any) => void;
  onSubmitTreatmentPlan?: (request: any) => void;
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
  otpVerifiedStatus?: Record<string, boolean>;
  setOtpVerifiedStatus?: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isLoading?: boolean;
}

export default function AuthorizationsTable({
  paginatedRequests,
  hospital,
  claimStatusFor,
  handleCopyAuth,
  openRequestChat,
  setSelectedRequest,
  setIsReviewing,
  onProcessReferral,
  onSubmitTreatmentPlan,
  page,
  totalPages,
  start,
  end,
  total,
  pageSize,
  setPage,
  otpVerifiedStatus = {},
  setOtpVerifiedStatus,
  isLoading = false
}: AuthorizationsTableProps) {
  const { toast } = useToast();
  const [unlockingReqId, setUnlockingReqId] = useState<string | null>(null);
  const [unlockOtpInput, setUnlockOtpInput] = useState("");

  const handleUnlockOtp = async (r: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!unlockOtpInput) return;
    const otpType = 'ARRIVAL';
    
    const { data, error } = await supabase.rpc("verify_otp" as any, {
      p_request_id: r.id,
      p_otp_plaintext: unlockOtpInput,
      p_otp_type: otpType,
      p_hospital_id: hospital?.id || r.referred_hospital_id || r.hospital_id || null
    });
    
    if (error) {
      toast({ variant: "destructive", title: "Unlock Failed", description: error.message });
      return;
    }
    
    if (data?.verified) {
      toast({ title: "Unlocked", description: "Authorization code revealed." });
      setOtpVerifiedStatus?.(prev => ({ ...prev, [r.id]: true }));
      setUnlockingReqId(null);
      setUnlockOtpInput("");
    } else {
      toast({ variant: "destructive", title: "Unlock Failed", description: data?.error || "Invalid OTP" });
    }
  };

  const isApproved = (r: any) => {
    const s = String(r.status || "").toLowerCase();
    return s.includes("approved") || s.includes("accepted");
  };

  if (isLoading) {
    return (
      <Card className="flex min-h-48 items-center justify-center rounded-xl border border-slate-100 bg-white p-8 text-sm text-slate-500">
        <BrandSpinner className="mr-2 h-5 w-5 animate-spin" /> Loading authorizations…
      </Card>
    );
  }

  return (
    <>
      <Card className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-[170px] min-w-[170px] px-4 py-3">Submission Date</th>
                <th className="py-3 pr-4">Patient & Diagnosis</th>
                <th className="py-3 pr-4">Auth Code</th>
                <th className="py-3 pr-4">Review Status</th>
                <th className="py-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-700">
                    No authorization requests found.
                  </td>
                </tr>
              ) : (
                paginatedRequests.map(r => {
                  const claimStatus = claimStatusFor(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                      <td className="px-4 py-2 font-mono font-bold text-slate-600">
                        <div className="flex min-w-0 flex-col overflow-hidden">
                          {(() => {
                            const { label, timestamp } = getAuthorizationListTimestamp(r);
                            return (
                              <>
                                <span className="whitespace-nowrap tabular-nums text-xs font-bold text-slate-700">{formatNigeriaDate(timestamp)}</span>
                                <span className="mt-0.5 whitespace-nowrap font-sans text-[10px] font-medium text-slate-500 tabular-nums">
                                  {formatNigeriaTime(timestamp)}
                                </span>
                                {label && (
                                  <span
                                    className="mt-0.5 truncate font-sans text-[9.5px] font-medium leading-tight text-slate-400"
                                    title={`${label} at ${formatNigeriaTime(timestamp)}`}
                                  >
                                    {label}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <p className="text-sm font-semibold normal-case leading-snug text-slate-950">{r.patient_name}</p>
  <p className="mt-1 text-xs font-semibold text-slate-600 leading-snug break-words whitespace-normal max-w-[300px]">{r.diagnosis}</p>
                        {r.referred_hospital_id === hospital?.id && r.hospital_id !== hospital?.id ? (
                          <span className="mt-1.5 inline-flex max-w-[280px] rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            <span className="break-words whitespace-normal leading-snug">📥 Inbound Referral from: {r.hospital_name || r.referring_hospital_name || "External Facility"}</span>
                          </span>
                        ) : isReferralFor(r) ? (
                          <span className="mt-1.5 inline-flex max-w-[240px] rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            <span className="break-words whitespace-normal leading-snug">Referral To: {claimOwnerNameFor(r)}</span>
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">
                        {isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id] ? (
                          <div className="flex flex-col gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
                            {unlockingReqId === r.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  value={unlockOtpInput}
                                  onChange={e => setUnlockOtpInput(e.target.value.toUpperCase())}
                                  placeholder="Enter OTP"
                                  className="h-8 w-24 text-xs font-mono font-bold px-2 uppercase"
                                />
                                <Button size="sm" onClick={(e) => handleUnlockOtp(r, e)} className="h-8 px-2 text-xs">Unlock</Button>
                                <Button variant="ghost" size="sm" onClick={() => setUnlockingReqId(null)} className="h-8 px-2 text-xs text-slate-400">Cancel</Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUnlockingReqId(r.id); }} className="h-8 w-fit text-xs border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                                <><LockKeyhole className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Unlock code</>
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className={cn("font-mono font-black text-sm max-w-[260px] flex items-center gap-1",
                            isRejected(r) 
                              ? "text-rose-700" 
                              : "text-slate-800"
                          )}>
                            <span className="break-words whitespace-normal leading-snug min-w-0">
                              {r.deletion_status === "awaiting_admin_approval" 
                                ? "WITHDRAWN – Awaiting Delete" 
                                : r.authorization_code 
                                  ? r.authorization_code 
                                  : isRejected(r) 
                                  ? (
                                    <span className="text-xs font-semibold text-rose-500">{rejectionReason(r) || "reason not recorded"}</span>
                                  )
                                  : "PENDING"
                              }
                            </span>
                            {r.authorization_code && r.deletion_status !== "awaiting_admin_approval" && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={(e) => { e.stopPropagation(); handleCopyAuth(r); }} 
                                aria-label={`Copy authorization code for ${r.patient_name}`}
                                title={`Copy authorization code for ${r.patient_name}`}
                                className="ml-1 h-8 w-8 text-slate-400 hover:text-slate-600 shrink-0"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge className={cn(
                            "inline-flex items-center justify-center w-[124px] h-[26px] px-2 rounded-full border whitespace-nowrap text-[11px] font-semibold tracking-tight shadow-none capitalize",
                            STATUS_BADGE[String(r.status || "").toLowerCase()] ?? STATUS_BADGE_DEFAULT
                          )}>
                            {(() => {
                              const st = String(r.status || "");
                              if (st === "referral_approved") return "Referral approved";
                              if (st === "partially_approved") return "Partially approved";
                              if (st === "referral_accepted") return "Referral accepted";
                              return st.replace(/_/g, " ");
                            })()}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); openRequestChat(r); }}
                            className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
                            title="Message about this request"
                            aria-label={`Open conversation about ${r.patient_name}`}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => { 
                              setSelectedRequest(r); 
                              if (r.status === "referral_approved" && canSubmitClaimFor(r, hospital)) {
                                onProcessReferral?.(r);
                              } else if (r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)) {
                                onSubmitTreatmentPlan?.(r);
                              } else {
                                setIsReviewing(true); 
                              }
                            }}
                            className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
                          >
                            {r.status === "referral_approved" && canSubmitClaimFor(r, hospital)
                              ? "Accept Referral"
                              : r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)
                              ? "Submit Treatment"
                              : "View Items"}
                          </Button>
                          {isClaimEligible(r, hospital) && claimStatus && (
                            <Badge className="h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold border-transparent shadow-none">
                              Claim Submitted
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
      </Card>
      <div className="flex flex-col gap-3 md:hidden">
        {paginatedRequests.length === 0 ? (
          <div className="py-12 text-center text-xs font-bold uppercase tracking-widest text-slate-700 bg-white rounded-xl border border-slate-100 p-6">
            No authorization requests found.
          </div>
        ) : (
          paginatedRequests.map(r => {
            return (
              <Card key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-150" onClick={() => { 
                  setSelectedRequest(r); 
                  if (r.status === "referral_approved" && canSubmitClaimFor(r, hospital)) onProcessReferral?.(r);
                  else if (r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)) onSubmitTreatmentPlan?.(r);
                  else setIsReviewing(true); 
                }}>
                <CardContent className="p-4 flex flex-col gap-2">
                  {/* Row 1: Name + Status badge */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold normal-case leading-tight text-slate-900">{r.patient_name}</p>
                    <Badge className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border whitespace-nowrap shrink-0",
                      STATUS_BADGE[String(r.status || "").toLowerCase()] ?? STATUS_BADGE_DEFAULT
                    )}>
                      {(() => {
                        const st = String(r.status || "");
                        if (st === "referral_approved") return "REF APPROVED";
                        if (st === "partially_approved") return "PARTIAL";
                        if (st === "referral_accepted") return "REF ACCEPTED";
                        return st.replace(/_/g, " ");
                      })()}
                    </Badge>
                  </div>
  
                  {/* Row 2: Diagnosis, Date, Actions inline */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="text-xs text-slate-500 truncate">{r.diagnosis || "No diagnosis"}</p>
                      <span className="flex shrink-0 flex-col text-right overflow-hidden">
                        {(() => {
                          const { label, timestamp } = getAuthorizationListTimestamp(r);
                          return (
                            <>
                              <span className="whitespace-nowrap text-[10px] font-bold text-slate-600 tabular-nums">{formatNigeriaDate(timestamp)}</span>
                              <span className="mt-0.5 whitespace-nowrap font-sans text-[10px] font-medium text-slate-500 tabular-nums">
                                {formatNigeriaTime(timestamp)}
                              </span>
                              {label && (
                                <span className="truncate font-sans text-[9px] font-medium text-slate-400" title={`${label} at ${formatNigeriaTime(timestamp)}`}>
                                  {label}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </span>
                    </div>
  
                    <div className="flex items-center gap-2 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => { 
                          e.stopPropagation();
                          setSelectedRequest(r); 
                          if (r.status === "referral_approved" && canSubmitClaimFor(r, hospital)) {
                            onProcessReferral?.(r);
                          } else if (r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)) {
                            onSubmitTreatmentPlan?.(r);
                          } else {
                            setIsReviewing(true); 
                          }
                        }}
                        className="h-[26px] px-2.5 rounded-full bg-slate-100/80 text-slate-700 hover:bg-slate-200 text-[11px] font-bold flex items-center gap-1.5 border-none shadow-none"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-600" />
                        {r.status === "referral_approved" && canSubmitClaimFor(r, hospital)
                          ? "Process"
                          : r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)
                          ? "Submit"
                          : "View"}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={(e) => { e.stopPropagation(); openRequestChat(r); }}
                        className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-none transition-colors hover:bg-slate-50"
                        title="Message about this request"
                        aria-label={`Open conversation about ${r.patient_name}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
  
                  {/* Row 3: Referral info */}
                  {r.referred_hospital_id === hospital?.id && r.hospital_id !== hospital?.id ? (
                    <div className="mt-0.5">
                      <span className="inline-block max-w-full break-words whitespace-normal rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold leading-snug text-indigo-700">
                        📥 Inbound Referral from: {r.hospital_name || r.referring_hospital_name || "External Facility"}
                      </span>
                    </div>
                  ) : isReferralFor(r) ? (
                    <div className="mt-0.5">
                      <span className="inline-block max-w-full break-words whitespace-normal rounded bg-[#F5F3FF] px-1.5 py-0.5 text-[11px] font-medium leading-snug text-[#6D28D9]">
                        Referral To: {claimOwnerNameFor(r)}
                      </span>
                    </div>
                  ) : null}
                  
                  {/* Code row */}
                  {(r.authorization_code || r.deletion_status === "awaiting_admin_approval" || !r.authorization_code) && (
                    <div className="flex flex-col gap-1.5 mt-2 min-w-0" onClick={e => e.stopPropagation()}>
                      {isApproved(r) && !r.is_unlocked && !otpVerifiedStatus[r.id] ? (
                        unlockingReqId === r.id ? (
                          <div className="flex items-center gap-2 w-full">
                            <Input
                          autoFocus
                          value={unlockOtpInput}
                          onChange={e => setUnlockOtpInput(e.target.value.toUpperCase())}
                          placeholder="OTP"
                          className="h-8 w-20 text-xs font-mono font-bold px-2"
                        />
                            <Button size="sm" onClick={(e) => handleUnlockOtp(r, e)} className="h-9 px-3">Unlock</Button>
                            <Button variant="ghost" size="sm" onClick={() => setUnlockingReqId(null)} className="h-9 px-3 text-slate-400">Cancel</Button>
                          </div>
                        ) : (
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setUnlockingReqId(r.id); }} className="h-9 w-full text-sm border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold">
                            <><LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />Unlock authorization code</>
                          </Button>
                        )
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {r.deletion_status === "awaiting_admin_approval" ? (
                            <span className="text-[11px] font-black text-rose-700">Code Revoked</span>
                          ) : r.authorization_code ? (
                            <div className="flex items-center gap-1 min-w-0 w-full justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Auth Code</span>
                                <span className="text-sm font-black text-[#1D9E75] font-mono truncate">{r.authorization_code}</span>
                              </div>
                              <Button variant="ghost" size="icon" aria-label={`Copy authorization code for ${r.patient_name}`} title={`Copy authorization code for ${r.patient_name}`} onClick={(e) => { e.stopPropagation(); handleCopyAuth(r); }} className="h-8 w-8 shrink-0 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-[11px] font-black text-amber-600">PENDING</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                </CardContent>
              </Card>
            );
          })
        )}
        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} className="rounded-xl border border-slate-100" />
      </div>
    </>
  );
}
