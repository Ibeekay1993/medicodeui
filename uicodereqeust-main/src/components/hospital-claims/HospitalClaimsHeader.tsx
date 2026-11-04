import { Search, Download, Loader2, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface HospitalClaimsHeaderProps {
  search: string;
  setSearch: (value: string) => void;
  exportCSV: () => void;
  isExporting: boolean;
  loading: boolean;
  hospitalName?: string;
  hospitalCode?: string;
  statusFilter?: string;
  setStatusFilter?: (value: string) => void;
}

export default function HospitalClaimsHeader({
  search,
  setSearch,
  exportCSV,
  isExporting,
  loading,
  hospitalName,
  hospitalCode,
  statusFilter = "all",
  setStatusFilter
}: HospitalClaimsHeaderProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <Receipt className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight sm:text-lg">
                Hospital Claims Ledger
              </h1>
              {hospitalCode && (
                <Badge variant="outline" className="font-mono text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                  {hospitalCode}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {hospitalName ? `${hospitalName} · ` : ""}Payment audit, deduction reviews, and settlement history
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 w-full md:w-auto">
          {setStatusFilter && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-full sm:w-40 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-700">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="all" className="text-xs font-semibold">All Status</SelectItem>
                <SelectItem value="submitted" className="text-xs font-semibold">Submitted / Under Review</SelectItem>
                <SelectItem value="approved" className="text-xs font-semibold text-emerald-600">Approved</SelectItem>
                <SelectItem value="partially_approved" className="text-xs font-semibold text-amber-600">Partially Approved</SelectItem>
                <SelectItem value="paid" className="text-xs font-semibold text-emerald-700">Paid / Settled</SelectItem>
                <SelectItem value="contested" className="text-xs font-semibold text-purple-600">Contested</SelectItem>
                <SelectItem value="rejected" className="text-xs font-semibold text-rose-600">Rejected</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="Search claims..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 rounded-lg border-slate-200 text-xs font-medium w-full"
              aria-label="Search claims ledger"
            />
          </div>

          <Button
            onClick={exportCSV}
            disabled={isExporting || loading}
            size="sm"
            className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold w-full sm:w-auto shadow-sm"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
