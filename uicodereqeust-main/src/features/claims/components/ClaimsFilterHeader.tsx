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
    <div className="premium-card bg-white/80 backdrop-blur-md p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 mb-2 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-black text-slate-900 tracking-tight">Claims Ledger</h2>
        <Tabs value={statusTab === 'pending' ? 'pending' : 'all'} onValueChange={(val: any) => setStatusTab(val)} className="w-auto hidden sm:block">
          <TabsList className="h-8 bg-slate-100 rounded-lg">
            <TabsTrigger value="pending" className="text-xs font-bold px-4 rounded-md">Action Needed</TabsTrigger>
            <TabsTrigger value="all" className="text-xs font-bold px-4 rounded-md">All Claims</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 w-full md:w-auto">
        {/* Status Filter Dropdown */}
        {statusTab !== 'pending' && (
        <div className="w-full sm:w-44">
          <Select value={statusTab} onValueChange={(v: any) => setStatusTab(v)}>
            <SelectTrigger className="w-full h-8 text-xs font-semibold bg-slate-50 border-none rounded-lg">
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
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
          <Input 
            placeholder="Search patient, policy, code..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="pl-9 h-8 rounded-lg bg-slate-50 border-none text-xs font-semibold w-full focus-visible:ring-1 focus-visible:ring-slate-300" 
            aria-label="Search patient, policy or code"
          />
        </div>
      </div>
    </div>
  );
}
