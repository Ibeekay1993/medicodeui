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
          <TabsList className="h-9 w-full bg-slate-100 rounded-lg sm:w-auto">
            <TabsTrigger value="pending" className="min-w-0 flex-1 text-xs font-bold px-2 rounded-md sm:flex-none sm:px-4">Action Needed</TabsTrigger>
            <TabsTrigger value="all" className="min-w-0 flex-1 text-xs font-bold px-2 rounded-md sm:flex-none sm:px-4">All Claims</TabsTrigger>
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
              <SelectItem value="all" className="text-xs font-semibold">All Status</SelectItem>
              <SelectItem value="submitted" className="text-xs font-semibold text-blue-600">Submitted</SelectItem>
              <SelectItem value="under_review" className="text-xs font-semibold text-amber-600">Under Review</SelectItem>
              <SelectItem value="approved" className="text-xs font-semibold text-emerald-600">Fully Approved</SelectItem>
              <SelectItem value="partially_approved" className="text-xs font-semibold text-emerald-700">Partially Approved</SelectItem>
              <SelectItem value="paid" className="text-xs font-semibold text-purple-600">Paid</SelectItem>
              <SelectItem value="contested" className="text-xs font-semibold text-orange-600">Contested</SelectItem>
              <SelectItem value="rejected" className="text-xs font-semibold text-rose-600">Rejected</SelectItem>
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
