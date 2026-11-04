import { Card } from "@/components/ui/card";
import { Clock, CheckCircle2, ShieldCheck, Banknote } from "lucide-react";
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
    { 
      label: "Pending Audit", 
      value: pendingCount.toLocaleString(), 
      icon: Clock, 
      color: "text-amber-600",
      bg: "bg-amber-50"
    },
    { 
      label: "Approved Claims", 
      value: approvedCount.toLocaleString(), 
      icon: CheckCircle2, 
      color: "text-emerald-600",
      bg: "bg-emerald-50"
    },
    { 
      label: "Settled / Paid", 
      value: paidCount.toLocaleString(), 
      icon: ShieldCheck, 
      color: "text-slate-800",
      bg: "bg-slate-100"
    },
    { 
      label: "Total Claim Value", 
      value: `₦${Number(totalValue || 0).toLocaleString("en-NG")}`, 
      icon: Banknote, 
      color: "text-slate-900",
      bg: "bg-slate-50"
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {statsList.map((item) => (
        <Card 
          key={item.label} 
          className="flex min-h-[76px] min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:gap-3.5 sm:p-3.5 shadow-sm"
        >
          <span 
            className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", item.bg)} 
            aria-hidden="true"
          >
            <item.icon className={cn("h-5 w-5", item.color)} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-700 truncate">{item.label}</p>
            <p className={cn("mt-0.5 whitespace-nowrap text-base font-bold tabular-nums sm:text-lg", item.color)}>
              {item.value}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
