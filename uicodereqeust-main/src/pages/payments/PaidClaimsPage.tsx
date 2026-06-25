import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/claims-helpers";
import { Loader2, FolderOpen, Search, ChevronDown, Check, Calendar } from "lucide-react";

export default function PaidClaimsPage() {
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);
  const [isHospitalDropdownOpen, setIsHospitalDropdownOpen] = useState(false);
  const [hospitalSearchQuery, setHospitalSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [hospitalsList, setHospitalsList] = useState<{ id: string; name: string }[]>([]);

  // Load hospitals for dropdown filter
  useEffect(() => {
    const fetchHospitals = async () => {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id, name")
        .order("name");
      if (!error && data) {
        setHospitalsList(data);
      }
    };
    fetchHospitals();
  }, []);

  // Fetch paid claims
  const { data: claims, isLoading: isLoadingClaims } = useQuery({
    queryKey: ["paid-claims-list", selectedHospitalId, debouncedSearchTerm, selectedMonth, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("hospital_claims" as any)
        .select(`
          id,
          claim_number,
          patient_name,
          policy_number,
          hospital_name,
          hospital_id,
          total_amount,
          approved_amount,
          paid_at,
          created_at,
          status,
          payment_status
        `)
        .eq("status", "paid");

      if (selectedHospitalId !== "all") {
        query = query.eq("hospital_id", selectedHospitalId);
      }

      if (debouncedSearchTerm.trim()) {
        const term = `%${debouncedSearchTerm.trim()}%`;
        query = query.or(`patient_name.ilike.${term},claim_number.ilike.${term},policy_number.ilike.${term}`);
      }

      if (selectedMonth && selectedMonth !== "all") {
        query = query.like("paid_at", `${selectedMonth}%`);
      }

      if (startDate) {
        query = query.gte("paid_at", startDate);
      }
      if (endDate) {
        query = query.lte("paid_at", endDate);
      }

      const { data, error } = await query.order("paid_at", { ascending: false });

      if (error) throw error;
      return (data as any) || [];
    }
  });

  const handleHospitalChange = (val: string) => {
    setSelectedHospitalId(val);
  };

  if (isLoadingClaims) {
    return (
      <div className="flex h-64 flex-col gap-3 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Paid Claims...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          {/* Custom Searchable Hospital Dropdown */}
          <div className="relative w-full sm:w-64">
            <button
              type="button"
              onClick={() => setIsHospitalDropdownOpen(!isHospitalDropdownOpen)}
              className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
            >
              <span className="truncate">
                {selectedHospitalId === "all" 
                  ? "All Hospitals" 
                  : hospitalsList.find(h => h.id === selectedHospitalId)?.name || "All Hospitals"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-1.5" />
            </button>

            {isHospitalDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => {
                    setIsHospitalDropdownOpen(false);
                    setHospitalSearchQuery("");
                  }} 
                />
                <div className="absolute left-0 mt-1 w-full max-w-xs sm:w-80 rounded-xl border border-slate-100 bg-white/95 backdrop-blur-md shadow-lg p-2 z-20 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search hospital..."
                      value={hospitalSearchQuery}
                      onChange={(e) => setHospitalSearchQuery(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
                    <button
                      type="button"
                      onClick={() => {
                        handleHospitalChange("all");
                        setIsHospitalDropdownOpen(false);
                        setHospitalSearchQuery("");
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 rounded-md transition-colors"
                    >
                      <span>All Hospitals</span>
                      {selectedHospitalId === "all" && <Check className="h-3.5 w-3.5 text-[#3f3f95]" />}
                    </button>
                    {hospitalsList
                      .filter(h => h.name.toLowerCase().includes(hospitalSearchQuery.toLowerCase()))
                      .map(h => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => {
                            handleHospitalChange(h.id);
                            setIsHospitalDropdownOpen(false);
                            setHospitalSearchQuery("");
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
                        >
                          <span className="truncate">{h.name}</span>
                          {selectedHospitalId === h.id && <Check className="h-3.5 w-3.5 text-[#3f3f95]" />}
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <input 
            type="text" 
            placeholder="Search claim, patient or policy..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium w-full sm:w-64 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
            aria-label="Search paid claims"
          />

          {/* Month Filter */}
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <input
              type="month"
              value={selectedMonth === "all" ? "" : selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value || "all");
                setStartDate("");
                setEndDate("");
              }}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
              title="Filter by payment month"
            />
          </div>

          {/* Date Range Filters */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSelectedMonth("all");
              }}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
              placeholder="Start"
              title="Start Date"
            />
            <span className="text-xs text-slate-400 font-bold uppercase">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setSelectedMonth("all");
              }}
              className="border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
              placeholder="End"
              title="End Date"
            />
          </div>

          {/* Clear Filters Button */}
          {(selectedMonth !== "all" || startDate || endDate) && (
            <button
              onClick={() => {
                setSelectedMonth("all");
                setStartDate("");
                setEndDate("");
              }}
              className="text-xs font-black text-rose-500 hover:text-rose-600 uppercase tracking-wider h-8 px-2.5 rounded-lg"
            >
              Clear
            </button>
          )}
        </div>
        
        <div className="text-right shrink-0">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400">
            {(claims || []).length} Paid Claim(s)
          </span>
        </div>
      </div>

      {/* Table view */}
      <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto p-3">
          <table className="w-full text-left border-separate border-spacing-y-2 table-fixed min-w-[700px]">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[23%]" />
              <col className="w-[23%]" />
              <col className="w-[18%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead className="table-heading">
              <tr>
                <th className="px-3 py-1">Claim No.</th>
                <th className="px-3 py-1">Patient & Policy</th>
                <th className="px-3 py-1">Facility</th>
                <th className="px-3 py-1">Paid Date</th>
                <th className="px-3 py-1 text-right">Paid Amount</th>
                <th className="px-3 py-1 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(claims || []).map((c: any) => {
                const amt = Number(c.approved_amount || c.total_amount || 0);

                return (
                  <tr key={c.id} className="text-xs">
                    <td className="rounded-l-xl border-y border-l border-slate-100 bg-white px-3 py-3 font-mono font-bold text-slate-500 shadow-sm truncate">
                      {c.claim_number}
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 shadow-sm">
                      <div className="text-sm font-black text-slate-950 uppercase truncate leading-snug">{c.patient_name}</div>
                      <div className="text-xs font-bold text-slate-400 tracking-wider font-mono mt-0.5">{c.policy_number}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 shadow-sm">
                      <div className="font-semibold text-slate-700 truncate">{c.hospital_name}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 shadow-sm">
                      <div className="font-medium text-slate-800 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {c.paid_at ? new Date(c.paid_at).toLocaleDateString("en-GB") : new Date(c.created_at).toLocaleDateString("en-GB")}
                      </div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 font-black font-mono text-slate-950 text-right shadow-sm">
                      {money(amt)}
                    </td>
                    <td className="rounded-r-xl border-y border-r border-slate-100 bg-white px-3 py-3 text-center shadow-sm">
                      <Badge className="border-none bg-emerald-500/10 text-emerald-600 text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                        Paid
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(!claims || claims.length === 0) && (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <FolderOpen className="h-10 w-10 text-slate-300" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              No Paid Claims Found
            </p>
            <p className="text-xs font-bold text-slate-400 max-w-sm mt-0.5">
              Claims marked as paid in the batches view will automatically show up here.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
