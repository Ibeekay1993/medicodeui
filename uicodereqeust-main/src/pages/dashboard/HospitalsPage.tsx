import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building2, Download, Edit3, Link2, Loader2, MoreVertical, Plus, Power, Save, Search, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { DataPagination } from "@/components/dashboard/DataPagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export default function HospitalsPage() {
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [linking, setLinking] = useState<any | null>(null);
  const [hospitalUsers, setHospitalUsers] = useState<any[]>([]);
  const [newHosp, setNewHosp] = useState(emptyHospital);
  const { toast } = useToast();

  const fetchHospitals = useCallback(async () => {
    setLoading(true);
    try {
      const allHospitals: any[] = [];
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
      setHospitals(allHospitals);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: getErrorMessage(error, "Unable to load hospitals") });
      setHospitals([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchHospitals();
    supabase
      .from("user_roles")
      .select("user_id, full_name, email, role")
      .eq("role", "hospital")
      .order("full_name")
      .then(({ data }) => setHospitalUsers(data || []));
  }, [fetchHospitals]);

  useTabVisibilityRefresh(fetchHospitals);

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
    fetchHospitals();
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
    fetchHospitals();
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
    fetchHospitals();
  };

  const deleteHospital = async (hospital: any) => {
    if (!window.confirm(`Delete ${hospital.name}? This should only be used for duplicate or erroneous hospital records.`)) return;
    const { error } = await supabase.from("hospitals").delete().eq("id", hospital.id);
    if (error) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
      return;
    }
    toast({ title: "Hospital Deleted", description: hospital.name });
    fetchHospitals();
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
    fetchHospitals();
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
              <DialogContent className="rounded-xl sm:max-w-[460px]">
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
                <th className="px-4 py-3"><input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} aria-label="Select page" /></th>
                <th className="px-4 py-3">Hospital Details</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Contact info</th>
                <th className="px-4 py-3">Status & Users</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs text-slate-600">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#93c34b]" /> Loading hospitals...</td></tr>
              ) : paginatedHospitals.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500"><Building2 className="mx-auto mb-3 h-7 w-7 text-slate-300" /> No hospitals found.</td></tr>
              ) : paginatedHospitals.map((hospital) => {
                const active = hospital.is_active !== false;
                const usersLinked = hospital.user_id ? 1 : 0;
                return (
                  <tr key={hospital.id} className="group transition hover:bg-slate-50/50 h-14">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(hospital.id)}
                        onChange={(event) => setSelectedIds((prev) => event.target.checked ? [...prev, hospital.id] : prev.filter((id) => id !== hospital.id))}
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
                      <div className="font-mono text-slate-500 text-xs truncate" title={hospital.email}>{hospital.email || "No email"}</div>
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
                          <DropdownMenuItem onClick={() => setEditing(hospital)} className="cursor-pointer text-slate-700">
                            <Edit3 className="mr-2 h-3.5 w-3.5" /> Edit Hospital
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLinking(hospital)} className="cursor-pointer text-slate-700">
                            <Link2 className="mr-2 h-3.5 w-3.5" /> Link Login
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHospitalActive([hospital.id], !active)} className="cursor-pointer text-slate-700">
                            <Power className="mr-2 h-3.5 w-3.5 text-amber-600" /> {active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteHospital(hospital)} className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
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
          {loading ? (
            <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#93c34b]" /> Loading hospitals...</div>
          ) : paginatedHospitals.length === 0 ? (
            <div className="p-8 text-center text-slate-400 uppercase tracking-widest text-xs font-bold">No hospitals found</div>
          ) : paginatedHospitals.map((hospital) => {
            const active = hospital.is_active !== false;
            return (
              <div key={hospital.id} className="relative p-4 hover:bg-slate-50/50 transition-colors">
                <div className="pr-28 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(hospital.id)}
                      onChange={(event) => setSelectedIds((prev) => event.target.checked ? [...prev, hospital.id] : prev.filter((id) => id !== hospital.id))}
                      aria-label={`Select ${hospital.name}`}
                      className="rounded h-4 w-4"
                    />
                    <span className="text-base font-semibold text-slate-900 truncate uppercase leading-tight">{hospital.name}</span>
                  </div>
                  <div className="text-sm text-slate-500 font-normal space-y-0.5">
                    <p className="font-mono text-xs text-slate-400">Code: {hospital.code}</p>
                    <p className="font-mono truncate" title={hospital.email}>{hospital.email || "No email"}</p>
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
                      <DropdownMenuItem onClick={() => setEditing(hospital)} className="cursor-pointer text-slate-700">
                        <Edit3 className="mr-2 h-3.5 w-3.5" /> Edit Hospital
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLinking(hospital)} className="cursor-pointer text-slate-700">
                        <Link2 className="mr-2 h-3.5 w-3.5" /> Link Login
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setHospitalActive([hospital.id], !active)} className="cursor-pointer text-slate-700">
                        <Power className="mr-2 h-3.5 w-3.5 text-amber-600" /> {active ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteHospital(hospital)} className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Facility
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        <DataPagination page={page} totalPages={totalPages} start={start} end={end} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="rounded-xl sm:max-w-[460px]">
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
        <DialogContent className="rounded-xl sm:max-w-[425px]">
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
    </div>
  );
}
