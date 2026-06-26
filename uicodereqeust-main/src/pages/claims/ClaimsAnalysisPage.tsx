import { useCallback, useEffect, useMemo, useState } from "react";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import { supabase } from "@/integrations/supabase/client";
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

type ClaimRecord = {
  id: string;
  hospital_id: string | null;
  hospital_name: string | null;
  status: string | null;
  total_amount: number | null;
  created_at: string;
};

type HospitalClaimSummary = {
  key: string;
  name: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  paid: number;
  other: number;
  value: number;
  approvedValue: number;
  paidValue: number;
  latest: string;
};

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

function statusBucket(status?: string | null): "pending" | "approved" | "rejected" | "paid" | "other" {
  const normalized = normalizeStatus(status);
  if (["submitted", "pending", "under_investigation", "under_review", "pending_audit", "audit"].includes(normalized)) return "pending";
  if (normalized === "approved") return "approved";
  if (normalized === "paid") return "paid";
  if (["rejected", "declined", "denied"].includes(normalized)) return "rejected";
  return "other";
}

export default function ClaimsAnalysisPage() {
  const { toast } = useToast();
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openHospitalSelect, setOpenHospitalSelect] = useState(false);
  const [selectedHospitalKey, setSelectedHospitalKey] = useState("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      let page = 0;
      let hasMore = true;
      let allData: ClaimRecord[] = [];

      while (hasMore) {
        const { data, error } = await supabase
          .from("hospital_claims" as any)
          .select("id,hospital_id,hospital_name,status,total_amount,created_at")
          .order("created_at", { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);

        if (error) throw error;
        const rows = (data || []) as unknown as ClaimRecord[];
        allData = [...allData, ...rows];
        page += 1;
        hasMore = rows.length === 1000;
      }

      setClaims(allData);
    } catch (error: any) {
      console.error("Claims analysis sync error:", error);
      toast({
        variant: "destructive",
        title: "Unable to load claims analysis",
        description: error.message || "Please refresh and try again."
      });
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useTabVisibilityRefresh(refresh);

  const analysis = useMemo(() => {
    const base = {
      total: claims.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
      other: 0,
      totalValue: 0,
      approvedValue: 0,
      rejectedValue: 0,
      paidValue: 0
    };

    const byHospital = new Map<string, HospitalClaimSummary>();
    const byDate = new Map<string, number>();

    claims.forEach((claim) => {
      const amount = Number(claim.total_amount || 0);
      const bucket = statusBucket(claim.status);
      const key = claim.hospital_id || claim.hospital_name || "unknown";
      const name = claim.hospital_name || "Unknown Hospital";
      const dateKey = new Date(claim.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

      base.totalValue += amount;
      base[bucket] += 1;
      if (bucket === "approved") base.approvedValue += amount;
      if (bucket === "rejected") base.rejectedValue += amount;
      if (bucket === "paid") base.paidValue += amount;

      byDate.set(dateKey, (byDate.get(dateKey) || 0) + 1);

      const current = byHospital.get(key) || {
        key,
        name,
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        paid: 0,
        other: 0,
        value: 0,
        approvedValue: 0,
        paidValue: 0,
        latest: claim.created_at
      };

      current.total += 1;
      current[bucket] += 1;
      current.value += amount;
      if (bucket === "approved") current.approvedValue += amount;
      if (bucket === "paid") current.paidValue += amount;
      if (new Date(claim.created_at) > new Date(current.latest)) current.latest = claim.created_at;
      byHospital.set(key, current);
    });

    const hospitals = Array.from(byHospital.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const volume = Array.from(byDate.entries()).slice(0, 10).reverse();

    return { ...base, hospitals, volume };
  }, [claims]);

  const selectedHospital = analysis.hospitals.find((hospital) => hospital.key === selectedHospitalKey) || null;
  const scopedClaims = selectedHospitalKey === "all"
    ? claims
    : claims.filter((claim) => (claim.hospital_id || claim.hospital_name || "unknown") === selectedHospitalKey);
  const paymentReadyValue = scopedClaims
    .filter((claim) => ["approved", "partially_approved"].includes(normalizeStatus(claim.status)))
    .reduce((sum, claim) => sum + Number(claim.total_amount || 0), 0);
  const pendingAuditValue = scopedClaims
    .filter((claim) => statusBucket(claim.status) === "pending")
    .reduce((sum, claim) => sum + Number(claim.total_amount || 0), 0);

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

  const maxVolume = Math.max(1, ...analysis.volume.map(([, count]) => count));

  const stats = useMemo(() => {
    const base = {
      pending: 0,
      approved: 0,
      rejected: 0,
      paid: 0,
      pendingValue: 0,
      approvedValue: 0,
      rejectedValue: 0,
      paidValue: 0
    };

    scopedClaims.forEach((claim) => {
      const amount = Number(claim.total_amount || 0);
      const bucket = statusBucket(claim.status);
      if (bucket in base) {
        (base as any)[bucket] += 1;
      }
      if (bucket === "pending") base.pendingValue += amount;
      if (bucket === "approved") base.approvedValue += amount;
      if (bucket === "rejected") base.rejectedValue += amount;
      if (bucket === "paid") base.paidValue += amount;
    });

    return base;
  }, [scopedClaims]);

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
      iconBg: "bg-amber-50/70 text-amber-600 border border-amber-100/60"
    },
    {
      label: "Approved",
      count: stats.approved,
      value: money(stats.approvedValue),
      icon: CheckCircle2,
      borderColor: "border-l-emerald-500",
      iconBg: "bg-emerald-50/70 text-emerald-600 border border-emerald-100/60"
    },
    {
      label: "Rejected",
      count: stats.rejected,
      value: money(stats.rejectedValue),
      icon: XCircle,
      borderColor: "border-l-rose-500",
      iconBg: "bg-rose-50/70 text-rose-600 border border-rose-100/60"
    },
    {
      label: "Paid",
      count: stats.paid,
      value: money(stats.paidValue),
      icon: Wallet,
      borderColor: "border-l-blue-500",
      iconBg: "bg-blue-50/70 text-blue-600 border border-blue-100/60"
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
          <PopoverContent className="w-[280px] p-0 rounded-xl shadow-md border-slate-150">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1 sm:gap-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="premium-card p-1.5 sm:p-4 flex flex-col justify-center min-w-0 text-center sm:text-left rounded-xl" title={metric.label}>
            <p className="text-[8px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 leading-tight md:leading-none mb-0.5 sm:mb-1.5 line-clamp-2 md:truncate">{metric.label}</p>
            <p className="text-sm sm:text-lg font-extrabold tabular-nums leading-none truncate text-slate-900 mt-0.5 sm:mt-1">
              {metric.count} <span className="text-[8px] sm:text-[10px] text-slate-400 font-normal ml-1 tracking-normal">{metric.value}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm xl:col-span-8 hover:shadow-md transition-shadow duration-300">
          <CardHeader className="flex flex-col gap-3 space-y-0 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
            <div className="min-w-0">
              <CardTitle className="text-sm font-bold text-slate-800 tracking-tight">All Partner Hospitals</CardTitle>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">{analysis.hospitals.length} active hospitals in this cycle</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left">
                <thead className="table-heading">
                  <tr>
                    <th className="p-4 pl-6">Hospital</th>
                    <th className="p-4">Total Claims</th>
                    <th className="p-4">Pending</th>
                    <th className="p-4">Approved</th>
                    <th className="p-4">Rejected</th>
                    <th className="p-4">Paid</th>
                    <th className="p-4 pr-6">Claim Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedHospitals.map((hospital) => (
                    <tr key={hospital.key} className="text-sm font-semibold text-slate-650 hover:bg-slate-50/40 transition-colors duration-150">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/80 text-slate-600 border border-slate-200/40">
                            <Building2 className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 leading-tight">{hospital.name}</p>
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
                        <span className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100/50 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-100/50 capitalize">
                          {hospital.approved}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-rose-50 text-rose-700 hover:bg-rose-100/50 text-xs font-bold px-2.5 py-0.5 rounded-full border border-rose-100/50 capitalize">
                          {hospital.rejected}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="bg-blue-50 text-blue-700 hover:bg-blue-100/50 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-100/50 capitalize">
                          {hospital.paid}
                        </span>
                      </td>
                      <td className="p-4 pr-6 font-mono font-bold text-emerald-700 text-sm">{money(hospital.value)}</td>
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

        <Card className="rounded-2xl border border-slate-100 bg-white shadow-sm xl:col-span-4 hover:shadow-md transition-shadow duration-300">
          <CardHeader className="p-4 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-800 tracking-tight">Volume Performance</CardTitle>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">Recent claim volume by day</p>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100/40 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Claims</span>
                <span className="font-mono text-xl font-extrabold text-slate-800">{analysis.total}</span>
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-sm">
                  <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">Other Status</span>
                  <p className="mt-1 font-mono font-bold text-slate-800">{analysis.other}</p>
                </div>
                <div className="rounded-xl bg-white p-3 border border-slate-100 shadow-sm">
                  <span className="text-slate-400 font-bold uppercase text-xs tracking-wider">Total Value</span>
                  <p className="mt-1 truncate font-mono font-bold text-emerald-600">{money(analysis.totalValue)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3.5">
              {analysis.volume.map(([date, count]) => (
                <div key={date} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                    <span>{date}</span>
                    <span className="font-mono font-bold text-slate-850">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 shadow-sm"
                      style={{ width: `${Math.max(8, (count / maxVolume) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {analysis.volume.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-6 text-center text-xs font-semibold text-slate-400">
                  No claims submitted yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
