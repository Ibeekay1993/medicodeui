import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItemData {
  name: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
}

interface NavItemProps {
  item: NavItemData;
  isActive: boolean;
  onClick: () => void;
  /**
   * - "rail": desktop sidebar (works for both expanded and collapsed —
   *    pass `expanded` to control label visibility)
   * - "sheet": mobile slide-out drawer
   * - "bottom": mobile bottom tab bar
   */
  variant: "rail" | "sheet" | "bottom";
  expanded?: boolean;
}

function BadgePill({ count, tone }: { count: number; tone: "active" | "inactive" }) {
  return (
    <span
      className={cn(
        "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold",
        tone === "active" ? "bg-brand-700 text-white" : "bg-sky-500 text-slate-950"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Single source of truth for nav item appearance across the dashboard shell.
 * Change the active/hover/badge styling here once — it updates the desktop
 * rail, the mobile drawer, and the bottom tab bar consistently, instead of
 * three copies quietly drifting apart over time.
 */
export function NavItem({ item, isActive, onClick, variant, expanded = true }: NavItemProps) {
  const Icon = item.icon;
  const label = item.name === "Dashboard" && variant === "bottom" ? "Home" : item.name;

  if (variant === "rail") {
    return (
      <button
        onClick={onClick}
        aria-label={item.name}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group relative text-left",
          isActive
            ? "bg-white text-slate-900 shadow-elevation-3 border-l-[3px] border-brand-700"
            : "text-slate-400 hover:bg-white/10 hover:text-white",
          !expanded && "justify-center px-0"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand-700" : "text-slate-400 group-hover:text-white")} />
        {expanded && (
          <span className={cn("whitespace-nowrap text-sm", isActive ? "font-semibold text-slate-950" : "font-medium text-slate-400 group-hover:text-white")}>
            {label}
          </span>
        )}
        {(item.badge ?? 0) > 0 && expanded && <BadgePill count={item.badge ?? 0} tone={isActive ? "active" : "inactive"} />}
      </button>
    );
  }

  if (variant === "sheet") {
    return (
      <button
        onClick={onClick}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-all text-left",
          isActive ? "bg-white text-slate-900 shadow-elevation-3" : "text-slate-400 hover:bg-white/5"
        )}
      >
        <Icon className={cn("h-4 w-4", isActive ? "text-brand-700" : "text-slate-500")} />
        {label}
        {(item.badge ?? 0) > 0 && <BadgePill count={item.badge ?? 0} tone={isActive ? "active" : "inactive"} />}
      </button>
    );
  }

  // variant === "bottom"
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center w-full py-2 gap-1 transition-colors",
        isActive ? "text-brand-700" : "text-slate-400 hover:text-slate-600"
      )}
    >
      <div className="relative">
        <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
        {(item.badge ?? 0) > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-sky-500 text-[8px] font-bold text-white ring-1 ring-white">
            {(item.badge ?? 0) > 9 ? "9+" : item.badge}
          </span>
        )}
      </div>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}
