import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/claims-helpers";
import { Loader2, FolderOpen, AlertCircle, Search, ChevronDown, Check, Calendar } from "lucide-react";
import { CreateBatchModal } from "../components/CreateBatchModal";
import { MonthYearPicker } from "@/components/ui/MonthYearPicker";
import { useAwaitingPaymentClaims } from "../hooks/usePayments";

export default function AwaitingPaymentPage() {
  const { role } = useAuth();
  const { toast: _toast } = useToast();
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("all");
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isHospitalDropdownOpen, setIsHospitalDropdownOpen] = useState(false);
  const [hospitalSearchQuery, setHospitalSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const isViewOnly = role === "claims";
  const isFinance = role === "finance";

  // Fetch approved/partially_approved claims that have not been batched
  const { data: claims, isLoading: isLoadingClaims, refetch } = useAwaitingPaymentClaims();

  // Extract unique hospitals that actually have claims in the list that are ready for payment
  const uniqueHospitals = useMemo(() => {
    if (!claims) return [];
    
    const activeHospitalsMap = new Map<string, string>();
    claims.forEach(c => {
      const isReady = c.status === 'approved' || (
        c.status === 'partially_approved' && (
          c.payment_status === 'awaiting_payment' || 
          (c.contest_deadline && new Date(c.contest_deadline) < new Date())
        )
      );
      if (isReady && c.hospital_id && c.hospital_name) {
        activeHospitalsMap.set(c.hospital_id, c.hospital_name);
      }
    });

    return Array.from(activeHospitalsMap.entries()).map(([id, name]) => ({
      id,
      name
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [claims]);

  // Reset selected hospital if it is no longer in the active list
  useEffect(() => {
    if (selectedHospitalId !== "all" && uniqueHospitals.length > 0) {
      const exists = uniqueHospitals.some(h => h.id === selectedHospitalId);
      if (!exists) {
        setSelectedHospitalId("all");
        setSelectedClaims(new Set());
      }
    }
  }, [uniqueHospitals, selectedHospitalId]);

  // Filter claims based on selected hospital, search term, month, and date range
  const filteredClaims = useMemo(() => {
    if (!claims) return [];
    return claims.filter(c => {
      // Ready if approved, or partially_approved and contest_deadline has passed or payment_status is awaiting_payment
      const isReady = c.status === 'approved' || (
        c.status === 'partially_approved' && (
          c.payment_status === 'awaiting_payment' || 
          (c.contest_deadline && new Date(c.contest_deadline) < new Date())
        )
      );
      if (!isReady) return false;

      const matchesHospital = selectedHospitalId === "all" || c.hospital_id === selectedHospitalId;
      const matchesSearch = 
        c.claim_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.policy_number.toLowerCase().includes(searchTerm.toLowerCase());

      // Filter by month (approved_at)
      let matchesMonth = true;
      if (selectedMonth && c.approved_at) {
        const approvedMonth = c.approved_at.substring(0, 7); // "YYYY-MM"
        matchesMonth = approvedMonth === selectedMonth;
      }

      // Filter by date range (approved_at)
      let matchesDateRange = true;
      if (c.approved_at) {
        const approvedDateStr = c.approved_at.substring(0, 10); // "YYYY-MM-DD"
        if (startDate) {
          matchesDateRange = matchesDateRange && (approvedDateStr >= startDate);
        }
        if (endDate) {
          matchesDateRange = matchesDateRange && (approvedDateStr <= endDate);
        }
      }

      return matchesHospital && matchesSearch && matchesMonth && matchesDateRange;
    });
  }, [claims, selectedHospitalId, searchTerm, selectedMonth, startDate, endDate]);

  const toggleClaim = (claimId: string) => {
    if (isViewOnly) return;
    const newSelected = new Set(selectedClaims);
    if (newSelected.has(claimId)) {
      newSelected.delete(claimId);
    } else {
      newSelected.add(claimId);
    }
    setSelectedClaims(newSelected);
  };

  const toggleAll = () => {
    if (isViewOnly) return;
    if (selectedClaims.size === filteredClaims.length) {
      setSelectedClaims(new Set());
    } else {
      setSelectedClaims(new Set(filteredClaims.map(c => c.id)));
    }
  };

  const selectedClaimsList = useMemo(() => {
    if (!claims) return [];
    return claims.filter(c => selectedClaims.has(c.id));
  }, [claims, selectedClaims]);

  const totalAmountSelected = useMemo(() => {
    return selectedClaimsList.reduce((sum, c) => sum + Number(c.approved_amount || c.total_amount || 0), 0);
  }, [selectedClaimsList]);

  const handleHospitalChange = (val: string) => {
    setSelectedHospitalId(val);
    setSelectedClaims(new Set()); // Reset selections when hospital changes
  };

  if (isLoadingClaims) {
    return (
      <div className="flex h-64 flex-col gap-3 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Payments Queue...</p>
      </div>
    );
  }

  const activeHospitalName = selectedHospitalId === "all" 
    ? "" 
    : uniqueHospitals.find(h => h.id === selectedHospitalId)?.name || "";

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
                  : uniqueHospitals.find(h => h.id === selectedHospitalId)?.name || "All Hospitals"}
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
                    {uniqueHospitals
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
          />

          {/* Month Filter */}
          <MonthYearPicker
            value={selectedMonth}
            onChange={(val) => {
              setSelectedMonth(val);
              setStartDate("");
              setEndDate("");
              setSelectedClaims(new Set());
            }}
            className="w-full sm:w-48"
            id="awaiting-month-filter"
          />

          {/* Date Range Filters */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedMonth("");
                  setSelectedClaims(new Set());
                }}
                className="w-full border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
                aria-label="Start date filter"
              />
            </div>
            <span className="text-xs text-slate-400 font-bold uppercase px-1">to</span>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedMonth("");
                  setSelectedClaims(new Set());
                }}
                className="w-full border border-slate-200 rounded-lg pl-8 pr-2.5 py-2 text-xs font-semibold text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#3f3f95]"
                aria-label="End date filter"
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {(selectedMonth || startDate || endDate) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedMonth("");
                setStartDate("");
                setEndDate("");
                setSelectedClaims(new Set());
              }}
              className="text-xs font-black text-rose-500 hover:text-rose-600 uppercase tracking-wider h-8 px-2.5 rounded-lg"
            >
              Clear
            </Button>
          )}
        </div>
         
         <div className="text-right shrink-0">
           <span className="text-xs font-black uppercase tracking-wider text-slate-400">
             {isFinance
               ? `${filteredClaims.length} Payments Awaiting Settlement`
               : `${filteredClaims.length} Claim(s) Awaiting Payment`}
           </span>
         </div>
       </div>

