import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Minus, Plus } from "lucide-react";
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
  setTreatments: React.Dispatch<React.SetStateAction<TreatmentItem[]>>;
  isSubmitting: boolean;
  onSubmit: () => void;
  treatRef: React.RefObject<HTMLDivElement>;
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
  isSubmitting,
  onSubmit,
  treatRef
}: TreatmentSectionProps) {
  const addTreatment = (item: any) => {
    setTreatments((prev) =>
      prev.find((t) => t.code === item.code) ? prev : [...prev, { ...item, quantity: 1 }]
    );
    setTreatSearch("");
    setTreatOpen(false);
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Treatment & Services</p>
        <Badge
          variant="outline"
          className="text-xs font-black uppercase border-amber-200 text-amber-600 bg-amber-50"
        >
          NHIA 2025
        </Badge>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="treatment-search-input" className="text-xs font-semibold text-slate-500">Search Drug, Service or Procedure</Label>
        <div ref={treatRef} className="relative">
          <Input
            id="treatment-search-input"
            placeholder="e.g. Paracetamol, Ceftriaxone, Flagyl, Lipitor..."
            value={treatSearch}
            onChange={(e) => setTreatSearch(e.target.value)}
            onFocus={() => treatResults.length > 0 && setTreatOpen(true)}
            className="h-12 rounded-xl bg-slate-50 border border-slate-200 pr-10 text-sm placeholder:text-slate-300 placeholder:text-xs"
          />
          <div className="absolute right-3 top-3.5 pointer-events-none">
            {treatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            ) : (
              <Search className="h-4 w-4 text-slate-300" />
            )}
          </div>
        </div>
        <Dropdown anchorRef={treatRef} open={treatOpen} onClose={() => setTreatOpen(false)}>
          <div className="divide-y divide-slate-50">
            {treatResults.map((item, i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTreatment(item);
                }}
                className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors group flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 group-hover:text-amber-700 leading-tight">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">
                    {item.subcategory || item.category} · {item.code}
                  </p>
                </div>
                <p className="text-sm font-black text-emerald-600 shrink-0">₦{Number(item.amount).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </Dropdown>
      </div>

      {/* Treatment list */}
      {treatments.length === 0 ? (
        <div className="flex items-center justify-center py-6 rounded-xl bg-slate-50 border border-dashed border-slate-200">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No items added yet</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {treatments.map((t) => (
            <div key={t.code} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900 leading-tight">{t.name}</p>
                <p className="text-xs text-slate-400 uppercase tracking-widest">{t.code}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => changeQty(t.code, -1)}
                  className="h-6 w-6 rounded-md bg-white border border-slate-200 hover:border-slate-300 flex items-center justify-center"
                  aria-label={`Decrease quantity of ${t.name}`}
                >
                  <Minus className="h-2.5 w-2.5 text-slate-500" />
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
                  className="h-6 w-8 border border-slate-300 bg-white rounded text-center font-black text-xs p-0 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-text tabular-nums"
                  style={{ MozAppearance: "textfield" }}
                />
                <button
                  onClick={() => changeQty(t.code, 1)}
                  className="h-6 w-6 rounded-md bg-white border border-slate-200 hover:border-slate-300 flex items-center justify-center"
                >
                  <Plus className="h-2.5 w-2.5 text-slate-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={onSubmit}
        disabled={isSubmitting}
        className="h-12 px-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase tracking-widest active:scale-95 transition-all w-full sm:w-auto"
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting…
          </span>
        ) : (
          "Submit Request"
        )}
      </Button>
    </div>
  );
}
