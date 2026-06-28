import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { ClaimDraft } from "@/lib/claims-helpers";

interface HospitalClaimsTableProps {
  loading: boolean;
  filteredClaims: ClaimDraft[];
  paginatedClaims: ClaimDraft[];
  onViewDetails: (id: string) => void;
  statusClass: (status?: string | null) => string;
  statusLabel: (status?: string | null) => string;
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  pageSize: number;
  setPage: (page: number) => void;
}

export default function HospitalClaimsTable({
  loading,
  filteredClaims,
  paginatedClaims,
  onViewDetails,
  statusClass,
  statusLabel,
  page,
  totalPages,
  start,
  end,
  total,
  pageSize,
  setPage
}: HospitalClaimsTableProps) {
  return (
    <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-y-auto flex-1 p-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : filteredClaims.length === 0 ? (
          <div className="flex items-center justify-center h-64 flex-col gap-2">
            <Banknote className="h-12 w-12 text-slate-200" />
            <p className="text-xs font-bold text-slate-400 uppercase">No Claims Found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto w-full">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr>
                    <th className="table-heading p-4">Reference</th>
                    <th className="table-heading py-4 pr-4">Patient</th>
                    <th className="table-heading py-4 pr-4">Amount</th>
                    <th className="table-heading py-4 pr-4">Status</th>
                    <th className="table-heading py-4 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedClaims.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => onViewDetails(c.id)}
                      className="hover:bg-slate-50 transition-colors text-sm cursor-pointer"
                    >
                      <td className="p-4 font-mono text-sm font-bold text-slate-500">{c.claim_number}</td>
                      <td className="py-4 pr-4 text-sm font-black uppercase text-slate-950 leading-tight">
                        {c.patient_name}
                      </td>
                      <td className="py-4 pr-4 font-mono font-bold text-emerald-600 text-sm">
                        ₦{Number(c.total_amount).toLocaleString()}
                      </td>
                      <td className="py-4 pr-4">
                        <Badge
                          variant="outline"
                          className={cn("text-xs font-bold uppercase px-2.5 py-0.5 tracking-wider rounded-full", statusClass(c.status))}
                        >
                          {statusLabel(c.status)}
                        </Badge>
                      </td>
                      <td className="py-4 pr-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(c.id);
                          }}
                          className="text-xs font-bold uppercase tracking-wider"
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden flex flex-col gap-3 p-4">
              {paginatedClaims.map(c => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-150 p-4 flex flex-col gap-2"
                  onClick={() => onViewDetails(c.id)}
                >
                  {/* Row 1: Name + Status */}
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-bold uppercase leading-tight text-slate-900 flex-1 min-w-0 break-words">
                      {c.patient_name}
                    </p>
                    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0", (() => {
                      const s = String(c.status || "").toLowerCase();
                      const map: Record<string, string> = {
                        approved: "bg-emerald-50 text-emerald-600",
                        paid: "bg-emerald-50 text-emerald-600",
                        pending: "bg-amber-50 text-amber-600",
                        contested: "bg-violet-50 text-violet-600",
                        declined: "bg-rose-50 text-rose-600",
                        rejected: "bg-rose-50 text-rose-600",
                      };
                      return map[s] || "bg-slate-50 text-slate-500 border border-slate-200";
                    })())}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", (() => {
                        const s = String(c.status || "").toLowerCase();
                        const map: Record<string, string> = {
                          approved: "bg-emerald-500",
                          paid: "bg-emerald-500",
                          pending: "bg-amber-500",
                          contested: "bg-violet-500",
                          declined: "bg-rose-500",
                          rejected: "bg-rose-500",
                        };
                        return map[s] || "bg-slate-400";
                      })())} />
                      {statusLabel(c.status)}
                    </div>
                  </div>
                  
                  {/* Row 2: ID, Amount, Date, Button */}
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="font-mono text-xs font-bold text-slate-500 truncate">{c.claim_number}</p>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB") : "—"}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold text-emerald-600 text-[13px]">
                        ₦{Number(c.total_amount).toLocaleString()}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(c.id);
                        }}
                        className="h-7 px-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-[10px] font-black uppercase tracking-wider ml-1"
                      >
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <DataPagination
        page={page}
        totalPages={totalPages}
        start={start}
        end={end}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </Card>
  );
}
