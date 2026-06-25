import { useEffect, useMemo, useState, useRef } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type HospitalOption = {
  id: string;
  name: string;
  code?: string | null;
  state?: string | null;
};

const HOSPITAL_PAGE_SIZE = 1000;

type Props = {
  label?: string;
  value: string;
  selectedId?: string | null;
  onChange: (next: { id: string | null; name: string }) => void;
  placeholder?: string;
  helperText?: string;
  className?: string;
  disabled?: boolean;
};

function normalize(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function acronym(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((part) => !["of", "and", "the", "for"].includes(part))
    .map((part) => part[0])
    .join("");
}

function scoreHospital(hospital: HospitalOption, query: string) {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(hospital.name);
  const code = normalize(hospital.code);
  const short = acronym(hospital.name);
  if (code && code === q) return 120;
  if (short && short === q) return 115;
  if (name === q) return 110;
  if (code && code.startsWith(q)) return 100;
  if (short && short.startsWith(q)) return 96;
  if (name.startsWith(q)) return 92;
  if (name.includes(q)) return 80;

  const parts = q.split(/\s+/).filter(Boolean);
  const matched = parts.filter((part) => name.includes(part) || code.includes(part) || short.includes(part)).length;
  if (matched) return 40 + matched * 10;
  return 0;
}

export function HospitalReferralField({
  label = "Referral Hospital",
  value,
  selectedId,
  onChange,
  placeholder = "Search or type treating hospital...",
  helperText,
  className,
  disabled = false,
}: Props) {
  const [hospitals, setHospitals] = useState<HospitalOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadHospitals() {
      setLoading(true);
      const allHospitals: HospitalOption[] = [];

      for (let from = 0; mounted; from += HOSPITAL_PAGE_SIZE) {
        const to = from + HOSPITAL_PAGE_SIZE - 1;
        const { data, error } = await supabase.rpc("get_referral_hospitals").range(from, to);

        if (error) break;

        allHospitals.push(...((data || []) as HospitalOption[]));

        if (!data || data.length < HOSPITAL_PAGE_SIZE) break;
      }

      if (mounted) {
        setHospitals(allHospitals);
        setLoading(false);
      }
    }

    loadHospitals();

    return () => {
      mounted = false;
    };
  }, []);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const suggestions = useMemo(() => {
    const query = value.trim();
    const ranked = hospitals
      .map((hospital) => ({ hospital, score: scoreHospital(hospital, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 100) // Show up to 100 matches instead of only 8
      .map((entry) => entry.hospital);

    if (ranked.length || query.length > 1) return ranked;
    return hospitals.slice(0, 100); // Show up to 100 matches instead of only 8
  }, [hospitals, value]);

  const selected = selectedId ? hospitals.find((hospital) => hospital.id === selectedId) : null;

  return (
    <div ref={containerRef} className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="referral-hospital-search-input" className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
        <div className="flex items-center gap-2">
          {selected ? (
            <Badge variant="outline" className="rounded-md border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-black uppercase text-emerald-700">
              Matched
            </Badge>
          ) : value.trim() ? (
            <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black uppercase text-amber-700">
              Manual
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-300" />
        <Input
          id="referral-hospital-search-input"
          value={value}
          onChange={(event) => {
            if (disabled) return;
            onChange({ id: null, name: event.target.value });
            setOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          aria-describedby={helperText ? "referral-hospital-helper" : undefined}
          placeholder={placeholder}
          className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-semibold"
          disabled={disabled}
        />
        {value && !disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange({ id: null, name: "" })}
            className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg text-slate-400"
            aria-label="Clear referral hospital selection"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}

        {open && !disabled ? (
          <div className="absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-slate-100 bg-white p-1 shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-3 py-2 text-xs font-bold text-slate-400">
              <span>ACCREDITED HOSPITALS ({suggestions.length} shown)</span>
              <button 
                type="button" 
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs font-black text-rose-500 hover:bg-rose-50 transition-colors"
              >
                CLOSE LIST
              </button>
            </div>
            {loading ? (
              <div className="px-3 py-3 text-xs font-bold text-slate-400">Loading hospitals...</div>
            ) : suggestions.length ? (
              suggestions.map((hospital) => (
                <button
                  key={hospital.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange({ id: hospital.id, name: hospital.name });
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-emerald-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-slate-900">{hospital.name}</span>
                    <span className="block truncate text-xs font-bold uppercase tracking-wide text-slate-400">
                      {[hospital.code, hospital.state].filter(Boolean).join(" / ") || "Registered hospital"}
                    </span>
                  </span>
                  <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-xs font-semibold text-slate-500">
                No registered match. This manual hospital name will be saved.
              </div>
            )}
          </div>
        ) : null}
      </div>

      {helperText ? <p id="referral-hospital-helper" className="text-xs font-semibold leading-relaxed text-slate-400">{helperText}</p> : null}
    </div>
  );
}
