import type { Dispatch, SetStateAction, RefObject } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Minus, Plus, Trash2, Pill } from "lucide-react";
import Dropdown from "./Dropdown";
import { TreatmentItem } from "@/lib/new-request-helpers";

interface TreatmentSectionProps {
  treatSearch: string;
  setTreatSearch: (val: string) => void;
  treatLoading: boolean;
  treatResults: any[];
  treatOpen: boolean;
  setTreatOpen: (open: boolean) => void;
  treatments: TreatmentItem[];
  setTreatments: Dispatch<SetStateAction<TreatmentItem[]>>;
  isSubmitting?: boolean;
  onSubmit?: () => void;
  treatRef: RefObject<HTMLDivElement>;
}

export default function TreatmentSection({
  treatSearch,
  setTreatSearch,
  treatLoading,
  treatResults,
  treatOpen,
  setTreatOpen,
  treatments,
  setTreatments,
  treatRef
}: TreatmentSectionProps) {
  const addTreatment = (item: any) => {
    setTreatments((prev) =>
      prev.find((t) => t.code === item.code) ? prev : [...prev, { ...item, quantity: 1 }]
    );
    setTreatSearch("");
    setTreatOpen(false);
  };

  const removeTreatment = (code: string) => {
    setTreatments((prev) => prev.filter((t) => t.code !== code));
  };

  const changeQty = (code: string, d: number) =>
    setTreatments((prev) =>
      prev.map((t) => (t.code === code ? { ...t, quantity: Math.max(1, t.quantity + d) } : t))
    );

  const setQty = (code: string, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    if (cleaned === "") {
      setTreatments((prev) => prev.map((t) => (t.code === code ? { ...t, quantity: 1 } : t)));
    } else {
      const num = Number(cleaned);
      if (Number.isFinite(num) && num > 0) {
        setTreatments((prev) =>
          prev.map((t) => (t.code === code ? { ...t, quantity: Math.min(999, Math.floor(num)) } : t))
        );
      }
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Pill className="h-3.5 w-3.5 text-emerald-600" /> Treatment & Clinical Services
          </h4>
          <p className="text-[11px] text-slate-500">Select drugs, investigations, or procedures from standard tariff</p>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] font-semibold border-slate-200 text-slate-600 bg-slate-50"
        >
          NHIA 2025
        </Badge>
      </div>

      <div className="space-y-1">
        <Label htmlFor="treatment-search-input" className="text-xs font-semibold text-slate-700">
          Search Drug, Investigation, or Procedure
        </Label>
        <div ref={treatRef} className="relative">
          <Input
            id="treatment-search-input"
            placeholder="e.g. Paracetamol, Ceftriaxone, Full Blood Count..."
            value={treatSearch}
            onChange={(e) => setTreatSearch(e.target.value)}
            onFocus={() => treatResults.length > 0 && setTreatOpen(true)}
            className="h-9 sm:h-10 rounded-lg bg-white border border-slate-200 pr-9 text-xs placeholder:text-slate-400"
          />
          <div className="absolute right-3 top-2.5 pointer-events-none">
            {treatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : (
              <Search className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
        <Dropdown anchorRef={treatRef} open={treatOpen} onClose={() => setTreatOpen(false)}>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {treatResults.map((item, i) => (
              <button
                type="button"
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTreatment(item);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors group flex items-center justify-between text-xs"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-semibold text-slate-900 group-hover:text-emerald-700 leading-tight truncate">
                    {item.name}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {item.code} · {item.subcategory || item.category}
                  </p>
                </div>
                <span className="font-mono font-semibold text-emerald-700 shrink-0">
                  ₦{Number(item.amount).toLocaleString("en-NG")}
                </span>
              </button>
            ))}
          </div>
        </Dropdown>
      </div>

      {/* Treatment list */}
      {treatments.length === 0 ? (
        <div className="flex items-center justify-center py-6 rounded-lg bg-slate-50/60 border border-dashed border-slate-200">
          <p className="text-xs text-slate-400">No items selected yet. Search above to add.</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
          {treatments.map((t) => (
            <div key={t.code} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-lg text-xs">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  {t.code} · ₦{Number(t.amount).toLocaleString("en-NG")} each
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center border border-slate-200 rounded-md bg-white">
                  <button
                    type="button"
                    onClick={() => changeQty(t.code, -1)}
                    className="h-6 w-6 rounded-l-md flex items-center justify-center text-slate-500 hover:bg-slate-100"
                    aria-label={`Decrease quantity of ${t.name}`}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={t.quantity}
                    aria-label={`Quantity for ${t.name}`}
                    onChange={(e) => setQty(t.code, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v < 1) setQty(t.code, "1");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="h-6 w-8 text-center font-mono font-semibold text-xs p-0 outline-none tabular-nums border-x border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => changeQty(t.code, 1)}
                    className="h-6 w-6 rounded-r-md flex items-center justify-center text-slate-500 hover:bg-slate-100"
                    aria-label={`Increase quantity of ${t.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <span className="w-20 text-right font-mono font-semibold text-slate-900">
                  ₦{(t.amount * t.quantity).toLocaleString("en-NG")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTreatment(t.code)}
                  className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                  aria-label={`Remove ${t.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
