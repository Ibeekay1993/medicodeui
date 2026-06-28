import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Search, Building } from "lucide-react";
import { cn } from "@/lib/utils";

interface Hospital {
  id: string;
  name: string;
}

interface HospitalSearchSelectProps {
  uniqueHospitals: Hospital[];
  selectedHospitalId: string;
  onHospitalChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

export function HospitalSearchSelect({
  uniqueHospitals,
  selectedHospitalId,
  onHospitalChange,
  className,
  placeholder = "All Hospitals"
}: HospitalSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const activeHospitalName = selectedHospitalId === "all" 
    ? placeholder 
    : uniqueHospitals.find(h => h.id === selectedHospitalId)?.name || placeholder;

  return (
    <div className={cn("relative w-full sm:w-64", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-8 flex items-center justify-between border-none rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Building className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="truncate">{activeHospitalName}</span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 sm:left-0 mt-1 w-full max-w-xs sm:w-80 rounded-xl border border-slate-100 bg-white/95 backdrop-blur-md shadow-lg p-2 z-50 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search hospital..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
              autoFocus
            />
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
            <button
              type="button"
              onClick={() => {
                onHospitalChange("all");
                setIsOpen(false);
                setSearchQuery("");
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 rounded-md transition-colors"
            >
              <span>{placeholder}</span>
              {selectedHospitalId === "all" && <Check className="h-3.5 w-3.5 text-[#3f3f95]" />}
            </button>
            {uniqueHospitals
              .filter(h => h.name.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    onHospitalChange(h.id);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
                >
                  <span className="truncate pr-2">{h.name}</span>
                  {selectedHospitalId === h.id && <Check className="h-3.5 w-3.5 text-[#3f3f95] shrink-0" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
