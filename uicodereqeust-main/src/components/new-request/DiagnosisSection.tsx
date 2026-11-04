import type { RefObject, KeyboardEvent, Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Activity } from "lucide-react";
import Dropdown from "./Dropdown";
import { DIAGNOSES } from "@/lib/new-request-helpers";

interface DiagnosisSectionProps {
  diagnoses: string[];
  setDiagnoses: Dispatch<SetStateAction<string[]>>;
  diagnosisSearch: string;
  setDiagnosisSearch: (val: string) => void;
  diagSuggestions: string[];
  setDiagSuggestions: (suggestions: string[]) => void;
  diagOpen: boolean;
  setDiagOpen: (open: boolean) => void;
  diagRef: RefObject<HTMLDivElement>;
}

export default function DiagnosisSection({
  diagnoses,
  setDiagnoses,
  diagnosisSearch,
  setDiagnosisSearch,
  diagSuggestions,
  setDiagSuggestions,
  diagOpen,
  setDiagOpen,
  diagRef
}: DiagnosisSectionProps) {
  const addDiagnosis = (d: string) => {
    const trimmed = d.trim();
    if (!trimmed) return;
    if (!diagnoses.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      setDiagnoses((prev) => [...prev, trimmed]);
    }
    setDiagnosisSearch("");
    setDiagOpen(false);
    setDiagSuggestions([]);
  };

  const removeDiagnosis = (index: number) => {
    setDiagnoses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDiagnosisKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const matched = DIAGNOSES.find((d) => d.toLowerCase() === diagnosisSearch.trim().toLowerCase());
      addDiagnosis(matched || diagnosisSearch);
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-emerald-600" /> Clinical Diagnoses
        </h4>
        <span className="text-[11px] font-medium text-slate-500">{diagnoses.length} selected</span>
      </div>

      {/* Search + add */}
      <div ref={diagRef} className="relative">
        <label htmlFor="diagnosis-search-input" className="sr-only">Search or type a diagnosis</label>
        <Input
          id="diagnosis-search-input"
          placeholder="Search or type a diagnosis and press Enter..."
          value={diagnosisSearch}
          onChange={(e) => setDiagnosisSearch(e.target.value)}
          onFocus={() => diagSuggestions.length > 0 && setDiagOpen(true)}
          onKeyDown={handleDiagnosisKeyDown}
          className="h-9 sm:h-10 rounded-lg bg-white border border-slate-200 pr-9 text-xs placeholder:text-slate-400"
        />
        <div className="absolute right-3 top-2.5 pointer-events-none">
          <Plus className="h-4 w-4 text-slate-400" />
        </div>
        <Dropdown anchorRef={diagRef} open={diagOpen} onClose={() => setDiagOpen(false)}>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {diagSuggestions.map((d, i) => (
              <button
                type="button"
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addDiagnosis(d);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors group flex items-center justify-between text-xs"
              >
                <span className="font-medium text-slate-800 group-hover:text-slate-900">{d}</span>
                <Plus className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            {diagnosisSearch.trim().length >= 2 &&
              !DIAGNOSES.some((d) => d.toLowerCase() === diagnosisSearch.trim().toLowerCase()) && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addDiagnosis(diagnosisSearch);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition-colors group flex items-center justify-between border-t border-slate-100 text-xs"
                >
                  <div>
                    <span className="font-semibold text-emerald-800">Add "{diagnosisSearch.trim()}"</span>
                    <span className="text-[10px] text-slate-400 ml-1.5">Custom entry</span>
                  </div>
                  <Plus className="h-3.5 w-3.5 text-emerald-600" />
                </button>
              )}
          </div>
        </Dropdown>
      </div>

      {/* Selected diagnoses as tags */}
      {diagnoses.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {diagnoses.map((d, index) => (
            <Badge
              key={`${d}-${index}`}
              variant="outline"
              className="rounded-md border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-colors cursor-pointer"
              onClick={() => removeDiagnosis(index)}
              title="Click to remove"
            >
              {d}
              <X className="ml-1.5 h-3 w-3" />
            </Badge>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-3 rounded-lg bg-slate-50/60 border border-dashed border-slate-200">
          <p className="text-xs text-slate-400">No diagnoses added yet. Type and press enter.</p>
        </div>
      )}

      {diagnoses.length > 0 && <p className="text-[11px] text-slate-400 italic">Click any diagnosis pill to remove it.</p>}
    </div>
  );
}
