import { Copy, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { cn } from "@/lib/utils";
import {
  isReferralFor,
  claimOwnerNameFor,
  isRejected,
  rejectionReason,
  isClaimEligible,
  canSubmitClaimFor
} from "@/lib/authorizations-helpers";

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  approved: { bg: "bg-[#CCFBF1]", text: "text-[#0D9488]", border: "border-[#99F6E4]" },
  referral_approved: { bg: "bg-[#F1F5F9]", text: "text-[#64748B]", border: "border-[#E2E8F0]" },
  pending: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]", border: "border-[#FDE68A]" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]", border: "border-[#FECACA]" },
};

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
  setPage
}: AuthorizationsTableProps) {
  return (
    <>
      <Card className="hidden md:block rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="w-full">
          <table className="w-full text-left border-collapse">
            <thead className="table-heading">
              <tr>
                <th className="p-4">Date</th>
                <th className="py-4 pr-4">Patient</th>
                <th className="py-4 pr-4">Code</th>
                <th className="py-4 pr-4">Status</th>
                <th className="py-4 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedRequests.map(r => {
                const claimStatus = claimStatusFor(r);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                    <td className="p-4 font-mono font-bold text-slate-500">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-black text-slate-950 uppercase leading-snug">{r.patient_name}</p>
<p className="mt-1 text-xs font-semibold text-slate-500 leading-snug break-words whitespace-normal max-w-[300px]">{r.diagnosis}</p>
                      {isReferralFor(r) && (
                        <span className="mt-2 inline-flex rounded-md border border-[#3f3f95]/20 bg-[#3f3f95]/5 px-2 py-1 badge-label text-[#3f3f95] max-w-[240px]">
                          <span className="break-words whitespace-normal leading-snug">Referral To: {claimOwnerNameFor(r)}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <div className={cn("font-mono font-black text-sm max-w-[260px] flex items-start gap-1",
                        isRejected(r) 
                          ? "text-rose-700" 
                          : "text-slate-800"
                      )}>
                        <span className="break-words whitespace-normal leading-snug min-w-0 flex-1">
                          {r.deletion_status === "awaiting_admin_approval" 
                            ? "WITHDRAWN – Awaiting Delete" 
                            : r.authorization_code 
                              ? r.authorization_code 
                              : isRejected(r) 
                              ? (
                                <><span className="text-rose-600">Rejected</span><br /><span className="text-xs font-semibold text-rose-500">Reason: {rejectionReason(r) || "reason not recorded"}</span></>
                              )
                              : "PENDING"
                          }
                        </span>
                        {r.authorization_code && r.deletion_status !== "awaiting_admin_approval" && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={(e) => { e.stopPropagation(); handleCopyAuth(r); }} 
                            className="h-6 w-6 text-slate-400 hover:text-slate-600 shrink-0 mt-0.5"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge variant="outline" className={cn("px-2.5 py-0.5 rounded-full border badge-label", (() => {
                          const s = String(r.status || "").toLowerCase();
                          const map: Record<string, string> = {
                            approved: `${STATUS_COLORS.approved.bg} ${STATUS_COLORS.approved.text} ${STATUS_COLORS.approved.border}`,
                            referral_approved: `${STATUS_COLORS.referral_approved.bg} ${STATUS_COLORS.referral_approved.text} ${STATUS_COLORS.referral_approved.border}`,
                            pending: `${STATUS_COLORS.pending.bg} ${STATUS_COLORS.pending.text} ${STATUS_COLORS.pending.border}`,
                            rejected: `${STATUS_COLORS.rejected.bg} ${STATUS_COLORS.rejected.text} ${STATUS_COLORS.rejected.border}`,
                          };
                          return map[s] || "border-slate-200 text-slate-600 bg-slate-50";
                        })())}>
                          {(() => {
                            const st = String(r.status || "");
                            if (st === "referral_approved") return "REF APPROVED";
                            if (st === "referral_accepted") return "REF ACCEPTED";
                            return st.replace("_", " ");
                          })()}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={(e) => { e.stopPropagation(); openRequestChat(r); }}
                          className="h-8 w-8 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
                          title="Message about this request"
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
                          className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-black uppercase tracking-wider"
                        >
                          {r.status === "referral_approved" && canSubmitClaimFor(r, hospital)
                            ? "Process Referral"
                            : r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)
                            ? "Submit Treatment"
                            : "View Items"}
                        </Button>
                        {isClaimEligible(r, hospital) && claimStatus && (
                          <Badge variant="outline" className="h-8 px-2.5 rounded-lg border-emerald-200 text-emerald-700 bg-emerald-50 text-xs font-black uppercase tracking-wider">
                            Claim Submitted
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
      </Card>
      <div className="flex flex-col gap-3 md:hidden">
        {paginatedRequests.map(r => {
          const claimStatus = claimStatusFor(r);
          return (
            <Card key={r.id} className="rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-150" onClick={() => { 
                setSelectedRequest(r); 
                if (r.status === "referral_approved" && canSubmitClaimFor(r, hospital)) onProcessReferral?.(r);
                else if (r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)) onSubmitTreatmentPlan?.(r);
                else setIsReviewing(true); 
              }}>
              <CardContent className="p-4 space-y-2.5">
                {/* Header: Name + Status + Date */}
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="text-sm font-black uppercase leading-tight text-slate-950">{r.patient_name}</p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5 leading-snug line-clamp-2">{r.diagnosis}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={cn("rounded-full px-2.5 py-0.5 border badge-label text-xs font-bold", (() => {
                      const s = String(r.status || "").toLowerCase();
                      const map: Record<string, string> = {
                        approved: `${STATUS_COLORS.approved.bg} ${STATUS_COLORS.approved.text} ${STATUS_COLORS.approved.border}`,
                        referral_approved: `${STATUS_COLORS.referral_approved.bg} ${STATUS_COLORS.referral_approved.text} ${STATUS_COLORS.referral_approved.border}`,
                        pending: `${STATUS_COLORS.pending.bg} ${STATUS_COLORS.pending.text} ${STATUS_COLORS.pending.border}`,
                        rejected: `${STATUS_COLORS.rejected.bg} ${STATUS_COLORS.rejected.text} ${STATUS_COLORS.rejected.border}`,
                      };
                      return map[s] || "border-slate-200 text-slate-600 bg-slate-50";
                    })())}>
                      {(() => {
                        const st = String(r.status || "");
                        if (st === "referral_approved") return "REF APPROVED";
                        if (st === "referral_accepted") return "REF ACCEPTED";
                        return st.replace("_", " ");
                      })()}
                    </Badge>
                    <span className="text-xs font-mono font-bold text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString("en-GB") : "—"}</span>
                  </div>
                </div>

                {/* Referral badge inline */}
                {isReferralFor(r) && (
                  <span className="inline-flex items-center rounded-md border border-[#3f3f95]/20 bg-[#3f3f95]/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#3f3f95]">
                    Referral To: {claimOwnerNameFor(r)}
                  </span>
                )}

                {/* Code row */}
                <div className="flex items-center gap-1.5 min-w-0">
                  {r.deletion_status === "awaiting_admin_approval" ? (
                    <span className="text-xs font-black text-rose-700">Code Revoked</span>
                  ) : r.authorization_code ? (
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-400">Code:</span>
                      <span className="text-xs font-black text-[#1D9E75] font-mono truncate">{r.authorization_code}</span>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleCopyAuth(r); }} className="h-6 w-6 text-slate-400 hover:text-slate-600 shrink-0">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs font-black text-amber-600">PENDING</span>
                  )}
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 pt-0.5 border-t border-slate-100">
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
                    className="h-8 px-3.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider"
                  >
                    {r.status === "referral_approved" && canSubmitClaimFor(r, hospital)
                      ? "Process"
                      : r.status === "referral_accepted" && canSubmitClaimFor(r, hospital)
                      ? "Submit"
                      : "View"}
                  </Button>
                  {isClaimEligible(r, hospital) && (
                    claimStatus ? (
                      <Badge variant="outline" className="rounded-lg border-emerald-200 text-emerald-700 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold">
                        Claimed
                      </Badge>
                    ) : canSubmitClaimFor(r, hospital) ? null : (
                      <Badge variant="outline" className="rounded-lg border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-bold text-slate-500">
                        View Only
                      </Badge>
                    )
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={(e) => { e.stopPropagation(); openRequestChat(r); }}
                    className="h-7 w-7 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 shrink-0 ml-auto"
                    title="Message about this request"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} className="rounded-xl border border-slate-100" />
      </div>
    </>
  );
}
