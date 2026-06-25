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
            <div className="md:hidden divide-y divide-slate-50">
              {paginatedClaims.map(c => (
                <div
                  key={c.id}
                  className="p-4 space-y-2 cursor-pointer transition-colors active:bg-slate-50"
                  onClick={() => onViewDetails(c.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-black uppercase text-slate-950 leading-tight">
                        {c.patient_name}
                      </p>
                      <p className="font-mono text-sm font-bold text-slate-500 mt-1">{c.claim_number}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-xs font-bold uppercase px-2 py-0.5 shrink-0 rounded-full", statusClass(c.status))}
                    >
                      {statusLabel(c.status)}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="font-mono font-bold text-emerald-600 text-sm">
                      ₦{Number(c.total_amount).toLocaleString()}
                    </p>
                    <span className="font-mono text-sm font-bold text-slate-500">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB") : "—"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails(c.id);
                    }}
                    className="w-full text-xs font-bold uppercase tracking-wider mt-1"
                  >
                    View Details
                  </Button>
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
