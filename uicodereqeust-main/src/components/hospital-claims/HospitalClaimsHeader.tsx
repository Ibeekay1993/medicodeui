import { BrandSpinner } from "@/components/BrandSpinner";
import { Search, Download } from "lucide-react";
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
  hospitalCode,
  statusFilter = "all",
  setStatusFilter
}: HospitalClaimsHeaderProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Title + Hospital Code: Clean, compact, no oversized icon */}
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
            Claims Ledger
          </h1>
          {hospitalCode && (
            <Badge variant="outline" className="font-mono text-[10px] font-semibold bg-slate-50 text-slate-600 border-slate-200 px-1.5 py-0">
              {hospitalCode}
            </Badge>
          )}
        </div>

        {/* Action Controls: Compact, single-row on desktop */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-start lg:justify-end">
          {setStatusFilter && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8.5 w-full sm:w-36 rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-700">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                <SelectItem value="all" className="text-xs font-medium">All Status</SelectItem>
                <SelectItem value="submitted" className="text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    Submitted / Under Review
                  </span>
                </SelectItem>
                <SelectItem value="approved" className="text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                    Approved
                  </span>
                </SelectItem>
                <SelectItem value="partially_approved" className="text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-600 shrink-0" />
                    Partially Approved
                  </span>
                </SelectItem>
                <SelectItem value="paid" className="text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-700 shrink-0" />
                    Paid / Settled
                  </span>
                </SelectItem>
                <SelectItem value="contested" className="text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                    Contested
                  </span>
                </SelectItem>
                <SelectItem value="rejected" className="text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
                    Rejected
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="relative flex-1 sm:w-56 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="Search claims..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8.5 rounded-lg border-slate-200 text-xs font-medium w-full"
              aria-label="Search claims ledger"
            />
          </div>

          <Button
            onClick={exportCSV}
            disabled={isExporting || loading}
            size="sm"
            variant="outline"
            className="h-8.5 px-3 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
          >
            {isExporting ? <BrandSpinner className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
            Export CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
