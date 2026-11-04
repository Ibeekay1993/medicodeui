import { Search, Loader2, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";

interface AuthorizationsHeaderProps {
  hospitalName?: string;
  hospitalCode?: string;
  search: string;
  setSearch: (val: string) => void;
  exportCSV: () => void;
  isExporting: boolean;
  loading: boolean;
  fullName?: string;
  statusFilter?: string;
  setStatusFilter?: (val: string) => void;
}

export default function AuthorizationsHeader({
  hospitalCode,
  search,
  setSearch,
  exportCSV,
  isExporting,
  loading,
  statusFilter = "all",
  setStatusFilter
}: AuthorizationsHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm sm:px-4 sm:py-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        {/* Title + Hospital Code: Clean, compact, no oversized icon */}
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">
            Authorizations Ledger
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
                {[
                  { id: "all", label: "All Status" },
                  { id: "pending", label: "Pending Review", dot: "bg-amber-500" },
                  { id: "pending_referral", label: "Pending Referral", dot: "bg-amber-500" },
                  { id: "referral_approved", label: "Referral Approved", dot: "bg-indigo-600" },
                  { id: "referral_accepted", label: "Referral Accepted", dot: "bg-blue-600" },
                  { id: "pending_authorization", label: "Pending Auth", dot: "bg-amber-500" },
                  { id: "approved", label: "Approved", dot: "bg-emerald-600" },
                  { id: "partially_approved", label: "Partially Approved", dot: "bg-sky-600" },
                  { id: "rejected", label: "Rejected", dot: "bg-rose-600" },
                ].map(filter => (
                  <SelectItem key={filter.id} value={filter.id} className="text-xs font-medium">
                    <span className="flex items-center gap-2">
                      {filter.dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${filter.dot}`} />}
                      {filter.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative flex-1 sm:w-52 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <Input 
              placeholder="Search code, patient..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-8 h-8.5 rounded-lg border-slate-200 text-xs font-medium w-full" 
              aria-label="Search authorizations ledger"
            />
          </div>

          <Button 
            onClick={exportCSV} 
            disabled={isExporting || loading} 
            size="sm"
            variant="outline"
            className="h-8.5 px-3 rounded-lg border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />} 
            CSV
          </Button>

          <Button
            onClick={() => navigate("/dashboard/new-request")}
            size="sm"
            className="h-8.5 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold gap-1.5 shrink-0 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            New Auth
          </Button>
        </div>
      </div>
    </div>
  );
}
