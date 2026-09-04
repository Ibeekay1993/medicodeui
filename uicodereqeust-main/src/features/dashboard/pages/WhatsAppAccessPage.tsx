import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Loader2, MessageSquare, Pencil, Phone, Plus, Search, ShieldOff, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const normalizePhone = (raw: string) => {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = "234" + digits.slice(1);
  if (digits.length === 10) digits = "234" + digits;
  return digits;
};

type Hospital = { id: string; name: string; code?: string | null; is_active?: boolean | null };
type Contact = {
  id: string;
  hospital_id: string;
  phone_number: string;
  contact_name: string | null;
  contact_role: string | null;
  status: "pending" | "active" | "disabled";
  created_at: string;
  updated_at: string;
  hospital?: { name: string } | null;
};

export default function WhatsAppAccessPage() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ hospital_id: "", phone_number: "", contact_name: "", contact_role: "", status: "pending" });

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: hospitalData, error: hospitalError }, { data: contactData, error: contactError }] = await Promise.all([
        supabase.from("hospitals").select("id,name,code,is_active").eq("is_active", true).order("name"),
        supabase.from("hospital_whatsapp_contacts" as any).select("id,hospital_id,phone_number,contact_name,contact_role,status,created_at,updated_at").order("updated_at", { ascending: false }),
      ]);
      if (hospitalError) throw hospitalError;
      if (contactError) throw contactError;
      setHospitals((hospitalData || []) as Hospital[]);
      const rows = (contactData || []) as Contact[];
      const names = new Map((hospitalData || []).map((h: any) => [h.id, h.name]));
      setContacts(rows.map((row) => ({ ...row, hospital: { name: names.get(row.hospital_id) || "Unknown hospital" } })));
    } catch (error: any) {
      toast({ variant: "destructive", title: "Unable to load WhatsApp access", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => contacts.filter((contact) => {
    const text = [contact.hospital?.name, contact.phone_number, contact.contact_name, contact.contact_role].join(" ").toLowerCase();
    return (statusFilter === "all" || contact.status === statusFilter) && text.includes(search.toLowerCase());
  }), [contacts, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ hospital_id: "", phone_number: "", contact_name: "", contact_role: "", status: "pending" });
    setOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setForm({ hospital_id: contact.hospital_id, phone_number: contact.phone_number, contact_name: contact.contact_name || "", contact_role: contact.contact_role || "", status: contact.status });
    setOpen(true);
  };

  const save = async () => {
    if (!form.hospital_id || !form.phone_number.trim()) {
      toast({ variant: "destructive", title: "Missing information", description: "Select a hospital and enter a WhatsApp number." });
      return;
    }
    const phone = normalizePhone(form.phone_number);
    if (!phone || phone.length < 10) {
      toast({ variant: "destructive", title: "Invalid number", description: "Enter a valid WhatsApp phone number." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        hospital_id: form.hospital_id,
        phone_number: phone,
        contact_name: form.contact_name.trim() || null,
        contact_role: form.contact_role.trim() || null,
        status: form.status,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from("hospital_whatsapp_contacts" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
        toast({ title: "WhatsApp access updated", description: "The hospital WhatsApp identity has been updated." });
      } else {
        const { error } = await supabase.from("hospital_whatsapp_contacts" as any).insert(payload);
        if (error) throw error;
        toast({ title: "WhatsApp access added", description: "This number is now registered for the selected hospital." });
      }
      setOpen(false);
      await load();
    } catch (error: any) {
      const duplicate = String(error.message || "").toLowerCase().includes("duplicate") || String(error.message || "").includes("ux_hospital_whatsapp_contacts_active_phone");
      toast({ variant: "destructive", title: "Save failed", description: duplicate ? "That active WhatsApp number is already registered. A number can belong to only one hospital." : error.message });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (contact: Contact, status: Contact["status"]) => {
    try {
      const { error } = await supabase.from("hospital_whatsapp_contacts" as any).update({ status, updated_at: new Date().toISOString() }).eq("id", contact.id);
      if (error) throw error;
      toast({ title: status === "active" ? "WhatsApp access activated" : "WhatsApp access disabled" });
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Status update failed", description: error.message });
    }
  };

  const remove = async (contact: Contact) => {
    if (!window.confirm(`Remove WhatsApp access for ${contact.phone_number}?`)) return;
    try {
      const { error } = await supabase.from("hospital_whatsapp_contacts" as any).delete().eq("id", contact.id);
      if (error) throw error;
      toast({ title: "WhatsApp access removed" });
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Remove failed", description: error.message });
    }
  };

  return (
    <div className="space-y-5 pb-10 animate-in fade-in duration-500">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-emerald-600" /><h2 className="text-lg font-semibold text-slate-900">Hospital WhatsApp Access</h2></div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Register the phone numbers that are allowed to submit medical authorizations through WhatsApp. This is separate from website login accounts.</p>
          </div>
          <Button onClick={openCreate} className="med-button-primary gap-2"><Plus className="h-4 w-4" /> Add WhatsApp Number</Button>
        </div>
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-emerald-800">
          <strong>Security:</strong> WhatsApp access is granted by this registry and the sender's phone number. Typing a hospital name in a message cannot grant access, and a hospital login account is not required.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["active", "pending", "disabled"] as const).map((status) => (
          <div key={status} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{status}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{contacts.filter((c) => c.status === status).length}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hospital or WhatsApp number..." className="pl-9" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select>
        </div>

        {loading ? <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading WhatsApp access...</div> : filtered.length === 0 ? <div className="py-12 text-center text-sm text-slate-500">No WhatsApp contacts found.</div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400"><th className="px-3 py-3">Hospital</th><th className="px-3 py-3">WhatsApp Number</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody>
            {filtered.map((contact) => <tr key={contact.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3"><div className="flex items-center gap-2 font-medium text-slate-800"><Building2 className="h-4 w-4 text-slate-400" />{contact.hospital?.name || "Unknown hospital"}</div></td><td className="px-3 py-3 font-mono text-slate-700">{contact.phone_number}</td><td className="px-3 py-3"><div>{contact.contact_name || "—"}</div><div className="text-xs text-slate-400">{contact.contact_role || "—"}</div></td><td className="px-3 py-3"><Badge variant="outline" className={cn("capitalize", contact.status === "active" && "border-emerald-300 text-emerald-700", contact.status === "pending" && "border-amber-300 text-amber-700", contact.status === "disabled" && "border-red-300 text-red-700")}>{contact.status}</Badge></td><td className="px-3 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(contact)} title="Edit"><Pencil className="h-4 w-4" /></Button>{contact.status !== "active" && <Button variant="ghost" size="icon" onClick={() => setStatus(contact, "active")} title="Activate"><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>}{contact.status === "active" && <Button variant="ghost" size="icon" onClick={() => setStatus(contact, "disabled")} title="Disable"><ShieldOff className="h-4 w-4 text-amber-600" /></Button>}<Button variant="ghost" size="icon" onClick={() => remove(contact)} title="Remove"><Trash2 className="h-4 w-4 text-red-600" /></Button></div></td></tr>)}
          </tbody></table></div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle>{editing ? "Edit WhatsApp Access" : "Add WhatsApp Number"}</DialogTitle><DialogDescription>Connect a WhatsApp number to an existing hospital. This does not create or modify a website login account.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Hospital *</Label><Select value={form.hospital_id} onValueChange={(value) => setForm((p) => ({ ...p, hospital_id: value }))}><SelectTrigger><SelectValue placeholder="Select hospital" /></SelectTrigger><SelectContent>{hospitals.map((hospital) => <SelectItem key={hospital.id} value={hospital.id}>{hospital.name}{hospital.code ? ` (${hospital.code})` : ""}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>WhatsApp Number *</Label><Input value={form.phone_number} onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))} placeholder="08012345678 or +2348012345678" /><p className="text-xs text-slate-400">Stored in normalized Nigerian format for reliable sender matching.</p></div><div className="grid gap-2"><Label>Contact Person</Label><Input value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} placeholder="e.g. Nurse Jane" /></div><div className="grid gap-2"><Label>Role / Position</Label><Input value={form.contact_role} onChange={(e) => setForm((p) => ({ ...p, contact_role: e.target.value }))} placeholder="e.g. Nurse / Medical Officer" /></div><div className="grid gap-2"><Label>Access Status</Label><Select value={form.status} onValueChange={(value) => setForm((p) => ({ ...p, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving} className="med-button-primary">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? "Save Changes" : "Add WhatsApp Access"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
