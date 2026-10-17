import React from "react";
import { FolderOpen, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { cn } from "@/lib/utils";
import { ClaimDraft, money } from "@/lib/claims-helpers";
import { formatNigeriaDate, formatNigeriaTime } from "@/lib/authorizationTime";

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

const STATUS_PILL_STYLES: Record<string, string> = {
  approved: "bg-emerald-600 text-white border-transparent font-bold",
  partially_approved: "bg-sky-600 text-white border-transparent font-bold",
  paid: "bg-purple-600 text-white border-transparent font-bold",
  rejected: "bg-rose-600 text-white border-transparent font-bold",
  contested: "bg-orange-600 text-white border-transparent font-bold",
  under_contest: "bg-orange-600 text-white border-transparent font-bold",
  submitted: "bg-amber-500 text-white border-transparent font-bold",
  pending: "bg-amber-500 text-white border-transparent font-bold",
  under_review: "bg-blue-600 text-white border-transparent font-bold",
};

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
  setPage,
}: ClaimsTableProps) {
  const getStatusBadge = (status?: string) => {
    const s = String(status || "pending").toLowerCase();
    const style = STATUS_PILL_STYLES[s] || "border-slate-200 text-slate-700 bg-slate-50";
    
    let label = (status || "Pending").replace(/_/g, " ");
    if (s === "submitted") label = "Pending";
    else if (s === "partially_approved") label = "Partially Approved";
    else if (s === "under_contest") label = "Contested";

    return (
      <Badge
        variant="outline"
        className={cn(
          "inline-flex items-center justify-center w-[124px] h-[26px] whitespace-nowrap rounded-full px-2 text-[11px] font-semibold tracking-tight shadow-none border capitalize",
          style
        )}
      >
        {label}
      </Badge>
    );
  };

  return (
    <div className="w-full">
      <div className="space-y-4 min-w-0 w-full">
        <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto w-full">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead className="table-heading">
                <tr>
                  <th className="w-[170px] min-w-[170px] px-4 py-3">Date & Ref</th>
                  <th className="px-4 py-3 min-w-[220px]">Patient & Facility</th>
                  <th className="px-4 py-3 min-w-[200px]">Diagnosis & Auth</th>
                  <th className="px-4 py-3 w-[130px] text-right">Amount</th>
                  <th className="px-4 py-3 w-[140px] text-center">Status</th>
                  <th className="px-4 py-3 w-[90px] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedClaims.map((c) => {
                  const isSelected = selectedClaimId === c.id;
                  const hasApprovedAmount =
                    c.approved_amount !== undefined &&
                    c.approved_amount !== null &&
                    ["approved", "partially_approved", "paid"].includes(c.status);

                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedClaimId(c.id);
                        setIsMobileDetailOpen(true);
                      }}
                      className={cn(
                        "cursor-pointer text-sm transition-colors hover:bg-slate-50/70",
                        isSelected && "bg-slate-50"
                      )}
                    >
                      {/* Date & Ref */}
                      <td className="px-4 py-3 font-mono">
                        <div className="flex min-w-[138px] flex-col">
                          <span className="whitespace-nowrap tabular-nums text-xs font-semibold text-slate-700">
                            {formatNigeriaDate(c.created_at)}
                          </span>
                          <span className="mt-0.5 whitespace-nowrap text-[10px] font-medium leading-3 text-slate-500 truncate max-w-[140px]" title={c.claim_number}>
                            {c.claim_number}
                          </span>
                        </div>
                      </td>

                      {/* Patient & Facility */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col min-w-0 max-w-[260px]">
                          <span className="text-sm font-semibold normal-case leading-snug text-slate-950 truncate" title={c.patient_name}>
                            {c.patient_name}
                          </span>
                          <span className="mt-0.5 text-xs font-medium text-slate-500 leading-tight truncate" title={`${c.policy_number} · ${c.hospital_name}`}>
                            <span className="font-mono text-slate-600">{c.policy_number}</span>
                            <span className="mx-1 text-slate-300">·</span>
                            <span>{c.hospital_name}</span>
                          </span>
                        </div>
                      </td>

                      {/* Diagnosis & Auth */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col min-w-0 max-w-[230px]">
                          <span className="text-xs font-semibold text-slate-800 leading-snug truncate" title={c.diagnosis || "General Consultation"}>
                            {c.diagnosis || "General Consultation"}
                          </span>
                          <span className="mt-0.5 font-mono text-[11px] font-bold text-indigo-700 truncate" title={c.auth_code}>
                            Auth: {c.auth_code}
                          </span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                            {money(c.total_amount)}
                          </span>
                          {hasApprovedAmount && (
                            <span className="mt-0.5 font-mono text-[10px] font-semibold text-emerald-700 tabular-nums">
                              Payable: {money(c.approved_amount!)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {getStatusBadge(c.status)}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg shrink-0 gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClaimId(c.id);
                            setIsMobileDetailOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Review
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="lg:hidden p-2.5 space-y-2 bg-slate-50/60">
            {paginatedClaims.map((c) => {
              const statusColor =
                c.status === "approved"
                  ? "border-l-emerald-500"
                  : c.status === "partially_approved"
                  ? "border-l-sky-500"
                  : c.status === "paid"
                  ? "border-l-purple-500"
                  : c.status === "rejected"
                  ? "border-l-rose-500"
                  : "border-l-amber-500";

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedClaimId(c.id);
                    setIsMobileDetailOpen(true);
                  }}
                  className={cn(
                    "p-3 rounded-xl border border-slate-200/80 bg-white shadow-sm cursor-pointer transition-all duration-200 border-l-4 active:scale-[0.99]",
                    statusColor,
                    selectedClaimId === c.id ? "ring-2 ring-slate-400 bg-slate-50" : ""
                  )}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-950 uppercase tracking-tight leading-snug truncate">
                        {c.patient_name}
                      </p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5 tracking-tight font-mono truncate">
                        {c.policy_number} · Ref: {c.claim_number}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {getStatusBadge(c.status)}
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex justify-between items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-xs leading-tight truncate">
                        {c.diagnosis || "General Consultation"}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                        {c.hospital_name}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end">
                      <span className="text-[11px] font-bold text-indigo-700 leading-none font-mono">
                        Auth: {c.auth_code}
                      </span>
                      <span className="font-bold font-mono text-slate-900 text-sm mt-1 leading-none">
                        {money(c.total_amount)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredClaimsLength === 0 && (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-2">
              <FolderOpen className="h-8 w-8 text-slate-300" />
              <p className="text-xs font-semibold text-slate-400 tracking-wider">
                No claims match the search query
              </p>
            </div>
          )}
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
      </div>
    </div>
  );
}
