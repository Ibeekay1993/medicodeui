import { Building, Search, ListFilter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface ClaimsFilterHeaderProps {
  statusTab: "all" | "pending" | "approved" | "rejected" | "contested";
  setStatusTab: (tab: "all" | "pending" | "approved" | "rejected" | "contested") => void;
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
    <div className="pb-3 border-b border-slate-200 flex flex-wrap items-center justify-end gap-2">
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
        {/* Status Filter Dropdown */}
        <div className="w-full sm:w-44">
          <Select value={statusTab} onValueChange={(v: any) => setStatusTab(v)}>
            <SelectTrigger className="w-full h-8 text-xs font-semibold bg-slate-50 border-none rounded-lg">
              <ListFilter className="h-3 w-3 text-slate-400 mr-1.5 shrink-0" />
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-semibold">All Claims</SelectItem>
              <SelectItem value="pending" className="text-xs font-semibold">Pending Audits</SelectItem>
              <SelectItem value="approved" className="text-xs font-semibold">Approved</SelectItem>
              <SelectItem value="contested" className="text-xs font-semibold">Contested</SelectItem>
              <SelectItem value="rejected" className="text-xs font-semibold">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Hospital Filter Select */}
        <div className="w-full sm:w-44">
          <Select value={selectedHospitalId} onValueChange={setSelectedHospitalId}>
            <SelectTrigger className="w-full h-8 text-xs font-semibold bg-slate-50 border-none rounded-lg">
              <Building className="h-3 w-3 text-slate-400 mr-1.5 shrink-0" />
              <SelectValue placeholder="All Hospitals" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-semibold">All Hospitals</SelectItem>
              {uniqueHospitals.map(h => (
                <SelectItem key={h.id} value={h.id} className="text-xs font-semibold">{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-300" />
          <Input 
            placeholder="Search patient, policy, code..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="pl-9 h-8 rounded-lg bg-slate-50 border-none text-xs font-semibold w-full focus-visible:ring-1 focus-visible:ring-slate-300" 
          />
        </div>
      </div>
    </div>
  );
}
