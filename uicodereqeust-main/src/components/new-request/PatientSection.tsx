import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Plus, CheckCircle2, X } from "lucide-react";
import Dropdown from "./Dropdown";

interface PatientSectionProps {
  selectedPatient: any | null;
  setSelectedPatient: (patient: any | null) => void;
  patientSearch: string;
  setPatientSearch: (val: string) => void;
  patientLoading: boolean;
  patientResults: any[];
  patientOpen: boolean;
  setPatientOpen: (open: boolean) => void;
  phone: string;
  setPhone: (val: string) => void;
  patientEmail: string;
  setPatientEmail: (val: string) => void;
  patientRef: React.RefObject<HTMLDivElement>;
}

export default function PatientSection({
  selectedPatient,
  setSelectedPatient,
  patientSearch,
  setPatientSearch,
  patientLoading,
  patientResults,
  patientOpen,
  setPatientOpen,
  phone,
  setPhone,
  patientEmail,
  setPatientEmail,
  patientRef
}: PatientSectionProps) {
  const selectPatient = (p: any) => {
    setSelectedPatient(p);
    setPatientOpen(false);
    setPatientSearch("");
  };

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Patient</p>

      {/* Search input */}
      <div className="space-y-1.5">
        <Label htmlFor="patient-search-input" className="text-xs font-semibold text-slate-500">Search by Name or Policy Number</Label>
        <div ref={patientRef} className="relative">
          <Input
            id="patient-search-input"
            placeholder="Type at least 3 characters to search..."
            value={selectedPatient ? selectedPatient.policy_number : patientSearch}
            onChange={(e) => {
              if (selectedPatient) setSelectedPatient(null);
              setPatientSearch(e.target.value);
            }}
            onFocus={() => patientResults.length > 0 && setPatientOpen(true)}
            className="h-12 rounded-xl bg-slate-50 border border-slate-200 pr-10 text-sm placeholder:text-slate-300 placeholder:text-xs"
          />
          <div className="absolute right-3 top-3.5 pointer-events-none">
            {patientLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            ) : (
              <Search className="h-4 w-4 text-slate-300" />
            )}
          </div>
        </div>
        <Dropdown anchorRef={patientRef} open={patientOpen && !selectedPatient} onClose={() => setPatientOpen(false)}>
          <div className="divide-y divide-slate-50">
            {patientResults.map((p, i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectPatient(p);
                }}
                className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors group flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700">{p.full_name}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">{p.policy_number}</p>
                </div>
                <Plus className="h-4 w-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </Dropdown>
      </div>

      {/* Selected patient display */}
      {selectedPatient ? (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-black text-emerald-900">{selectedPatient.full_name}</p>
              <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                {selectedPatient.policy_number}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedPatient(null)}
            className="text-emerald-300 hover:text-rose-500 transition-colors ml-3"
            aria-label={`Deselect patient ${selectedPatient.full_name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="h-12 flex items-center px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
          <p className="text-xs text-slate-300 italic">Patient name will appear here after selection</p>
        </div>
      )}

      {/* Phone */}
      <div className="space-y-1.5">
        <Label htmlFor="phone-input" className="text-xs font-semibold text-slate-500">Phone Number</Label>
        <Input
          id="phone-input"
          placeholder="e.g. 08012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-300 placeholder:text-xs"
        />
      </div>

      {/* Patient Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email-input" className="text-xs font-semibold text-slate-500">
          Patient Email <span className="text-rose-500">*</span>
        </Label>
        <Input
          id="email-input"
          type="email"
          placeholder="patient@email.com"
          value={patientEmail}
          onChange={(e) => setPatientEmail(e.target.value)}
          aria-describedby="email-input-description"
          className="h-12 rounded-xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-300 placeholder:text-xs"
        />
        <p id="email-input-description" className="text-xs font-semibold text-slate-400">
          An OTP will be sent to this email for patient verification.
        </p>
      </div>
    </div>
  );
}
