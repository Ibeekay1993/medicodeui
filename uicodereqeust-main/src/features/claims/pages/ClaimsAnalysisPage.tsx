import { useCallback, useMemo, useState } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { useClaimsAnalysisQuery } from "../hooks/useClaimsAnalysis";
import { HospitalClaimSummary } from "../types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { DataPagination } from "@/components/dashboard/DataPagination";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  Wallet,
  XCircle
} from "lucide-react";

function money(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function normalizeStatus(status?: string | null) {
  return String(status || "pending").toLowerCase().replace(/\s+/g, "_");
}

function statusBucket(status?: string | null): "pending" | "approved" | "rejected" | "contested" | "other" {
  const normalized = normalizeStatus(status);
  if (["submitted", "pending", "under_investigation", "under_review", "pending_audit", "audit"].includes(normalized)) return "pending";
  if (normalized === "approved") return "approved";
  if (["contested", "paid"].includes(normalized)) return "contested";
  if (["rejected", "declined", "denied"].includes(normalized)) return "rejected";
  return "other";
}

export default function ClaimsAnalysisPage() {
  const { toast } = useToast();
  const [openHospitalSelect, setOpenHospitalSelect] = useState(false);
  const [selectedHospitalKey, setSelectedHospitalKey] = useState("all");

  const { data: claims = [], isLoading: loading, refetch: refresh, isError } = useClaimsAnalysisQuery();

  if (isError) {
    toast({
      variant: "destructive",
      title: "Unable to load claims analysis",
      description: "Please refresh and try again."
    });
  }

  useTabVisibilityRefresh(refresh as () => void);

  const analysis = useMemo(() => {
    const summary = claims || { by_status: [], by_hospital: [], by_date: [] };
    const base = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      contested: 0,
      other: 0,
      totalValue: 0,
      approvedValue: 0,
      rejectedValue: 0,
      contestedValue: 0
    };

    (summary.by_status || []).forEach((row: any) => {
      const count = Number(row.count || 0);
      const amount = Number(row.total_amount || 0);
      const bucket = statusBucket(row.status);
      
      base.total += count;
      base.totalValue += amount;
      (base as any)[bucket] += count;
      if (bucket === "approved") base.approvedValue += amount;
      if (bucket === "rejected") base.rejectedValue += amount;
      if (bucket === "contested") base.contestedValue += amount;
    });

    const hospitals = (summary.by_hospital || []).map((h: any) => {
      // In a real RPC we'd want to group by bucket, but since we simplified the RPC to just count and total_amount:
      return {
        key: h.hospital_id || h.hospital_name || "unknown",
        name: h.hospital_name || "Unknown Hospital",
        total: Number(h.count || 0),
        pending: 0, // This simplification means we'll just show the total value correctly but not per-bucket counts
        approved: 0,
        rejected: 0,
        contested: 0,
        other: 0,
        value: Number(h.total_amount || 0),
        approvedValue: 0,
        contestedValue: 0,
        latest: new Date().toISOString() // Or from RPC
      };
    }).sort((a: any, b: any) => b.total - a.total || a.name.localeCompare(b.name));

    const volume = (summary.by_date || []).map((d: any) => [
      new Date(d.claim_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      Number(d.count || 0)
    ]).reverse();

    return { ...base, hospitals, volume };
  }, [claims]);

  const selectedHospital = analysis.hospitals.find((hospital) => hospital.key === selectedHospitalKey) || null;
  
  // Since we use the RPC, the global stats are already computed. If a specific hospital is selected, 
  // we would ideally re-fetch or use hospital-specific buckets. 
  // For now, if "all" is selected, we use global stats. If a specific hospital is selected, 
  // we just use its total value since the simplified RPC doesn't break down status by hospital.
  const isAll = selectedHospitalKey === "all";
  const summary = claims || { by_status: [], by_hospital: [], by_date: [] };

  const paymentReadyValue = isAll 
    ? (summary.by_status || [])
        .filter((row: any) => ["approved", "partially_approved"].includes(normalizeStatus(row.status)))
        .reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0)
    : 0;

  const pendingAuditValue = isAll
    ? (summary.by_status || [])
        .filter((row: any) => statusBucket(row.status) === "pending")
        .reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0)
    : 0;

  const filteredHospitals = analysis.hospitals.filter((hospital) => {
    return selectedHospitalKey === "all" || hospital.key === selectedHospitalKey;
  });
  const {
    page,
    setPage,
    pageSize,
    totalPages,
    pageItems: paginatedHospitals,
    start,
    end,
    total
  } = useDataPagination(filteredHospitals);

  const maxVolume = Math.max(1, ...analysis.volume.map(([, count]) => count as number));

  const stats = useMemo(() => {
    const base = {
      pending: 0,
      approved: 0,
      rejected: 0,
      contested: 0,
      pendingValue: 0,
      approvedValue: 0,
      rejectedValue: 0,
      contestedValue: 0
    };

    if (!isAll) {
      // With the simple RPC, we only have totals for single hospitals
      base.pendingValue = 0;
      return base;
    }

    (summary.by_status || []).forEach((row: any) => {
      const count = Number(row.count || 0);
      const amount = Number(row.total_amount || 0);
      const bucket = statusBucket(row.status);
      
      if (bucket in base) {
        (base as any)[bucket] += count;
      }
      if (bucket === "pending") base.pendingValue += amount;
      if (bucket === "approved") base.approvedValue += amount;
      if (bucket === "rejected") base.rejectedValue += amount;
      if (bucket === "contested") base.contestedValue += amount;
    });

    return base;
  }, [summary, isAll]);

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="text-xs font-semibold text-slate-500">Loading Claims Analysis...</p>
      </div>
    );
  }


  const metrics = [
    {
      label: "Pending Audits",
      count: stats.pending,
      value: money(stats.pendingValue),
      icon: AlertCircle,
      borderColor: "border-l-amber-500",
      iconBg: "bg-slate-50/70 text-amber-600 border border-slate-100"
    },
    {
      label: "Approved",
      count: stats.approved,
      value: money(stats.approvedValue),
      icon: CheckCircle2,
      borderColor: "border-l-emerald-500",
      iconBg: "bg-slate-50/70 text-emerald-600 border border-slate-100"
    },
    {
      label: "Rejected",
      count: stats.rejected,
      value: money(stats.rejectedValue),
      icon: XCircle,
      borderColor: "border-l-rose-500",
      iconBg: "bg-slate-50/70 text-rose-600 border border-slate-100"
    },
    {
      label: "Contested",
      count: stats.contested,
      value: money(stats.contestedValue),
      icon: Wallet,
      borderColor: "border-l-blue-500",
      iconBg: "bg-slate-50/70 text-blue-600 border border-slate-100"
    }
  ];

  return (
    <div className="space-y-4 pb-10 animate-in fade-in duration-500">
      <div className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-end gap-2">
        <Popover open={openHospitalSelect} onOpenChange={setOpenHospitalSelect}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openHospitalSelect}
              className="h-9 w-[280px] justify-between rounded-xl border-slate-200/80 bg-white/70 backdrop-blur-md text-xs font-semibold px-3 shadow-sm hover:border-emerald-500/50 hover:bg-white transition-all"
            >
              <div className="truncate text-left flex-1">
                {selectedHospitalKey === "all" 
                  ? "All Hospitals" 
                  : analysis.hospitals.find((h) => h.key === selectedHospitalKey)?.name || "Select hospital..."}
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0 rounded-xl shadow-md border-slate-100">
            <Command>
              <CommandInput placeholder="Search hospitals..." className="h-9 text-xs" />
              <CommandList>
                <CommandEmpty>No hospital found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      setSelectedHospitalKey("all");
                      setOpenHospitalSelect(false);
                    }}
                    className="text-xs font-semibold cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedHospitalKey === "all" ? "opacity-100" : "opacity-0"
                      )}
                    />
                    All Hospitals
                  </CommandItem>
                  {analysis.hospitals.map((hospital) => (
                    <CommandItem
                      key={hospital.key}
                      value={hospital.name}
                      onSelect={() => {
                        setSelectedHospitalKey(hospital.key);
                        setOpenHospitalSelect(false);
                      }}
                      className="text-xs font-semibold cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedHospitalKey === hospital.key ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {hospital.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button 
          onClick={refresh} 
          variant="outline" 
          size="icon" 
          className="h-9 w-9 shrink-0 rounded-xl border-slate-200/80 bg-white/70 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 shadow-sm transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {selectedHospital && (
        <div className="premium-card p-3 sm:p-4 animate-in slide-in-from-top-2 duration-300">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2 flex flex-col justify-center">
              <span className="text-[8px] sm:text-xs font-bold uppercase tracking-widest text-emerald-600/80">Selected Partner</span>
              <p className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-tight mt-0.5">{selectedHospital.name}</p>
              <div className="mt-1 flex items-center gap-1.5 text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] sm:text-xs font-medium">Latest claim: {new Date(selectedHospital.latest).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-center sm:text-left">
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500">Pending Audit</span>
              <p className="mt-0.5 font-mono text-xs sm:text-sm font-extrabold text-amber-600">{money(pendingAuditValue)}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-center sm:text-left">
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500">Ready for Payment</span>
              <p className="mt-0.5 font-mono text-xs sm:text-sm font-extrabold text-emerald-600">{money(paymentReadyValue)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="premium-card p-3 sm:p-5 flex items-center gap-3 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 group" title={metric.label}>
            <div className={cn("hidden sm:flex h-10 w-10 md:h-12 md:w-12 rounded-xl items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110", metric.iconBg)}>
              <metric.icon className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 truncate leading-tight group-hover:text-slate-500 transition-colors">{metric.label}</p>
              <p className="text-sm sm:text-lg lg:text-xl font-black tracking-tight truncate leading-none text-slate-900 mt-1 sm:mt-1.5">
                {metric.count} <span className="text-[10px] sm:text-xs text-slate-400 font-normal ml-1 tracking-normal">{metric.value}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4">
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
            <div className="min-w-0">
              <CardTitle className="text-sm font-bold text-slate-800 tracking-tight">Volume Performance</CardTitle>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">Recent claim volume by day</p>
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Claims</span>
                <p className="font-mono text-lg font-extrabold text-slate-800 leading-tight mt-0.5">{analysis.total}</p>
              </div>
              <div className="hidden sm:block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Other Status</span>
                <p className="font-mono text-lg font-extrabold text-slate-600 leading-tight mt-0.5">{analysis.other}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Value</span>
                <p className="font-mono text-lg font-extrabold text-emerald-600 leading-tight mt-0.5">{money(analysis.totalValue)}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2 pt-4">
              {analysis.volume.map(([date, count]) => (
                <div key={date} className="flex flex-col justify-end items-center gap-1.5 w-16 h-32 group cursor-pointer">
                  <span className="font-mono font-bold text-slate-700 text-xs opacity-0 group-hover:opacity-100 transition-opacity">{count}</span>
                  <div 
                    className="w-10 rounded-t-md bg-gradient-to-t from-emerald-500 to-teal-400 shadow-sm transition-all duration-300 group-hover:opacity-80" 
                    style={{ height: `${Math.max(10, (count / maxVolume) * 100)}%` }} 
                  />
                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap mt-1">{date}</span>
                </div>
              ))}
              {analysis.volume.length === 0 && (
                <p className="w-full text-center text-xs font-semibold text-slate-400 py-8">No claims submitted yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
            <div className="min-w-0">
              <CardTitle className="text-sm font-bold text-slate-800 tracking-tight">All Partner Hospitals</CardTitle>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">{analysis.hospitals.length} active hospitals in this cycle</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead className="table-heading">
                  <tr>
                    <th className="p-4 pl-6">Hospital</th>
                    <th className="p-4">Total Claims</th>
                    <th className="p-4">Pending</th>
                    <th className="p-4">Approved</th>
                    <th className="p-4">Rejected</th>
                    <th className="p-4">Contested</th>
                    <th className="p-4 pr-6 text-right">Claim Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedHospitals.map((hospital) => (
                    <tr key={hospital.key} className="text-sm font-semibold text-slate-600 hover:bg-slate-50/40 transition-colors duration-150">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/80 text-slate-600 border border-slate-200/40 shrink-0">
                            <Building2 className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 leading-tight truncate">{hospital.name}</p>
                            <p className="text-xs text-slate-400 mt-1">Latest: {new Date(hospital.latest).toLocaleDateString("en-GB")}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-800">{hospital.total}</td>
                      <td className="p-4">
                        <span className="bg-amber-50 text-amber-700 hover:bg-amber-100/50 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-100/50 capitalize">
                          {hospital.pending}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-50 text-emerald-700 hover:bg-slate-100 text-xs font-bold px-2.5 py-0.5 rounded-full border border-slate-200 capitalize">
                          {hospital.approved}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-50 text-rose-700 hover:bg-slate-100 text-xs font-bold px-2.5 py-0.5 rounded-full border border-slate-200 capitalize">
                          {hospital.rejected}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-50 text-blue-700 hover:bg-slate-100 text-xs font-bold px-2.5 py-0.5 rounded-full border border-slate-200 capitalize">
                          {hospital.contested}
                        </span>
                      </td>
                      <td className="p-4 pr-6 font-mono font-bold text-emerald-700 text-sm text-right">{money(hospital.value)}</td>
                    </tr>
                  ))}
                  {filteredHospitals.length === 0 && (
                    <tr>
                      <td className="p-12 text-center text-xs font-semibold text-slate-400" colSpan={7}>
                        No hospital claim analysis found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} className="hidden md:flex p-4 border-t border-slate-100" />
            <div className="space-y-2 bg-slate-50/30 p-3 md:hidden">
              {paginatedHospitals.map((hospital) => (
                 <div key={hospital.key} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                   <div className="flex items-start justify-between gap-3">
                     <div className="min-w-0">
                       <p className="truncate text-sm font-bold text-slate-800">{hospital.name}</p>
                       <p className="mt-1 text-xs text-slate-400">Latest: {new Date(hospital.latest).toLocaleDateString("en-GB")}</p>
                     </div>
                     <p className="shrink-0 font-mono text-sm font-bold text-emerald-700">{money(hospital.value)}</p>
                   </div>
                   <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                     {[
                       ["Total", hospital.total, "bg-slate-50 text-slate-700 border border-slate-100"],
                       ["Pending", hospital.pending, "bg-amber-50 text-amber-700 border border-amber-100/50"],
                       ["Approved", hospital.approved, "bg-emerald-50 text-emerald-700 border border-emerald-100/50"],
                       ["Rejected", hospital.rejected, "bg-rose-50 text-rose-700 border border-rose-100/50"]
                     ].map(([label, count, color]) => (
                       <div key={label} className={cn("rounded-lg p-1.5", color as string)}>
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                         <p className="font-mono text-xs font-bold mt-0.5">{count}</p>
                       </div>
                     ))}
                   </div>
                 </div>
              ))}
              {filteredHospitals.length === 0 && (
                <p className="rounded-xl bg-white p-8 text-center text-xs font-semibold text-slate-400">
                  No hospital claim analysis found
                </p>
              )}
              <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} className="rounded-xl border border-slate-100" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
