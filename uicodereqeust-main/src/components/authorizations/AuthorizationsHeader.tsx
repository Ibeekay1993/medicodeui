import { Search, Loader2, Download, ShieldCheck, Plus } from "lucide-react";
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
  hospitalName,
  hospitalCode,
  search,
  setSearch,
  exportCSV,
  isExporting,
  loading,
  fullName,
  statusFilter = "all",
  setStatusFilter
}: AuthorizationsHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight sm:text-lg">
                Authorizations Ledger
              </h1>
              {hospitalCode && (
                <Badge variant="outline" className="font-mono text-[10px] font-semibold bg-slate-50 text-slate-700 border-slate-200">
                  {hospitalCode}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {hospitalName || fullName || "Provider"} · Pre-authorizations, referrals & approved clinical care
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
                {[
                  { id: "all", label: "All Status" },
                  { id: "approved", label: "Approved" },
                  { id: "pending", label: "Pending Review" },
                  { id: "partially_approved", label: "Partially Approved" },
                  { id: "rejected", label: "Rejected" },
                  { id: "pending_referral", label: "Pending Referral" },
                  { id: "referral_approved", label: "Referral Approved" },
                  { id: "referral_accepted", label: "Referral Accepted" },
                  { id: "pending_authorization", label: "Pending Auth" },
                  { id: "referral_declined", label: "Referral Declined" },
                ].map(filter => (
                  <SelectItem key={filter.id} value={filter.id} className="text-xs font-semibold">
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <Input 
              placeholder="Search by code, patient, policy..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-8 h-9 rounded-lg border-slate-200 text-xs font-medium w-full" 
              aria-label="Search authorizations ledger"
            />
          </div>

          <Button 
            onClick={exportCSV} 
            disabled={isExporting || loading} 
            size="sm"
            variant="outline"
            className="h-9 px-3 rounded-lg border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 w-full sm:w-auto"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />} 
            CSV
          </Button>

          <Button
            onClick={() => navigate("/dashboard/new-request")}
            size="sm"
            className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold gap-1.5 w-full sm:w-auto shadow-sm"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            New Auth
          </Button>
        </div>
      </div>
    </div>
  );
}
