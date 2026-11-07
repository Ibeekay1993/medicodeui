import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Edit3, Search, UserCog, ShieldCheck, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { availableRoles, filterHospitals, prettyDateTime, roleLabel } from "@/lib/user-helpers";

const ROLE_METADATA: Record<string, { summary: string; permissions: string[]; badgeClass: string }> = {
  admin: {
    summary: "Full platform administration authority",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    permissions: [
      "Manage all users, credentials, and roles",
      "Configure global security, MFA, and system policies",
      "Full oversight of authorizations, claims queues, and batches",
    ],
  },
  utilization_manager_lead: {
    summary: "Elevated clinical leader with unlock and override powers",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold",
    permissions: [
      "Unlock locked authorization records",
      "Resolve permanent record deletion requests",
      "Upload and update NHIS master beneficiary lists",
      "Process and adjudicate clinical pre-authorizations",
    ],
  },
  utilization_manager: {
    summary: "Clinical reviewer for pre-authorization requests",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
    permissions: [
      "Review incoming medical authorization requests",
      "Approve, decline, or partially approve services",
      "Request clinical clarifications from hospitals",
    ],
  },
  claims: {
    summary: "Claims auditor for medical billing adjudication",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    permissions: [
      "Audit submitted hospital invoices against approved codes",
      "Validate diagnosis against standard tariff schedules",
      "Contest or approve claim lines for payment",
      "Claims Lead: Override completed decisions and unlock claims for re-audit",
    ],
  },
  finance: {
    summary: "Remittance and payment execution officer",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    permissions: [
      "Assemble and create payment batches for hospitals",
      "Upload bank transaction evidence and remittance advice",
      "Reconcile payment settlements and financial ledgers",
    ],
  },
  hospital: {
    summary: "Hospital facility account (strictly tenant-isolated)",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    permissions: [
      "Submit pre-authorization requests for assigned facility",
      "Submit claim invoices and monitor payment status",
      "Strictly isolated: cannot view other hospitals' records",
    ],
  },
};

interface EditUserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  user: any | null;
  hospitals: any[];
  loadingHospitals: boolean;
  onSuccess: () => void;
}

