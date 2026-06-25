/**
 * MonthYearPicker — shared filter component
 * Renders a clean, on-brand dropdown to filter by month/year.
 * Follows the app's design language: slate palette, #3f3f95 accent, rounded-xl, shadow-sm.
 */
import { useMemo, useRef, useEffect, useState } from "react";
import { ChevronDown, Check, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthYearPickerProps {
  value: string;           // "YYYY-MM" or ""  (empty = all)
  onChange: (value: string) => void;
  className?: string;
  /**
   * How many months back to include (default 24 — 2 years).
   */
  monthsBack?: number;
  placeholder?: string;
  id?: string;
}

function buildMonths(monthsBack: number) {
  const result: { value: string; label: string; year: number }[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("default", { month: "long", year: "numeric" }),
      year: d.getFullYear(),
    });
  }
  return result;
}

export function MonthYearPicker({
  value,
  onChange,
  className,
  monthsBack = 24,
  placeholder = "All Months",
  id,
}: MonthYearPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const months = useMemo(() => buildMonths(monthsBack), [monthsBack]);

  // Group by year so the list has natural headings
  const grouped = useMemo(() => {
    const map: Record<number, typeof months> = {};
    for (const m of months) {
      if (!map[m.year]) map[m.year] = [];
      map[m.year].push(m);
    }
    return Object.entries(map)
      .map(([year, items]) => ({ year: Number(year), items }))
      .sort((a, b) => b.year - a.year);
  }, [months]);

  const selectedLabel = months.find((m) => m.value === value)?.label ?? null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div
      ref={containerRef}
      id={id}
      className={cn("relative min-w-0", className)}
    >
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 h-9 px-3 rounded-lg border text-xs font-medium transition-all duration-150",
          "bg-white border-slate-200 text-slate-700",
          "hover:border-slate-300 hover:bg-slate-50",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3f3f95] focus-visible:ring-offset-0",
          open && "border-[#3f3f95]/60 bg-slate-50 ring-1 ring-[#3f3f95]/30",
          value && "border-[#3f3f95]/40 text-[#3f3f95]"
        )}
      >
        <CalendarDays
          className={cn("h-3.5 w-3.5 shrink-0", value ? "text-[#3f3f95]" : "text-slate-400")}
        />
        <span className="flex-1 text-left truncate">
          {selectedLabel ?? placeholder}
        </span>
        {value ? (
          <X
            className="h-3.5 w-3.5 shrink-0 text-slate-400 hover:text-slate-600"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Backdrop for mobile */}
          <div className="fixed inset-0 z-30 sm:hidden" onClick={() => setOpen(false)} />

          <div
            role="listbox"
            aria-label="Select month"
            className={cn(
              "absolute left-0 top-full mt-1.5 z-40",
              "w-52 max-h-72 overflow-y-auto",
              "rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60",
              "animate-in fade-in slide-in-from-top-1 duration-150"
            )}
          >
            {/* All Months option */}
            <div className="p-1.5 border-b border-slate-100">
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => handleSelect("")}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold transition-colors",
                  !value
                    ? "bg-[#3f3f95]/8 text-[#3f3f95]"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <span>All Months</span>
                {!value && <Check className="h-3.5 w-3.5 text-[#3f3f95]" />}
              </button>
            </div>

            {/* Year-grouped months */}
            <div className="p-1.5 space-y-0.5">
              {grouped.map(({ year, items }) => (
                <div key={year}>
                  {/* Year heading */}
                  <p className="px-3 pt-2 pb-1 text-xs font-black uppercase tracking-widest text-slate-400">
                    {year}
                  </p>
                  {items.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      role="option"
                      aria-selected={value === m.value}
                      onClick={() => handleSelect(m.value)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                        value === m.value
                          ? "bg-[#3f3f95]/8 text-[#3f3f95] font-semibold"
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <span>
                        {new Date(m.value + "-01").toLocaleString("default", { month: "long" })}
                      </span>
                      {value === m.value && <Check className="h-3.5 w-3.5 text-[#3f3f95]" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
