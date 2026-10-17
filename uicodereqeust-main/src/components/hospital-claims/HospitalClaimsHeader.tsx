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
    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">Hospital Claims Tracking</h1>
          <p className="text-xs font-semibold text-slate-500">Payment status for submitted claims</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              placeholder="Search claims..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-lg bg-white border-slate-200 text-sm font-medium"
              aria-label="Search claims ledger"
            />
          </div>
          <Button
            onClick={exportCSV}
            disabled={isExporting || loading}
            className="h-10 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-semibold w-full sm:w-auto"
          >
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download CSV
          </Button>
        </div>
      </div>
    );
}