export function EditUserModal({
  isOpen,
  onOpenChange,
  user,
  hospitals,
  loadingHospitals,
  onSuccess,
}: EditUserModalProps) {
  const { toast } = useToast();
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "",
    hospital_id: "",
    is_team_lead: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [editHospitalSearch, setEditHospitalSearch] = useState("");
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);

  const editHospitalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editHospitalRef.current && !editHospitalRef.current.contains(event.target as Node)) {
        setEditDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (user) {
      setEditForm({
        full_name: user.full_name || "",
        email: user.email || "",
        phone: user.phone || "",
        role: user.role || "utilization_manager",
        hospital_id: user.hospital_id || "",
        is_team_lead: Boolean(user.is_team_lead),
      });
      const matched = hospitals.find((h) => h.id === user.hospital_id);
      setEditHospitalSearch(matched ? (matched.code ? `${matched.name} - ${matched.code}` : matched.name) : "");
    } else {
      setEditForm({
        full_name: "",
        email: "",
        phone: "",
        role: "utilization_manager",
        hospital_id: "",
        is_team_lead: false,
      });
      setEditHospitalSearch("");
      setEditDropdownOpen(false);
    }
  }, [user, hospitals]);

  const handleSaveEdit = async () => {
    if (!user) return;
    if (editForm.role === "hospital" && !editForm.hospital_id) {
      toast({
        variant: "destructive",
        title: "Hospital Assignment Required",
        description: "Please assign a hospital facility to this hospital user account.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        method: "PATCH",
        body: {
          action: "update",
          user_id: user.user_id,
          id: user.id,
          ...editForm,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || "User update failed.");
      toast({ title: "User Updated", description: "Profile and role changes saved successfully." });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      const message = String(e?.message || "");
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: /user_roles_one_lead_per_team_idx|duplicate key/i.test(message)
          ? "A lead is already assigned to this team. Update or remove the current lead first."
          : message || "The admin user service could not update this account.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const currentRole = user?.role || "unassigned";
  const isRoleChanging = Boolean(user && editForm.role && editForm.role !== currentRole);
  const selectedMeta = ROLE_METADATA[editForm.role] || null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[480px] p-0 overflow-hidden border border-slate-200">
        <DialogHeader className="bg-slate-50/80 px-6 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <UserCog className="h-4 w-4 text-[#0F6E56]" /> Edit User Profile & Permissions
            </DialogTitle>
            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-white">
              {roleLabel(currentRole)}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-slate-500 mt-1">
            Update account identity, assign system role, or bind to a healthcare facility.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Role Upgrade Notice if changing */}
          {isRoleChanging && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-200 bg-emerald-50/70 text-xs text-emerald-900 animate-in fade-in duration-200">
              <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
              <div className="leading-snug">
                <span className="font-bold">Role Upgrade/Transition: </span>
                <span className="font-semibold text-slate-700">{roleLabel(currentRole)}</span>
                <ArrowRight className="inline-block h-3 w-3 mx-1 text-emerald-700" />
                <span className="font-bold text-emerald-800">{roleLabel(editForm.role)}</span>
              </div>
            </div>
          )}

          {/* Identity Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Full Name</label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="e.g. Dr. John Doe"
                className="h-9 rounded-lg text-xs font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email Address</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="name@organization.com"
                className="h-9 rounded-lg text-xs font-medium"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Phone Number</label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="e.g. 08012345678"
                className="h-9 rounded-lg text-xs font-medium"
              />
            </div>
          </div>

          {/* Role Selection */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">System Role</label>
            <Select
              value={editForm.role}
              onValueChange={(v) =>
                setEditForm({
                  ...editForm,
                  role: v,
                  is_team_lead: ["hospital", "claims", "finance"].includes(v) ? editForm.is_team_lead : false,
                  hospital_id: v === "hospital" ? editForm.hospital_id : "",
                })
              }
            >
              <SelectTrigger aria-label="System role" className="h-9 rounded-lg text-xs font-semibold bg-white border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {availableRoles.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs font-medium py-2">
                    <div className="font-semibold text-slate-900">{option.label}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Selected Role Capabilities Summary */}
            {selectedMeta && (
              <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{selectedMeta.summary}</span>
                  <Badge variant="outline" className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${selectedMeta.badgeClass}`}>
                    {roleLabel(editForm.role)}
                  </Badge>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-600">
                  {selectedMeta.permissions.map((perm, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span>{perm}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Team Lead Toggle */}
          {["hospital", "claims", "finance"].includes(editForm.role) && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50/50 transition-colors">
              <Checkbox
                checked={editForm.is_team_lead}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_team_lead: checked === true })}
                aria-label="Assign as team lead"
                className="mt-0.5 text-brand-700"
              />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-800">
                  {editForm.role === "claims" ? "Assign as Claims Lead" : editForm.role === "finance" ? "Assign as Finance Lead" : "Assign as Hospital Lead"}
                </span>
                <span className="block text-[11px] text-slate-500 leading-snug">
                  {editForm.role === "claims"
                    ? "Grants supervisor authority to override finalized claim decisions, unlock locked claims for re-audit, and settle tariff discrepancies."
                    : editForm.role === "finance"
                    ? "Designates this officer as the finance team lead with disbursement authorization authority."
                    : "Designates this user as the hospital facility lead."}
                </span>
              </span>
            </label>
          )}

          {/* Hospital Facility Binding */}
          {editForm.role === "hospital" && (
            <div ref={editHospitalRef} className="space-y-1 pt-1 border-t border-slate-100">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Assigned Hospital Facility <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={editHospitalSearch}
                  onChange={(e) => {
                    setEditHospitalSearch(e.target.value);
                    setEditDropdownOpen(true);
                    if (editForm.hospital_id) {
                      setEditForm({ ...editForm, hospital_id: "" });
                    }
                  }}
                  onFocus={() => setEditDropdownOpen(true)}
                  placeholder="Search facility name or code..."
                  className="pl-8 h-9 rounded-lg text-xs font-semibold"
                />
                {editForm.hospital_id && (
                  <Badge
                    variant="outline"
                    className="absolute right-2.5 top-2 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-black uppercase"
                  >
                    Linked
                  </Badge>
                )}
              </div>
              {editDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm({ ...editForm, hospital_id: "" });
                      setEditHospitalSearch("");
                      setEditDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-xs font-bold text-rose-500 hover:bg-rose-50"
                  >
                    Clear Facility Assignment
                  </button>
                  {loadingHospitals ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 font-semibold">
                      <Loader2 className="h-3 w-3 animate-spin text-[#0F6E56]" />
                      Loading hospitals...
                    </div>
                  ) : (
                    <>
                      {filterHospitals(hospitals, editHospitalSearch)
                        .slice(0, 10)
                        .map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => {
                              setEditForm({ ...editForm, hospital_id: h.id });
                              setEditHospitalSearch(h.code ? `${h.name} - ${h.code}` : h.name);
                              setEditDropdownOpen(false);
                            }}
                            className="flex w-full flex-col rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors"
                          >
                            <span className="font-semibold text-slate-900">{h.name}</span>
                            {h.code && <span className="text-[10px] text-slate-400 font-mono">{h.code}</span>}
                          </button>
                        ))}
                      {filterHospitals(hospitals, editHospitalSearch).length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-400 font-semibold">
                          No matching hospitals found
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Last modified</span>
            <span className="font-mono text-slate-600">{prettyDateTime(user?.updated_at)}</span>
          </div>
        </div>

        <DialogFooter className="bg-slate-50/80 px-6 py-3 border-t border-slate-100 gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs h-8">
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={isSaving}
            size="sm"
            className="bg-[#0F6E56] hover:bg-[#0a5242] text-white text-xs font-bold h-8 px-4 rounded-lg shadow-sm"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Edit3 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
