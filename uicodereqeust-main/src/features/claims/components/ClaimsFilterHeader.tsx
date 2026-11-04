import { Building, Search, ListFilter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HospitalSearchSelect } from "@/components/ui/HospitalSearchSelect";


interface ClaimsFilterHeaderProps {
  statusTab: string;
  setStatusTab: (tab: string) => void;
  selectedHospitalId: string;
  setSelectedHospitalId: (id: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  uniqueHospitals: { id: string; name: string }[];
}

export default function ClaimsFilterHeader({
  statusTab,
  setStatusTab,
  selectedHospitalId,
  setSelectedHospitalId,
  searchTerm,
  setSearchTerm,
  uniqueHospitals
}: ClaimsFilterHeaderProps) {
  return (
    <div className="relative z-10 mb-2 flex flex-col items-stretch justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center">
      <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
        <h2 className="text-lg font-black text-slate-900 tracking-tight">Claims Ledger</h2>
        <Tabs value={statusTab === 'pending' ? 'pending' : 'all'} onValueChange={(val: any) => setStatusTab(val)} className="w-full sm:w-auto">
          <TabsList className="h-9 sm:h-10 w-full bg-slate-100 rounded-lg p-1 gap-1 sm:w-auto">
            <TabsTrigger value="pending" className="h-full min-h-0 min-w-0 flex-1 whitespace-nowrap rounded-md px-2 py-0 text-xs font-bold text-slate-600 transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-200/70 active:bg-slate-200 sm:flex-none sm:px-4">Action Needed</TabsTrigger>
            <TabsTrigger value="all" className="h-full min-h-0 min-w-0 flex-1 whitespace-nowrap rounded-md px-2 py-0 text-xs font-bold text-slate-600 transition-colors data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-200/70 active:bg-slate-200 sm:flex-none sm:px-4">All Claims</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 w-full md:w-auto">
        {/* Status Filter Dropdown */}
        {statusTab !== 'pending' && (
        <div className="w-full sm:w-44">
          <Select value={statusTab} onValueChange={(v: any) => setStatusTab(v)}>
            <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 bg-white text-sm font-medium">
              <ListFilter className="h-3 w-3 text-slate-400 mr-1.5 shrink-0" />
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-medium">All Status</SelectItem>
              <SelectItem value="submitted" className="text-xs font-medium">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                  Submitted
                </span>
              </SelectItem>
              <SelectItem value="under_review" className="text-xs font-medium">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
                  Under Review
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
                  Paid
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
        </div>
        )}

        {/* Hospital Filter Select */}
        <HospitalSearchSelect
          uniqueHospitals={uniqueHospitals}
          selectedHospitalId={selectedHospitalId}
          onHospitalChange={setSelectedHospitalId}
          className="w-full sm:w-44"
        />

        {/* Search Input */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input 
            placeholder="Search patient, policy, code..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="h-10 w-full rounded-lg border-slate-200 bg-white pl-9 text-sm font-medium focus-visible:ring-1 focus-visible:ring-slate-300"
            aria-label="Search patient, policy or code"
          />
        </div>
      </div>
    </div>
  );
}
