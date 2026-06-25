import { Search, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuthorizationsHeaderProps {
  hospitalName?: string;
  hospitalCode?: string;
  search: string;
  setSearch: (val: string) => void;
  exportCSV: () => void;
  isExporting: boolean;
  loading: boolean;
  fullName?: string;
}

export default function AuthorizationsHeader({
  hospitalName,
  hospitalCode,
  search,
  setSearch,
  exportCSV,
  isExporting,
  loading,
  fullName
}: AuthorizationsHeaderProps) {
  return (
    <div className="pb-3 border-b border-slate-200">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Hospital Authorizations</h1>
          <p className="text-xs text-slate-500">
            Facility: {hospitalName || fullName || "Loading..."} · {hospitalCode || "???"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
            <Input 
              placeholder="Search ledger..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              className="pl-8 h-8 rounded-lg bg-slate-50 border-none text-xs font-bold w-full" 
            />
          </div>
          <Button 
            onClick={exportCSV} 
            disabled={isExporting || loading} 
            className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm w-full sm:w-auto"
          >
            {isExporting ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Download className="h-3 w-3 mr-2" />} 
            Download CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
