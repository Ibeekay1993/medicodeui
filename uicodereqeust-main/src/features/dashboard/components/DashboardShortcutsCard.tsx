// src/features/dashboard/components/DashboardShortcutsCard.tsx
// Renders the role-specific Quick Shortcuts panel on staff dashboards.

import { Card } from "@/components/ui/card";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardShortcutAction {
  name: string;
  desc: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  bg: string;
}

interface DashboardShortcutsCardProps {
  actions: DashboardShortcutAction[];
  onNavigate: (href: string) => void;
}

export function DashboardShortcutsCard({ actions, onNavigate }: DashboardShortcutsCardProps) {
  return (
    <div className="space-y-6">
      <Card className="med-card p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Shortcuts</h3>
        <div className="grid grid-cols-1 gap-3">
          {actions.map((action) => (
            <button
              key={action.name}
              onClick={() => onNavigate(action.href)}
              className="flex items-center gap-3 rounded-lg p-3 text-left transition hover:bg-slate-50"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-[10px]", action.bg, action.color)}>
                <action.icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-slate-900">{action.name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{action.desc}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
