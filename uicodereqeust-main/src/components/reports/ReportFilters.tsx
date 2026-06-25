import { Loader2, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterState } from "@/lib/reports-helpers";

interface ReportFiltersProps {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  hospitals: { id: string; name: string }[];
  loadingHospitals: boolean;
  onExport: () => void;
  isExporting: boolean;
}

export default function ReportFilters({
  filters,
  onChange,
  hospitals,
  loadingHospitals,
  onExport,
  isExporting,
}: ReportFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-end gap-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
      <div className="flex flex-col md:flex-row gap-2 items-center flex-wrap w-full md:w-auto justify-end">
        {filters.dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="h-8 w-32 rounded-lg bg-slate-50 border-none text-xs font-bold"
            />
            <span className="text-xs font-bold text-slate-400">to</span>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              className="h-8 w-32 rounded-lg bg-slate-50 border-none text-xs font-bold"
            />
          </div>
        )}

        <Select value={filters.hospitalFilter} onValueChange={(v) => onChange({ hospitalFilter: v })}>
          <SelectTrigger className="h-8 w-full md:w-52 rounded-lg bg-slate-50 border-none text-xs font-bold">
            <SelectValue placeholder="Filter by Hospital" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hospitals</SelectItem>
            {loadingHospitals ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 font-semibold">
                <Loader2 className="h-3 w-3 animate-spin text-[#93c34b]" />
                Loading...
              </div>
            ) : (
              hospitals.map((hospital) => (
                <SelectItem key={hospital.id} value={hospital.id}>
                  {hospital.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Select value={filters.dateFilter} onValueChange={(v) => onChange({ dateFilter: v })}>
          <SelectTrigger className="h-8 w-full md:w-32 rounded-lg bg-slate-50 border-none text-xs font-bold">
            <SelectValue placeholder="All Time" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.statusFilter} onValueChange={(v) => onChange({ statusFilter: v })}>
          <SelectTrigger className="h-8 w-full md:w-32 rounded-lg bg-slate-50 border-none text-xs font-bold">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="pending_referral">Pending Referral</SelectItem>
            <SelectItem value="referral_approved">Referral Approved</SelectItem>
            <SelectItem value="referral_accepted">Referral Accepted</SelectItem>
            <SelectItem value="pending_authorization">Pending Authorization</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="referral_declined">Referral Declined</SelectItem>
            <SelectItem value="referral_expired">Referral Expired</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={onExport}
          disabled={isExporting}
          className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm w-full md:w-auto"
        >
          {isExporting ? (
            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
          ) : (
            <Download className="h-3 w-3 mr-2" />
          )}
          {isExporting ? "Exporting Excel..." : "Download Excel Report"}
        </Button>
      </div>
    </div>
  );
}
