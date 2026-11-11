import { BrandSpinner } from "@/components/BrandSpinner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banknote, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { ClaimDraft } from "@/lib/claims-helpers";

// Solid pill colours — matches Utilization Officer / RequestList badge style
const CLAIM_STATUS_SOLID: Record<string, string> = {
  submitted:          "bg-amber-500   text-white border-transparent",
  pending:            "bg-amber-500   text-white border-transparent",
  under_review:       "bg-sky-500     text-white border-transparent",
  approved:           "bg-emerald-600 text-white border-transparent",
  partially_approved: "bg-sky-600     text-white border-transparent",
  paid:               "bg-emerald-700 text-white border-transparent",
  rejected:           "bg-rose-600    text-white border-transparent",
  declined:           "bg-rose-600    text-white border-transparent",
  denied:             "bg-rose-600    text-white border-transparent",
  contested:          "bg-blue-600    text-white border-transparent",
  under_contest:      "bg-blue-600    text-white border-transparent",
  adjusted:           "bg-sky-600     text-white border-transparent",
};
const solidClaimBadge = (status?: string | null) =>
  CLAIM_STATUS_SOLID[String(status || "").toLowerCase()] ?? "bg-slate-500 text-white border-transparent";

interface HospitalClaimsTableProps {
  loading: boolean;
  filteredClaims: ClaimDraft[];
  paginatedClaims: ClaimDraft[];
  onViewDetails: (id: string) => void;
  statusClass?: (status?: string | null) => string;
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
    <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-y-auto flex-1 p-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <BrandSpinner className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-xs font-semibold text-slate-500">Loading claims ledger…</span>
          </div>
        ) : filteredClaims.length === 0 ? (
          <div className="flex items-center justify-center py-20 flex-col gap-2">
            <Banknote className="h-10 w-10 text-slate-400" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">No Claims Found</p>
            <p className="text-xs font-medium text-slate-600">Claims submitted from approved authorizations will appear here.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto w-full">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Claim Reference</th>
                    <th className="py-3 pr-4">Patient &amp; Policy</th>
                    <th className="py-3 pr-4">Submitted Amount</th>
                    <th className="py-3 pr-4">Approved Amount</th>
                    <th className="py-3 pr-4">Audit Status</th>
                    <th className="py-3 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedClaims.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => onViewDetails(c.id)}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">
                        <span className="group-hover:text-emerald-700 transition-colors">
                          {c.claim_number}
                        </span>
                        <div className="text-[10px] font-sans font-medium text-slate-600 mt-0.5">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-sm font-semibold text-slate-900 leading-tight">
                          {c.patient_name}
                        </p>
                        <p className="text-[11px] font-mono font-medium text-slate-700 mt-0.5">
                          {c.policy_number || "—"} {c.auth_code ? `· Auth: ${c.auth_code}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-4 font-mono font-bold text-slate-900 text-sm tabular-nums">
                        &#8358;{Number(c.total_amount || 0).toLocaleString("en-NG")}
                      </td>
                      <td className="py-3 pr-4 font-mono font-bold text-emerald-600 text-sm tabular-nums">
                        {c.approved_amount !== null && c.approved_amount !== undefined
                          ? `\u20a6${Number(c.approved_amount).toLocaleString("en-NG")}`
                          : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          className={cn(
                            "text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shadow-none capitalize",
                            solidClaimBadge(c.status)
                          )}
                        >
                          {statusLabel(c.status)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDetails(c.id);
                          }}
                          className="h-8 px-3 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-none"
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
            <div className="md:hidden flex flex-col gap-2.5 p-3 sm:p-4">
              {paginatedClaims.map(c => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden cursor-pointer active:scale-[0.98] transition-all p-3.5 flex flex-col gap-2"
                  onClick={() => onViewDetails(c.id)}
                >
                  {/* Row 1: Patient Name + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 leading-tight truncate">
                        {c.patient_name}
                      </p>
                      <p className="font-mono text-[11px] font-semibold text-slate-700 mt-0.5">
                        {c.claim_number}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 border capitalize",
                        solidClaimBadge(c.status)
                      )}
                    >
                      {statusLabel(c.status)}
                    </Badge>
                  </div>

                  {/* Row 2: Amount, Date, Button */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600">Total Claim</span>
                      <p className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                        &#8358;{Number(c.total_amount || 0).toLocaleString("en-NG")}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(c.id);
                        }}
                        className="h-7 px-2.5 rounded-lg border-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        Details
                        <ArrowRight className="ml-1 h-3 w-3" />
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
