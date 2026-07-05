import { FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { cn } from "@/lib/utils";
import { ClaimDraft, money } from "@/lib/claims-helpers";

interface ClaimsTableProps {
  paginatedClaims: ClaimDraft[];
  selectedClaimId: string | null;
  setSelectedClaimId: (id: string | null) => void;
  setIsMobileDetailOpen: (open: boolean) => void;
  filteredClaimsLength: number;
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
}

export default function ClaimsTable({
  paginatedClaims,
  selectedClaimId,
  setSelectedClaimId,
  setIsMobileDetailOpen,
  filteredClaimsLength,
  page,
  totalPages,
  start,
  end,
  total,
  pageSize,
  setPage
}: ClaimsTableProps) {
  return (
    <div className="w-full">
      <div className="space-y-4 min-w-0 w-full">
        <Card className="premium-card rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden transition-all duration-300">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto w-full bg-slate-50/70 p-3 rounded-xl">
            <table className="w-full min-w-0 text-left border-separate border-spacing-y-2 table-fixed">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="table-heading">
                <tr>
                  <th className="px-3 py-2">Claim No.</th>
                  <th className="px-3 py-2">Patient & Policy</th>
                  <th className="px-3 py-2">Diagnosis / Treatment</th>
                  <th className="px-3 py-2">Facility</th>
                  <th className="px-3 py-2">Matched Auth</th>
                  <th className="px-3 py-2 text-right">Requested</th>
                  <th className="px-3 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedClaims.map(c => (
                  <tr 
                    key={c.id} 
                    onClick={() => {
                      setSelectedClaimId(c.id);
                      setIsMobileDetailOpen(true);
                    }} 
                    className="group cursor-pointer text-xs transition-all"
                  >
                    <td className="rounded-l-xl border-y border-l border-slate-100 bg-white px-3 py-2.5 font-mono font-medium text-slate-500 shadow-sm group-hover:bg-slate-50/80 break-all whitespace-normal leading-snug" title={c.claim_number}>
                      {c.claim_number}
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-2.5 shadow-sm group-hover:bg-slate-50/80 break-words whitespace-normal leading-snug">
                      <div className="text-sm font-black text-slate-950 uppercase leading-snug break-words">{c.patient_name}</div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5 break-all">{c.policy_number}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-2.5 shadow-sm group-hover:bg-slate-50/80 break-words whitespace-normal leading-snug">
                      <div className="font-semibold text-slate-800 text-xs leading-snug break-words">{c.diagnosis || "Not Specified"}</div>
                      <div className="text-xs font-medium text-slate-500 mt-0.5 break-words">{c.approved_for || "No treatment details"}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-2.5 shadow-sm group-hover:bg-slate-50/80 break-words whitespace-normal leading-snug">
                      <div className="font-medium text-slate-700 text-xs break-words">{c.hospital_name}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-2.5 font-mono font-medium text-xs text-blue-600 shadow-sm group-hover:bg-slate-50/80 break-all whitespace-normal leading-snug" title={c.auth_code}>
                      {c.auth_code}
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-2.5 font-semibold font-mono text-slate-900 text-xs text-right shadow-sm group-hover:bg-slate-50/80 break-words whitespace-normal leading-snug" title={money(c.total_amount)}>
                      {money(c.total_amount)}
                    </td>
                    <td className="rounded-r-xl border-y border-r border-slate-100 bg-white px-3 py-2.5 text-center shadow-sm group-hover:bg-slate-50/80">
                      <Badge 
                        className={cn(
                          "border-none text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize",
                          c.status === "approved" ? "bg-emerald-500/10 text-emerald-600" :
                          c.status === "partially_approved" ? "bg-emerald-500/10 text-emerald-700" :
                          c.status === "paid" ? "bg-slate-100 text-slate-600" :
                          c.status === "rejected" ? "bg-rose-500/10 text-rose-600" :
                          "bg-amber-500/10 text-amber-600"
                        )}
                      >
                        {c.status === "submitted" ? "pending" : (c.status || "").replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="lg:hidden p-2 space-y-2 bg-slate-50/60">
            {paginatedClaims.map(c => {
              const statusColor = 
                c.status === "approved" ? "border-l-emerald-500 bg-emerald-500/[0.02]" :
                c.status === "partially_approved" ? "border-l-emerald-500 bg-emerald-500/[0.02]" :
                c.status === "paid" ? "border-l-slate-300 bg-slate-50/50" :
                c.status === "rejected" ? "border-l-rose-500 bg-rose-50/[0.02]" :
                "border-l-amber-500 bg-amber-500/[0.02]";
              
              return (
                <div 
                  key={c.id} 
                  onClick={() => {
                    setSelectedClaimId(c.id);
                    setIsMobileDetailOpen(true);
                  }} 
                  className={cn(
                    "p-2.5 rounded-xl border border-slate-100 bg-white shadow-sm cursor-pointer transition-all duration-200 border-l-4 active:scale-[0.99]",
                    statusColor,
                    selectedClaimId === c.id ? "ring-1 ring-slate-300 bg-slate-50" : ""
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-950 uppercase tracking-tight leading-none truncate">{c.patient_name}</p>
                      <p className="text-xs font-medium text-slate-500 mt-1 tracking-wider font-mono truncate">{c.policy_number} · {c.claim_number}</p>
                    </div>
                    <Badge 
                      className={cn(
                        "border-none text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 capitalize",
                        c.status === "approved" ? "bg-emerald-500/10 text-emerald-600" :
                        c.status === "partially_approved" ? "bg-emerald-500/10 text-emerald-700" :
                        c.status === "paid" ? "bg-slate-100 text-slate-600" :
                        c.status === "rejected" ? "bg-rose-500/10 text-rose-600" :
                        "bg-amber-500/10 text-amber-600"
                      )}
                    >
                      {c.status === "submitted" ? "pending" : (c.status || "").replace("_", " ")}
                    </Badge>
                  </div>
                  
                  <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-100 flex justify-between items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-700 text-xs leading-tight line-clamp-1">{c.diagnosis || "No Diagnosis"}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-1">{c.approved_for || c.hospital_name || "No treatment details"}</p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <span className="text-xs font-medium text-slate-500 leading-none font-mono tracking-tighter">Auth: {c.auth_code}</span>
                      <span className="font-bold font-mono text-slate-900 text-xs mt-0.5 leading-none">{money(c.total_amount)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredClaimsLength === 0 && (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
              <FolderOpen className="h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-400 tracking-wider">No claims match the search query</p>
            </div>
          )}
          <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
        </Card>
      </div>
    </div>
  );
}
