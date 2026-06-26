
import { money } from "@/lib/claims-helpers";

interface HospitalStatsPanelProps {
  selectedHospitalName: string;
  claimStats: {
    submitted: number;
    approved: number;
    partiallyApproved: number;
    rejected: number;
    contested: number;
    paid: number;
    approvedValue: number;
    declinedValue: number;
  };
  loading?: boolean;
}

const StatSkeleton = () => (
  <div className="space-y-1 mt-1">
    <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
  </div>
);

export default function HospitalStatsPanel({
  selectedHospitalName,
  claimStats,
  loading = false
}: HospitalStatsPanelProps) {
  const cards = [
    { label: "Claims Submitted", value: claimStats.submitted, accent: "#378ADD" },
    { label: "Approved", value: claimStats.approved, accent: "#1D9E75" },
    { label: "Partial", value: claimStats.partiallyApproved, accent: "#BA7517" },
    { label: "Rejected", value: claimStats.rejected, accent: "#E24B4A" },
    { label: "Contested", value: claimStats.contested, accent: "#8B5CF6" },
    { label: "Paid", value: claimStats.paid, accent: "#10B981" },
    { label: "Approved Value", value: money(claimStats.approvedValue), accent: "#1D9E75" },
    { label: "Savings", value: money(claimStats.declinedValue), accent: "#0F766E" },
  ];

  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-black uppercase text-slate-400 tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Claims Analysis Summary
          </p>
          <h4 className="text-xs font-black text-slate-900 uppercase mt-0.5 leading-tight">
            {selectedHospitalName}
          </h4>
        </div>
      </div>

      <div className="grid gap-1.5 sm:gap-2.5 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        {cards.map(({ label, value }) => (
          <div key={label} className="premium-card p-1.5 sm:p-3 flex flex-col justify-center min-w-0 text-center sm:text-left rounded-xl" title={label}>
            <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-tight mb-0.5 sm:mb-1.5 line-clamp-2 md:truncate">{label}</p>
            {loading ? (
              <div className="mt-0.5"><StatSkeleton /></div>
            ) : (
              <p className="text-xs sm:text-base font-extrabold tabular-nums leading-none truncate text-slate-900 mt-0.5">
                {value}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
