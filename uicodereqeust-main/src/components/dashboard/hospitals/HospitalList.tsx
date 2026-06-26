import { Loader2, Building2, Edit3, Link2, MoreVertical, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type HospitalRow = Database["public"]["Tables"]["hospitals"]["Row"];

interface HospitalListProps {
  hospitals: HospitalRow[];
  loading: boolean;
  selectedIds: string[];
  allPageSelected: boolean;
  onSelectId: (id: string, checked: boolean) => void;
  onSelectAllPage: () => void;
  onEdit: (hospital: HospitalRow) => void;
  onLink: (hospital: HospitalRow) => void;
  onToggleActive: (hospital: HospitalRow, newActiveState: boolean) => void;
  onDelete: (hospital: HospitalRow) => void;
  linkedUserFor: (hospital: HospitalRow) => string | undefined;
}

const statusPill = (active: boolean) => active
  ? "border-[#5DCAA5] bg-[#E1F5EE] text-[#93c34b]"
  : "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]";

export function HospitalList({
  hospitals,
  loading,
  selectedIds,
  allPageSelected,
  onSelectId,
  onSelectAllPage,
  onEdit,
  onLink,
  onToggleActive,
  onDelete,
  linkedUserFor
}: HospitalListProps) {
  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 w-full">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#93c34b]" /> Loading hospitals...
      </div>
    );
  }

  if (hospitals.length === 0) {
    return (
      <div className="p-12 text-center text-slate-500 w-full">
        <Building2 className="mx-auto mb-3 h-7 w-7 text-slate-300" /> No hospitals found.
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden lg:block w-full">
        <table className="w-full text-left table-fixed border-collapse">
          <colgroup>
            <col className="w-[5%]" />
            <col className="w-[25%]" />
            <col className="w-[25%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[5%]" />
          </colgroup>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3"><input type="checkbox" checked={allPageSelected} onChange={onSelectAllPage} aria-label="Select page" /></th>
              <th className="px-4 py-3">Hospital Details</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Contact info</th>
              <th className="px-4 py-3">Status & Users</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs text-slate-600">
            {hospitals.map((hospital) => {
              const active = hospital.is_active !== false;
              const usersLinked = hospital.user_id ? 1 : 0;
              return (
                <tr key={hospital.id} className="group transition hover:bg-slate-50/50 h-14">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(hospital.id)}
                      onChange={(e) => onSelectId(hospital.id, e.target.checked)}
                      aria-label={`Select ${hospital.name}`}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-900 leading-snug">{hospital.name}</div>
                    <div className="font-mono text-xs text-slate-400 mt-0.5">{hospital.code}</div>
                  </td>
                  <td className="px-4 py-2.5 break-words whitespace-normal leading-tight">
                    <div className="text-slate-700 text-xs">{hospital.address || "No address listed"}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{hospital.state || "No state listed"}</div>
                  </td>
                  <td className="px-4 py-2.5 leading-tight">
                    <div className="font-mono text-slate-500 text-xs truncate" title={hospital.email || ""}>{hospital.email || "No email"}</div>
                    {hospital.phone && <div className="text-slate-400 text-xs mt-0.5">{hospital.phone}</div>}
                  </td>
                  <td className="px-4 py-2.5 leading-tight">
                    <div><span className={cn("med-status-pill text-xs py-0.5 px-2", statusPill(active))}>{active ? "ACTIVE" : "INACTIVE"}</span></div>
                    <div className="text-xs text-slate-400 mt-1">Users: {usersLinked} ({linkedUserFor(hospital) || "Unlinked"})</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => onEdit(hospital)} className="cursor-pointer text-slate-700">
                          <Edit3 className="mr-2 h-3.5 w-3.5" /> Edit Hospital
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onLink(hospital)} className="cursor-pointer text-slate-700">
                          <Link2 className="mr-2 h-3.5 w-3.5" /> Link Login
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleActive(hospital, !active)} className="cursor-pointer text-slate-700">
                          <Power className="mr-2 h-3.5 w-3.5 text-amber-600" /> {active ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(hospital)} className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Facility
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Layout View */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {hospitals.map((hospital) => {
          const active = hospital.is_active !== false;
          return (
            <div key={hospital.id} className="relative p-4 hover:bg-slate-50/50 transition-colors">
              <div className="pr-28 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(hospital.id)}
                    onChange={(e) => onSelectId(hospital.id, e.target.checked)}
                    aria-label={`Select ${hospital.name}`}
                    className="rounded h-4 w-4"
                  />
                  <span className="text-base font-semibold text-slate-900 truncate uppercase leading-tight">{hospital.name}</span>
                </div>
                <div className="text-sm text-slate-500 font-normal space-y-0.5">
                  <p className="font-mono text-xs text-slate-400">Code: {hospital.code}</p>
                  <p className="font-mono truncate" title={hospital.email || ""}>{hospital.email || "No email"}</p>
                  {hospital.phone && <p>{hospital.phone}</p>}
                </div>
                <div className="text-xs text-slate-400 truncate leading-none">
                  {hospital.address || "No address"}{hospital.state ? `, ${hospital.state}` : ""}
                </div>
              </div>
              
              <div className="absolute top-4 right-4 flex items-center gap-1.5 shrink-0">
                <span className={cn("med-status-pill text-xs py-0.5 px-2 font-bold", statusPill(active))}>{active ? "ACTIVE" : "INACTIVE"}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onEdit(hospital)} className="cursor-pointer text-slate-700">
                      <Edit3 className="mr-2 h-3.5 w-3.5" /> Edit Hospital
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onLink(hospital)} className="cursor-pointer text-slate-700">
                      <Link2 className="mr-2 h-3.5 w-3.5" /> Link Login
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onToggleActive(hospital, !active)} className="cursor-pointer text-slate-700">
                      <Power className="mr-2 h-3.5 w-3.5 text-amber-600" /> {active ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(hospital)} className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                      <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Facility
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