{/* Warning/Selection Helper Banner */}
        {!isViewOnly && selectedHospitalId === "all" && filteredClaims.length > 0 && (
          <div className="flex items-center gap-2.5 bg-slate-50/50 border border-slate-200 p-3 rounded-xl">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs font-bold text-amber-700 leading-snug">
              To create a payment batch, select a specific hospital from the filter dropdown first. You can only batch claims for one hospital at a time.
            </p>
          </div>
        )}

        {/* Batching Controls Bar */}
        {!isViewOnly && selectedHospitalId !== "all" && filteredClaims.length > 0 && (
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <Checkbox 
                checked={selectedClaims.size === filteredClaims.length && filteredClaims.length > 0}
                onCheckedChange={toggleAll}
                className="border-slate-300 text-[#3f3f95] focus:ring-[#3f3f95]"
              />
              <span className="text-xs font-black text-slate-600 uppercase tracking-tight">
                {selectedClaims.size} selected
              </span>
            </div>

            <div className="flex items-center gap-3">
              {selectedClaims.size > 0 && (
                <span className="text-xs font-bold text-slate-900 mr-2">
                  Total Value: <span className="font-mono text-[#3f3f95] font-black">{money(totalAmountSelected)}</span>
                </span>
              )}
              <Button 
                onClick={() => setIsBatchModalOpen(true)}
                disabled={selectedClaims.size === 0}
                className="bg-[#3f3f95] hover:bg-[#34347d] text-white font-black uppercase text-xs tracking-wider h-8 rounded-lg transition-all shadow-sm shadow-[#3f3f95]/10 disabled:opacity-50"
              >
                Create Batch from Selected ({selectedClaims.size})
              </Button>
            </div>
          </div>
        )}

       {/* Table view */}
      <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto p-3">
          <table className="w-full text-left border-separate border-spacing-y-2 table-fixed min-w-[700px]">
            <colgroup>
              {!isViewOnly && selectedHospitalId !== "all" && <col className="w-[4%]" />}
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[18%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead className="table-heading">
              <tr>
                {!isViewOnly && selectedHospitalId !== "all" && <th className="px-3 py-1"></th>}
                <th className="px-3 py-1">Claim No.</th>
                <th className="px-3 py-1">Patient & Policy</th>
                <th className="px-3 py-1">Facility</th>
                <th className="px-3 py-1">Approved Date</th>
                <th className="px-3 py-1 text-right">Approved Amount</th>
                <th className="px-3 py-1 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredClaims.map(c => {
                const daysWaiting = Math.floor((Date.now() - new Date(c.approved_at || c.created_at).getTime()) / (1000 * 60 * 60 * 24));
                const amt = Number(c.approved_amount || c.total_amount || 0);

                return (
                  <tr 
                    key={c.id} 
                    onClick={() => !isViewOnly && selectedHospitalId !== "all" && toggleClaim(c.id)}
                    className={`group text-xs transition-all ${
                      !isViewOnly && selectedHospitalId !== "all" ? "cursor-pointer" : ""
                    }`}
                  >
                    {!isViewOnly && selectedHospitalId !== "all" && (
                      <td className="rounded-l-xl border-y border-l border-slate-100 bg-white px-3 py-3 shadow-sm group-hover:bg-slate-50/50">
                        <Checkbox 
                          checked={selectedClaims.has(c.id)}
                          onCheckedChange={() => toggleClaim(c.id)}
                          onClick={(e) => e.stopPropagation()} // Prevent double trigger
                          className="border-slate-300 text-[#3f3f95] focus:ring-[#3f3f95]"
                        />
                      </td>
                    )}
                    <td className={`border-y border-slate-100 bg-white px-3 py-3 font-mono font-bold text-slate-500 shadow-sm group-hover:bg-slate-50/50 truncate ${
                      isViewOnly || selectedHospitalId === "all" ? "rounded-l-xl border-l" : ""
                    }`}>
                      {c.claim_number}
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 shadow-sm group-hover:bg-slate-50/50">
                      <div className="text-sm font-black text-slate-950 uppercase truncate leading-snug">{c.patient_name}</div>
                      <div className="text-xs font-bold text-slate-400 tracking-wider font-mono mt-0.5">{c.policy_number}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 shadow-sm group-hover:bg-slate-50/50">
                      <div className="font-semibold text-slate-700 truncate">{c.hospital_name}</div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 shadow-sm group-hover:bg-slate-50/50">
                      <div className="font-mono text-sm font-bold text-slate-500">
                        {c.approved_at ? new Date(c.approved_at).toLocaleDateString("en-GB") : new Date(c.created_at).toLocaleDateString("en-GB")}
                      </div>
                      <div className="text-xs font-black text-rose-500 uppercase tracking-tight mt-0.5">
                        {daysWaiting === 0 ? "Approved Today" : `${daysWaiting} Day(s) Waiting`}
                      </div>
                    </td>
                    <td className="border-y border-slate-100 bg-white px-3 py-3 font-black font-mono text-slate-950 text-right shadow-sm group-hover:bg-slate-50/50">
                      {money(amt)}
                    </td>
                    <td className="rounded-r-xl border-y border-r border-slate-100 bg-white px-3 py-3 text-center shadow-sm group-hover:bg-slate-50/50">
                      <Badge 
                        className={`border-none text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          c.status === "approved" 
                            ? "bg-emerald-500/10 text-emerald-600" 
                            : "bg-blue-500/10 text-blue-700"
                        }`}
                      >
                        {c.status.replace("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredClaims.length === 0 && (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3">
            <FolderOpen className="h-10 w-10 text-slate-300" />
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              No Approved Claims Awaiting Payment
            </p>
            <p className="text-xs font-bold text-slate-400 max-w-sm mt-0.5">
              Claims approved by the auditing desk will automatically populate this dashboard.
            </p>
          </div>
        )}
      </Card>

      {/* Create Batch Modal */}
      {isBatchModalOpen && (
        <CreateBatchModal 
          isOpen={isBatchModalOpen}
          onOpenChange={setIsBatchModalOpen}
          selectedClaims={selectedClaimsList}
          hospitalId={selectedHospitalId}
          hospitalName={activeHospitalName}
          totalAmount={totalAmountSelected}
          onSuccess={() => {
            setSelectedClaims(new Set());
            refetch();
          }}
        />
      )}
    </div>
  );
}
