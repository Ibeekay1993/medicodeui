import type { RefObject } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Plus, CheckCircle2, X, User } from "lucide-react";
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
  patientRef: RefObject<HTMLDivElement>;
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
  const isNoEmail =
    patientEmail === "no-email@ronsbergerhmo.io" ||
    patientEmail.startsWith("no-email@") ||
    patientEmail.endsWith("@medicode.com");

  const selectPatient = (p: any) => {
    setSelectedPatient(p);
    setPatientOpen(false);
    setPatientSearch("");
  };

  return (
    <div className="p-4 sm:p-5 space-y-3.5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div>
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-emerald-600" /> Patient Identification
          </h3>
          <p className="text-[11px] text-slate-500">Search enrollee registry or verify active policy</p>
        </div>
      </div>

      {/* Search input */}
      <div className="space-y-1">
        <Label htmlFor="patient-search-input" className="text-xs font-semibold text-slate-700">
          Search Enrollee by Name or Policy Number
        </Label>
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
            className="h-9 sm:h-10 rounded-lg bg-white border border-slate-200 pr-9 text-xs placeholder:text-slate-400"
          />
          <div className="absolute right-3 top-2.5 pointer-events-none">
            {patientLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : (
              <Search className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
        <Dropdown anchorRef={patientRef} open={patientOpen && !selectedPatient} onClose={() => setPatientOpen(false)}>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {patientResults.map((p, i) => (
              <button
                type="button"
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectPatient(p);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors group flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-semibold text-slate-900 group-hover:text-emerald-700">{p.full_name}</p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {p.beneficiary_number || p.policy_number}
                    {p.beneficiary_number && p.beneficiary_number !== p.policy_number && (
                      <span className="ml-1.5 text-slate-400">Family {p.policy_number}</span>
                    )}
                  </p>
                </div>
                <Plus className="h-3.5 w-3.5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </Dropdown>
      </div>

      {/* Selected patient display */}
      {selectedPatient ? (
        <div className="flex items-center justify-between bg-slate-50 border border-slate-300 rounded-lg p-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{selectedPatient.full_name}</p>
              <p className="text-[11px] font-mono text-slate-800 font-semibold mt-0.5">
                Policy: {selectedPatient.policy_number}
                {selectedPatient.beneficiary_number && selectedPatient.beneficiary_number !== selectedPatient.policy_number && (
                  <span className="ml-1 text-slate-600 font-medium">· ID: {selectedPatient.beneficiary_number}</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedPatient(null)}
            className="text-slate-500 hover:text-rose-600 transition-colors ml-2 shrink-0 p-1"
            aria-label={`Deselect patient ${selectedPatient.full_name}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="h-9 flex items-center px-3 rounded-lg bg-slate-50 border border-dashed border-slate-300">
          <p className="text-xs text-slate-600 font-medium">No enrollee selected yet</p>
        </div>
      )}

      {/* Phone */}
      <div className="space-y-1">
        <Label htmlFor="phone-input" className="text-xs font-semibold text-slate-700">
          Phone Number <span className="text-rose-500">*</span>
        </Label>
        <Input
          id="phone-input"
          placeholder="e.g. 08012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-9 sm:h-10 rounded-lg bg-white border border-slate-200 text-xs placeholder:text-slate-400"
        />
      </div>

      {/* Patient Email */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <Label htmlFor="email-input" className="text-xs font-semibold text-slate-700">
            Patient Email <span className="text-rose-500">*</span>
          </Label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer w-fit group">
              <div
                className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 ease-in-out shadow-inner"
                style={{ backgroundColor: isNoEmail ? '#334155' : '#cbd5e1' }}
              >
                <input 
                  type="checkbox" 
                  className="peer sr-only"
                  checked={isNoEmail}
                  onChange={(e) => {
                    const val = e.target.checked;
                    if (val) {
                      setPatientEmail("no-email@ronsbergerhmo.io");
                    } else if (isNoEmail) {
                      setPatientEmail("");
                    }
                  }}
                />
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out shadow-xs ${isNoEmail ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[11px] font-medium text-slate-600 select-none">No email (use WhatsApp SMS PIN)</span>
            </label>
          </div>
        </div>
        
        {!isNoEmail ? (
          <>
            <Input
              id="email-input"
              type="email"
              placeholder="patient@email.com"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              aria-describedby="email-input-description"
              className="h-9 sm:h-10 rounded-lg bg-white border border-slate-200 text-xs placeholder:text-slate-400"
            />
            <p id="email-input-description" className="text-xs font-medium text-slate-600">
              Arrival and Treatment PIN will be emailed directly to this address.
            </p>
          </>
        ) : (
          <div className="h-9 flex items-center px-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 font-medium text-xs">
            No email provided. The verification PIN will be sent via WhatsApp to the phone number.
          </div>
        )}
      </div>
    </div>
  );
}
