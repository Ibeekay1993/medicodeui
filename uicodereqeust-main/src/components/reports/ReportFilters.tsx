import { Loader2, Download, Calendar, Activity, Filter, Building2, Check, ChevronsUpDown, FileSpreadsheet, FileBarChart2, Receipt } from "lucide-react";
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
  onExport: (mode: "detailed" | "full" | "payment_advice") => void;
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
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 md:flex-row md:items-center">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
          <Filter className="h-4 w-4 text-slate-600" />
        </div>
        <span className="text-sm font-semibold text-slate-800">Report filters</span>
      </div>

      <div className="flex w-full flex-col flex-wrap items-stretch justify-end gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
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
              className="h-10 w-full justify-between rounded-lg border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-none hover:bg-slate-50 md:w-[240px]"
            >
              <div className="flex items-center gap-2 truncate">
                <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                <span className="truncate">
                  {filters.hospitalFilter === "all"
                    ? "All Hospitals"
                    : hospitals.find((h) => h.id === filters.hospitalFilter)?.name || "Filter by Hospital"}
                </span>
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(18rem,calc(100vw-2rem))] rounded-lg border-slate-200 p-0 shadow-lg">
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
          <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-none hover:bg-slate-50 md:w-40">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <SelectValue placeholder="All Time" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200 shadow-lg">
            <SelectItem value="all" className="text-xs font-bold cursor-pointer rounded-lg">All Time</SelectItem>
            <SelectItem value="today" className="text-xs font-bold cursor-pointer rounded-lg">Today</SelectItem>
            <SelectItem value="7days" className="text-xs font-bold cursor-pointer rounded-lg">Last 7 Days</SelectItem>
            <SelectItem value="30days" className="text-xs font-bold cursor-pointer rounded-lg">Last 30 Days</SelectItem>
            <SelectItem value="this_month" className="text-xs font-bold cursor-pointer rounded-lg">This Month</SelectItem>
            <SelectItem value="last_month" className="text-xs font-bold cursor-pointer rounded-lg">Last Month</SelectItem>
            <SelectItem value="custom" className="text-xs font-bold cursor-pointer rounded-lg">Custom Range</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.statusFilter} onValueChange={(v) => onChange({ statusFilter: v })}>
          <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-none hover:bg-slate-50 md:w-40">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              <SelectValue placeholder="All Status" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200 shadow-lg">
            <SelectItem value="all" className="text-xs font-bold cursor-pointer rounded-lg">All Status</SelectItem>
            <SelectItem value="pending" className="text-xs font-bold cursor-pointer rounded-lg">Pending</SelectItem>
            <SelectItem value="pending_referral" className="text-xs font-bold cursor-pointer rounded-lg">Pending Referral</SelectItem>
            <SelectItem value="referral_approved" className="text-xs font-bold cursor-pointer rounded-lg">Referral Approved</SelectItem>
            <SelectItem value="referral_accepted" className="text-xs font-bold cursor-pointer rounded-lg">Referral Accepted</SelectItem>
            <SelectItem value="pending_authorization" className="text-xs font-bold cursor-pointer rounded-lg">Pending Authorization</SelectItem>
            <SelectItem value="approved" className="text-xs font-bold cursor-pointer rounded-lg text-emerald-600">Approved</SelectItem>
            <SelectItem value="partially_approved" className="text-xs font-bold cursor-pointer rounded-lg text-amber-600">Partially Approved</SelectItem>
            <SelectItem value="rejected" className="text-xs font-bold cursor-pointer rounded-lg text-rose-600">Rejected</SelectItem>
            <SelectItem value="referral_declined" className="text-xs font-bold cursor-pointer rounded-lg text-rose-600">Referral Declined</SelectItem>
            <SelectItem value="referral_expired" className="text-xs font-bold cursor-pointer rounded-lg text-rose-600">Referral Expired</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={isExporting}
              className="h-10 w-full rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 md:w-auto"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isExporting ? "Exporting…" : "Export report"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))] rounded-lg border-slate-200 p-2 shadow-lg">
            <DropdownMenuLabel className="px-2 text-xs font-semibold text-slate-500">Export options</DropdownMenuLabel>
            <DropdownMenuItem 
              onClick={() => onExport("payment_advice")}
              className="mb-1 flex cursor-pointer flex-col items-start gap-1 rounded-md border border-slate-200 bg-white p-3 transition-colors focus:bg-slate-50 group"
            >
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900">Payment Advice Schedule</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">Approved request details and provider totals</p>
            </DropdownMenuItem>

            <DropdownMenuItem 
              onClick={() => onExport("full")}
              className="flex cursor-pointer flex-col items-start gap-1 rounded-md p-3 transition-colors focus:bg-slate-50 group"
            >
              <div className="flex items-center gap-2">
                <FileBarChart2 className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-800">Premium Dashboard</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">Summary, trends, clinical detail, and payment advice</p>
            </DropdownMenuItem>
            
            <DropdownMenuItem 
              onClick={() => onExport("detailed")}
              className="mt-1 flex cursor-pointer flex-col items-start gap-1 rounded-md p-3 transition-colors focus:bg-slate-50 group"
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-800">Detailed data only</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">Raw data table with frozen headers and filters</p>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
