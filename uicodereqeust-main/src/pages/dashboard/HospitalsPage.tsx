import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type HospitalRow = Database["public"]["Tables"]["hospitals"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Download, Edit3, Link2, Loader2, MoreVertical, Plus, Power, Save, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { HospitalList } from "@/components/dashboard/hospitals/HospitalList";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River",
  "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
  "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara"
];

const emptyHospital = { name: "", code: "", email: "", address: "", phone: "", state: "" };
const statusPill = (active: boolean) => active
  ? "border-[#5DCAA5] bg-[#E1F5EE] text-[#93c34b]"
  : "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]";

const HospitalForm = ({ value, onChange }: { value: any; onChange: (next: any) => void }) => (
  <div className="grid gap-4 py-3">
    <Input value={value.name || ""} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Hospital name" className="h-10 rounded-lg" />
    <div className="grid gap-3 sm:grid-cols-2">
      <Input value={value.code || ""} onChange={(e) => onChange({ ...value, code: e.target.value })} placeholder="Provider code" className="h-10 rounded-lg" />
      <Select value={value.state || ""} onValueChange={(state) => onChange({ ...value, state })}>
        <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="State" /></SelectTrigger>
        <SelectContent>{NIGERIAN_STATES.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <Input type="email" value={value.email || ""} onChange={(e) => onChange({ ...value, email: e.target.value })} placeholder="Contact email" className="h-10 rounded-lg" />
    <Input value={value.phone || ""} onChange={(e) => onChange({ ...value, phone: e.target.value })} placeholder="Phone number" className="h-10 rounded-lg" />
    <Input value={value.address || ""} onChange={(e) => onChange({ ...value, address: e.target.value })} placeholder="Full address / LGA" className="h-10 rounded-lg" />
  </div>
);

export default function HospitalsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [linking, setLinking] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [newHosp, setNewHosp] = useState(emptyHospital);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: hospitals = [], isLoading: loading, refetch: fetchHospitals } = useQuery({
    queryKey: ["hospitals"],
    queryFn: async () => {
      const allHospitals: HospitalRow[] = [];
      const PAGE_SIZE = 1000;
      for (let from = 0; ; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from("hospitals")
          .select("*")
          .order("name")
          .range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allHospitals.push(...data);
        if (data.length < PAGE_SIZE) break;
      }
      return allHospitals;
    }
  });

  const { data: hospitalUsers = [] } = useQuery({
    queryKey: ["hospital-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, full_name, email, role")
        .eq("role", "hospital")
        .order("full_name");
      if (error) throw error;
      return data as UserRoleRow[];
    }
  });

  useTabVisibilityRefresh(() => fetchHospitals());

  const filtered = useMemo(() => hospitals.filter((hospital) => {
    const active = hospital.is_active !== false;
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? active : !active);
    const matchesSearch = [hospital.name, hospital.code, hospital.email, hospital.phone, hospital.state, hospital.address]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  }), [hospitals, search, statusFilter]);

  const { page, setPage, pageSize, totalPages, pageItems: paginatedHospitals, start, end, total } = useDataPagination(filtered, 10, 25);
  const selectedHospitals = hospitals.filter((hospital) => selectedIds.includes(hospital.id));
  const allPageSelected = paginatedHospitals.length > 0 && paginatedHospitals.every((hospital) => selectedIds.includes(hospital.id));
  const linkedUserFor = (hospital: any) => hospital.user_id ? (hospitalUsers.find((user) => user.user_id === hospital.user_id)?.full_name || hospital.user_id) : "No user linked";

  const resetNewHospital = () => setNewHosp(emptyHospital);

  const handleAddHospital = async () => {
    if (!newHosp.name || !newHosp.code) {
      toast({ variant: "destructive", title: "Missing Info", description: "Name and provider code are required." });
      return;
    }
    const { error } = await supabase.from("hospitals").insert([newHosp]);
    if (error) {
      toast({ variant: "destructive", title: "Creation Failed", description: error.message });
      return;
    }
    toast({ title: "Hospital Added", description: `${newHosp.name} is now in the registry.` });
    setIsAdding(false);
    resetNewHospital();
    queryClient.invalidateQueries({ queryKey: ["hospitals"] });
  };

  const handleUpdateHospital = async () => {
    if (!editing?.id || !editing.name || !editing.code) {
      toast({ variant: "destructive", title: "Missing Info", description: "Name and provider code are required." });
      return;
    }
    const updates = {
      name: editing.name,
      code: editing.code,
      email: editing.email,
      address: editing.address,
      phone: editing.phone,
      state: editing.state,
      is_active: editing.is_active !== false,
    };
    const { error } = await supabase.from("hospitals").update(updates).eq("id", editing.id);
    if (error) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
      return;
    }
    toast({ title: "Hospital Updated", description: `${editing.name} has been saved.` });
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["hospitals"] });
  };

  const setHospitalActive = async (hospitalIds: string[], active: boolean) => {
    if (hospitalIds.length === 0) return;
    const { error } = await supabase.from("hospitals").update({ is_active: active }).in("id", hospitalIds);
    if (error) {
      toast({ variant: "destructive", title: "Status Update Failed", description: error.message });
      return;
    }
    setSelectedIds([]);
    toast({ title: active ? "Hospitals Activated" : "Hospitals Deactivated", description: `${hospitalIds.length} record(s) updated.` });
    queryClient.invalidateQueries({ queryKey: ["hospitals"] });
  };

  const deleteHospital = (hospital: any) => {
    setDeleteTarget(hospital);
    setDeleteConfirmText("");
  };

  const executeDelete = async () => {
    if (!deleteTarget || deleteConfirmText.toLowerCase() !== "delete") return;
    const { error } = await supabase.from("hospitals").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
      return;
    }
    toast({ title: "Hospital Deleted", description: deleteTarget.name });
    queryClient.invalidateQueries({ queryKey: ["hospitals"] });
    setDeleteTarget(null);
    setDeleteConfirmText("");
  };

  const linkHospitalUser = async (userId: string | null) => {
    if (!linking?.id) return;
    const { error } = await supabase.from("hospitals").update({ user_id: userId }).eq("id", linking.id);
    if (error) {
      toast({ variant: "destructive", title: "Link Failed", description: error.message });
      return;
    }
    toast({ title: userId ? "Login User Linked" : "Login User Unlinked", description: linking.name });
    setLinking(null);
    queryClient.invalidateQueries({ queryKey: ["hospitals"] });
  };

  const exportCsv = () => {
    const rows = [
      ["Hospital Name", "Provider Code", "Location", "Contact Email", "Phone", "Status", "Linked User"],
      ...filtered.map((hospital) => [
        hospital.name,
        hospital.code,
        [hospital.address, hospital.state].filter(Boolean).join(", "),
        hospital.email || "",
        hospital.phone || "",
        hospital.is_active !== false ? "Active" : "Inactive",
        linkedUserFor(hospital),
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RonsbergerHMO_Hospitals_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePageSelection = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !paginatedHospitals.some((hospital) => hospital.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...paginatedHospitals.map((hospital) => hospital.id)])));
    }
  };


  return (
    <div className="space-y-4 max-w-full overflow-x-hidden pb-10 animate-in fade-in duration-500">
      <div className="pb-3 border-b border-slate-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv} className="h-8 rounded-lg gap-2 text-xs"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
            <Dialog open={isAdding} onOpenChange={setIsAdding}>
              <DialogTrigger asChild>
                <Button className="med-button-primary h-8 text-xs"><Plus className="h-3.5 w-3.5" /> Add Hospital</Button>
              </DialogTrigger>
              <DialogContent className="rounded-xl sm:max-w-[460px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">New Hospital</DialogTitle>
                  <DialogDescription>Enter facility details for the hospital registry.</DialogDescription>
                </DialogHeader>
                <HospitalForm value={newHosp} onChange={setNewHosp} />
                <DialogFooter>
                  <Button onClick={handleAddHospital} className="med-button-primary w-full"><Save className="h-4 w-4" /> Save Hospital</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="med-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search hospitals..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-lg border-slate-200 pl-9 text-sm" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 text-sm sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedHospitals.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-500">{selectedHospitals.length} selected</span>
              <Button variant="outline" onClick={() => setHospitalActive(selectedIds, true)} className="h-9 rounded-lg">Activate</Button>
              <Button variant="outline" onClick={() => setHospitalActive(selectedIds, false)} className="h-9 rounded-lg">Deactivate</Button>
            </div>
          )}
        </div>
      </div>

      <div className="med-card overflow-hidden">
        <HospitalList
          hospitals={paginatedHospitals}
          loading={loading}
          selectedIds={selectedIds}
          allPageSelected={allPageSelected}
          onSelectId={(id, checked) => setSelectedIds((prev) => checked ? [...prev, id] : prev.filter(i => i !== id))}
          onSelectAllPage={togglePageSelection}
          onEdit={setEditing}
          onLink={setLinking}
          onToggleActive={(hospital, active) => setHospitalActive([hospital.id], active)}
          onDelete={deleteHospital}
          linkedUserFor={linkedUserFor}
        />


        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="rounded-xl sm:max-w-[460px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Edit Hospital</DialogTitle>
            <DialogDescription>Update facility details and active status.</DialogDescription>
          </DialogHeader>
          {editing && <HospitalForm value={editing} onChange={setEditing} />}
          <DialogFooter>
            <Button onClick={handleUpdateHospital} className="med-button-primary w-full"><Save className="h-4 w-4" /> Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linking} onOpenChange={(open) => !open && setLinking(null)}>
        <DialogContent className="rounded-xl sm:max-w-[425px] max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Link Login User</DialogTitle>
            <DialogDescription>Connect a hospital record to a Hospital Admin login account.</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <Select value={linking?.user_id || "none"} onValueChange={(value) => linkHospitalUser(value === "none" ? null : value)}>
              <SelectTrigger className="h-10 rounded-lg"><SelectValue placeholder="Select hospital user" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked user</SelectItem>
                {hospitalUsers.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>
                    {user.full_name || user.email || user.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600">Delete Hospital?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. This should only be used for duplicate or erroneous records. 
              To confirm, type <strong>delete</strong> below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input 
            value={deleteConfirmText} 
            onChange={e => setDeleteConfirmText(e.target.value)} 
            placeholder="Type delete to confirm" 
            className="mt-4"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                executeDelete();
              }}
              disabled={deleteConfirmText.toLowerCase() !== "delete"}
              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
            >
              Delete Hospital
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
