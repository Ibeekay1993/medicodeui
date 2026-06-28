import { Search, Download, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface HospitalClaimsHeaderProps {
  search: string;
  setSearch: (value: string) => void;
  exportCSV: () => void;
  isExporting: boolean;
  loading: boolean;
}

export default function HospitalClaimsHeader({
  search,
  setSearch,
  exportCSV,
  isExporting,
  loading
}: HospitalClaimsHeaderProps) {
  return (
    <div className="premium-card bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Hospital Claims Tracking</h1>
          <p className="text-xs font-semibold text-slate-500">Payment status for submitted claims</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 w-full md:w-auto">
          <div className="relative w-48 sm:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
            <Input
              placeholder="Search claims..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 rounded-lg bg-slate-50 border-none text-xs font-bold"
              aria-label="Search claims ledger"
            />
          </div>
          <Button
            onClick={exportCSV}
            disabled={isExporting || loading}
            className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm w-full sm:w-auto"
          >
            {isExporting ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Download className="h-3 w-3 mr-2" />}
            Download Detailed Export
          </Button>
        </div>
      </div>
    </div>
  );
}
