import { Loader2, Download, Calendar, Activity, Filter, Building2, Check, ChevronsUpDown, FileSpreadsheet, FileBarChart2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FilterState } from "@/lib/reports-helpers";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ReportFiltersProps {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  hospitals: { id: string; name: string }[];
  loadingHospitals: boolean;
  onExport: (mode: "detailed" | "full") => void;
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
  const [openHospitalSelect, setOpenHospitalSelect] = useState(false);

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-slate-100 rounded-xl">
          <Filter className="w-4 h-4 text-slate-500" />
        </div>
        <span className="text-sm font-bold text-slate-700 tracking-tight">Report Filters</span>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-center flex-wrap w-full md:w-auto justify-end">
        {filters.dateFilter === "custom" && (
          <div className="flex items-center gap-2 bg-slate-50/80 p-1 rounded-xl border border-slate-100">
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChange({ startDate: e.target.value })}
              className="h-9 w-[130px] rounded-lg bg-white border-slate-200 text-xs font-bold shadow-sm focus:ring-emerald-500 transition-all cursor-pointer"
            />
            <span className="text-[10px] font-black uppercase text-slate-400 px-1">to</span>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChange({ endDate: e.target.value })}
              className="h-9 w-[130px] rounded-lg bg-white border-slate-200 text-xs font-bold shadow-sm focus:ring-emerald-500 transition-all cursor-pointer"
            />
          </div>
        )}

        <Popover open={openHospitalSelect} onOpenChange={setOpenHospitalSelect}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openHospitalSelect}
              className="h-10 w-full md:w-[280px] justify-between rounded-xl border-slate-200 bg-slate-50 hover:bg-slate-100/80 text-xs font-bold px-3 shadow-sm transition-all duration-200 group"
            >
              <div className="flex items-center gap-2 truncate">
                <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors shrink-0" />
                <span className="truncate">
                  {filters.hospitalFilter === "all"
                    ? "All Hospitals"
                    : hospitals.find((h) => h.id === filters.hospitalFilter)?.name || "Filter by Hospital"}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0 rounded-xl shadow-xl border-slate-100">
            <Command>
              <CommandInput placeholder="Search hospitals..." className="h-9 text-xs" />
              <CommandList>
                <CommandEmpty>No hospital found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      onChange({ hospitalFilter: "all" });
                      setOpenHospitalSelect(false);
                    }}
                    className="text-xs font-bold cursor-pointer rounded-lg"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        filters.hospitalFilter === "all" ? "opacity-100 text-emerald-600" : "opacity-0"
                      )}
                    />
                    All Hospitals
                  </CommandItem>
                  {loadingHospitals ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 font-semibold">
                      <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                      Loading...
                    </div>
                  ) : (
                    hospitals.map((hospital) => (
                      <CommandItem
                        key={hospital.id}
                        value={hospital.name}
                        onSelect={() => {
                          onChange({ hospitalFilter: hospital.id });
                          setOpenHospitalSelect(false);
                        }}
                        className="text-xs font-bold cursor-pointer rounded-lg"
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            filters.hospitalFilter === hospital.id ? "opacity-100 text-emerald-600" : "opacity-0"
                          )}
                        />
                        {hospital.name}
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Select value={filters.dateFilter} onValueChange={(v) => onChange({ dateFilter: v })}>
          <SelectTrigger className="h-10 w-full md:w-40 rounded-xl bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-xs font-bold shadow-sm transition-all duration-200 group">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              <SelectValue placeholder="All Time" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-100 shadow-xl">
            <SelectItem value="all" className="text-xs font-bold cursor-pointer rounded-lg">All Time</SelectItem>
            <SelectItem value="today" className="text-xs font-bold cursor-pointer rounded-lg">Today</SelectItem>
            <SelectItem value="7days" className="text-xs font-bold cursor-pointer rounded-lg">Last 7 Days</SelectItem>
            <SelectItem value="30days" className="text-xs font-bold cursor-pointer rounded-lg">Last 30 Days</SelectItem>
            <SelectItem value="custom" className="text-xs font-bold cursor-pointer rounded-lg">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.statusFilter} onValueChange={(v) => onChange({ statusFilter: v })}>
          <SelectTrigger className="h-10 w-full md:w-44 rounded-xl bg-slate-50 hover:bg-slate-100/80 border-slate-200 text-xs font-bold shadow-sm transition-all duration-200 group">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-500 transition-colors" />
              <SelectValue placeholder="All Status" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-100 shadow-xl">
            <SelectItem value="all" className="text-xs font-bold cursor-pointer rounded-lg">All Status</SelectItem>
            <SelectItem value="pending" className="text-xs font-bold cursor-pointer rounded-lg">Pending</SelectItem>
            <SelectItem value="pending_referral" className="text-xs font-bold cursor-pointer rounded-lg">Pending Referral</SelectItem>
            <SelectItem value="referral_approved" className="text-xs font-bold cursor-pointer rounded-lg">Referral Approved</SelectItem>
            <SelectItem value="referral_accepted" className="text-xs font-bold cursor-pointer rounded-lg">Referral Accepted</SelectItem>
            <SelectItem value="pending_authorization" className="text-xs font-bold cursor-pointer rounded-lg">Pending Authorization</SelectItem>
            <SelectItem value="approved" className="text-xs font-bold cursor-pointer rounded-lg text-emerald-600">Approved</SelectItem>
            <SelectItem value="rejected" className="text-xs font-bold cursor-pointer rounded-lg text-rose-600">Rejected</SelectItem>
            <SelectItem value="referral_declined" className="text-xs font-bold cursor-pointer rounded-lg text-rose-600">Referral Declined</SelectItem>
            <SelectItem value="referral_expired" className="text-xs font-bold cursor-pointer rounded-lg text-rose-600">Referral Expired</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={isExporting}
              className="h-10 px-5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-black tracking-wider shadow-md hover:shadow-lg transition-all duration-300 w-full md:w-auto"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isExporting ? "EXPORTING..." : "EXPORT REPORT"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl shadow-2xl border-slate-100 p-2">
            <DropdownMenuLabel className="text-xs font-bold text-slate-500 uppercase tracking-wider px-2">Export Options</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-100 my-2" />
            <DropdownMenuItem 
              onClick={() => onExport("full")}
              className="flex flex-col items-start gap-1 p-3 cursor-pointer rounded-lg focus:bg-emerald-50 group transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileBarChart2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-bold text-slate-800 group-hover:text-emerald-700">Premium Dashboard</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Full 5-sheet interactive executive analysis</p>
            </DropdownMenuItem>
            
            <DropdownMenuItem 
              onClick={() => onExport("detailed")}
              className="flex flex-col items-start gap-1 p-3 cursor-pointer rounded-lg focus:bg-slate-100 group transition-colors mt-1"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-slate-500 group-hover:text-slate-700" />
                <span className="text-sm font-bold text-slate-700 group-hover:text-slate-800">Detailed Data Only</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Raw data table with frozen headers and filters</p>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
