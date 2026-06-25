import { cn } from "@/lib/utils";

interface HospitalClaimsStatsProps {
  pendingCount: number;
  approvedCount: number;
  paidCount: number;
  totalValue: number;
}

export default function HospitalClaimsStats({
  pendingCount,
  approvedCount,
  paidCount,
  totalValue
}: HospitalClaimsStatsProps) {
  const statsList = [
    { label: "Pending Audit", value: String(pendingCount), tone: "text-amber-700 bg-amber-50" },
    { label: "Approved", value: String(approvedCount), tone: "text-emerald-700 bg-emerald-50" },
    { label: "Paid", value: String(paidCount), tone: "text-blue-700 bg-blue-50" },
    { label: "Claim Value", value: `₦${totalValue.toLocaleString()}`, tone: "text-slate-700 bg-slate-50" }
  ];

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {statsList.map((item) => (
        <div key={item.label} className={cn("rounded-lg p-2.5", item.tone)}>
          <p className="text-xs font-black uppercase tracking-widest opacity-70">{item.label}</p>
          <p className="mt-1 text-sm font-black leading-none">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
