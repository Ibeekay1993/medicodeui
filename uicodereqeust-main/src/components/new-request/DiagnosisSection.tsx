import React from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import Dropdown from "./Dropdown";
import { DIAGNOSES } from "@/lib/new-request-helpers";

interface DiagnosisSectionProps {
  diagnoses: string[];
  setDiagnoses: React.Dispatch<React.SetStateAction<string[]>>;
  diagnosisSearch: string;
  setDiagnosisSearch: (val: string) => void;
  diagSuggestions: string[];
  setDiagSuggestions: (suggestions: string[]) => void;
  diagOpen: boolean;
  setDiagOpen: (open: boolean) => void;
  diagRef: React.RefObject<HTMLDivElement>;
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

  const handleDiagnosisKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const matched = DIAGNOSES.find((d) => d.toLowerCase() === diagnosisSearch.trim().toLowerCase());
      addDiagnosis(matched || diagnosisSearch);
    }
  };

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Diagnoses</p>
        <span className="text-xs font-bold text-slate-400">{diagnoses.length} selected</span>
      </div>

      {/* Search + add */}
      <div ref={diagRef} className="relative">
        <label htmlFor="diagnosis-search-input" className="sr-only">Search or type a diagnosis</label>
        <Input
          id="diagnosis-search-input"
          placeholder="Search or type a diagnosis and press Enter to add..."
          value={diagnosisSearch}
          onChange={(e) => setDiagnosisSearch(e.target.value)}
          onFocus={() => diagSuggestions.length > 0 && setDiagOpen(true)}
          onKeyDown={handleDiagnosisKeyDown}
          className="h-12 rounded-xl bg-slate-50 border border-slate-200 pr-10 text-sm placeholder:text-slate-300 placeholder:text-xs"
        />
        <div className="absolute right-3 top-3.5 pointer-events-none">
          <Plus className="h-4 w-4 text-slate-300" />
        </div>
        <Dropdown anchorRef={diagRef} open={diagOpen} onClose={() => setDiagOpen(false)}>
          <div className="divide-y divide-slate-50">
            {diagSuggestions.map((d, i) => (
              <button
                type="button"
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addDiagnosis(d);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors group flex items-center justify-between"
              >
                <p className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">{d}</p>
                <Plus className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                  className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors group flex items-center justify-between border-t border-slate-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Add "{diagnosisSearch.trim()}"</p>
                    <p className="text-xs text-slate-400">Custom entry</p>
                  </div>
                  <Plus className="h-4 w-4 text-amber-400" />
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
              className="rounded-full border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-colors cursor-pointer"
              onClick={() => removeDiagnosis(index)}
            >
              {d}
              <X className="ml-1.5 h-3 w-3" />
            </Badge>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center py-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No diagnoses added yet</p>
        </div>
      )}

      {diagnoses.length > 0 && <p className="text-xs text-slate-400 italic">Click a diagnosis to remove it.</p>}
    </div>
  );
}
