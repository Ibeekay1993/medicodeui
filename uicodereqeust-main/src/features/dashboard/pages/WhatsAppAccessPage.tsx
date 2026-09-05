import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  ShieldOff,
  Trash2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HospitalsAdminService } from "../services/hospitalsAdminService";
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
type ContactStatus = "pending" | "active" | "disabled" | "revoked";

type Contact = {
  id: string;
  hospital_id: string;
  phone_number: string;
  contact_name: string | null;
  contact_role: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at: string;
  hospital?: { name: string } | null;
};

type AuditLog = {
  id: string;
  actor_id: string | null;
  contact_id: string | null;
  hospital_id: string;
  phone_number: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  details: any;
  created_at: string;
  hospital_name?: string;
};

export default function WhatsAppAccessPage() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"contacts" | "audit">("contacts");

  const [open, setOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [targetRevoke, setTargetRevoke] = useState<Contact | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);

  const [form, setForm] = useState<{
    hospital_id: string;
    phone_number: string;
    contact_name: string;
    contact_role: string;
    status: ContactStatus;
  }>({
    hospital_id: "",
    phone_number: "",
    contact_name: "",
    contact_role: "",
    status: "pending",
  });
  const [hospitalSearch, setHospitalSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [hospList, { data: contactData, error: contactError }] = await Promise.all([
        HospitalsAdminService.getHospitalsPaged(),
        supabase
          .from("hospital_whatsapp_contacts" as any)
          .select("id,hospital_id,phone_number,contact_name,contact_role,status,created_at,updated_at,hospital:hospitals(id,name,code,is_active)")
          .order("updated_at", { ascending: false }),
      ]);
      if (contactError) throw contactError;

      const loadedHospitals = (hospList || []) as Hospital[];
      setHospitals(loadedHospitals);

      const rows = (contactData || []) as any[];
      const names = new Map(loadedHospitals.map((h) => [h.id, h.name]));
      setContacts(
        rows.map((row) => ({
          ...row,
          hospital: {
            name: row.hospital?.name || names.get(row.hospital_id) || "Unknown hospital",
          },
        }))
      );
    } catch (error: any) {
      toast({ variant: "destructive", title: "Unable to load WhatsApp access", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from("hospital_whatsapp_audit_logs" as any)
        .select("id,actor_id,contact_id,hospital_id,phone_number,action,old_status,new_status,details,created_at,hospital:hospitals(id,name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      const names = new Map(hospitals.map((h) => [h.id, h.name]));
      const logs = ((data || []) as any[]).map((log) => ({
        ...log,
        hospital_name: log.hospital?.name || names.get(log.hospital_id) || "Unknown hospital",
      }));
      setAuditLogs(logs);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Unable to load audit logs", description: error.message });
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      loadAuditLogs();
    }
  }, [activeTab]);

  const logAuditEvent = async (
    contactId: string | null,
    hospitalId: string,
    phoneNumber: string,
    action: string,
    oldStatus: string | null = null,
    newStatus: string | null = null,
    details: any = {}
  ) => {
    try {
      await supabase.rpc("log_hospital_whatsapp_audit_event", {
        _contact_id: contactId,
        _hospital_id: hospitalId,
        _phone_number: phoneNumber,
        _action: action,
        _old_status: oldStatus,
        _new_status: newStatus,
        _details: details,
      });
    } catch (err: any) {
      console.warn("Audit logging failed:", err.message);
    }
  };

  const filtered = useMemo(() => {
    return contacts.filter((contact) => {
      const text = [contact.hospital?.name, contact.phone_number, contact.contact_name, contact.contact_role]
        .join(" ")
        .toLowerCase();
      return (statusFilter === "all" || contact.status === statusFilter) && text.includes(search.toLowerCase());
    });
  }, [contacts, search, statusFilter]);

  const selectedHospital = useMemo(
    () => hospitals.find((h) => h.id === form.hospital_id) || null,
    [hospitals, form.hospital_id]
  );

  const filteredHospitals = useMemo(() => {
    const q = hospitalSearch.trim().toLowerCase();
    if (!q) return hospitals;
    return hospitals.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.code || "").toLowerCase().includes(q)
    );
  }, [hospitals, hospitalSearch]);

  const openCreate = () => {
    setEditing(null);
    setForm({ hospital_id: "", phone_number: "", contact_name: "", contact_role: "", status: "pending" });
    setHospitalSearch("");
    setOpen(true);
  };

  const openEdit = (contact: Contact) => {
    setEditing(contact);
    setForm({
      hospital_id: contact.hospital_id,
      phone_number: contact.phone_number,
      contact_name: contact.contact_name || "",
      contact_role: contact.contact_role || "",
      status: contact.status,
    });
    setHospitalSearch("");
    setOpen(true);
  };

  const openRevokeModal = (contact: Contact) => {
    setTargetRevoke(contact);
    setRevokeOpen(true);
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
        const isHospitalReassigned = editing.hospital_id !== form.hospital_id;
        const { error } = await supabase.from("hospital_whatsapp_contacts" as any).update(payload).eq("id", editing.id);
        if (error) throw error;

        await logAuditEvent(
          editing.id,
          form.hospital_id,
          phone,
          isHospitalReassigned ? "hospital_reassigned" : "edited",
          editing.status,
          form.status,
          { previous_hospital_id: editing.hospital_id, previous_phone: editing.phone_number }
        );

        toast({ title: "WhatsApp access updated", description: "The hospital WhatsApp identity has been updated." });
      } else {
        const { data: inserted, error } = await supabase
          .from("hospital_whatsapp_contacts" as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;

        await logAuditEvent((inserted as any)?.id || null, form.hospital_id, phone, "added", null, form.status, {
          contact_name: form.contact_name,
        });

        toast({ title: "WhatsApp access added", description: "This number is now registered for the selected hospital." });
      }
      setOpen(false);
      await load();
    } catch (error: any) {
      const duplicate =
        String(error.message || "").toLowerCase().includes("duplicate") ||
        String(error.message || "").includes("ux_hospital_whatsapp_contacts_active_phone");
      toast({
        variant: "destructive",
        title: "Save failed",
        description: duplicate
          ? "That active WhatsApp number is already registered. An active number can belong to only one hospital."
          : error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (contact: Contact, newStatus: ContactStatus) => {
    try {
      const { error } = await supabase
        .from("hospital_whatsapp_contacts" as any)
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", contact.id);
      if (error) throw error;

      let action = "edited";
      if (newStatus === "active") action = "activated";
      if (newStatus === "disabled") action = "deactivated";
      if (newStatus === "revoked") action = "revoked";

      await logAuditEvent(contact.id, contact.hospital_id, contact.phone_number, action, contact.status, newStatus);

      toast({
        title: newStatus === "active" ? "WhatsApp access activated" : newStatus === "revoked" ? "WhatsApp access revoked" : "WhatsApp access disabled",
        description: newStatus === "revoked" ? "Sender will immediately receive no hospital authorization privileges." : undefined,
      });
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Status update failed", description: error.message });
    }
  };

  const confirmRevoke = async () => {
    if (!targetRevoke) return;
    await setStatus(targetRevoke, "revoked");
    setRevokeOpen(false);
    setTargetRevoke(null);
  };

  const remove = async (contact: Contact) => {
    if (!window.confirm(`Permanently delete record for ${contact.phone_number}? This will preserve historical audit logs.`)) return;
    try {
      await logAuditEvent(contact.id, contact.hospital_id, contact.phone_number, "deleted", contact.status, null);
      const { error } = await supabase.from("hospital_whatsapp_contacts" as any).delete().eq("id", contact.id);
      if (error) throw error;
      toast({ title: "WhatsApp access record removed" });
      await load();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Remove failed", description: error.message });
    }
  };

  return (
    <div className="space-y-5 pb-10 animate-in fade-in duration-500">
      {/* Header card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-slate-900">Hospital WhatsApp Access Control</h2>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Register and authorize official hospital WhatsApp numbers. Only active numbers in this registry are granted medical authorization privileges.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "contacts" ? "default" : "outline"}
              onClick={() => setActiveTab("contacts")}
              className="gap-2"
            >
              <MessageSquare className="h-4 w-4" /> Access List
            </Button>
            <Button
              variant={activeTab === "audit" ? "default" : "outline"}
              onClick={() => setActiveTab("audit")}
              className="gap-2"
            >
              <History className="h-4 w-4" /> Audit History
            </Button>
            <Button onClick={openCreate} className="med-button-primary gap-2">
              <Plus className="h-4 w-4" /> Add WhatsApp Number
            </Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-emerald-800">
          <strong>Identity Boundary:</strong> Sender phone numbers are resolved against this registry before processing. Text claims, patient names, or self-reported hospital names in WhatsApp messages will never grant hospital privileges.
        </div>
      </div>

      {activeTab === "contacts" ? (
        <>
          {/* Status Counter Cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            {(["active", "pending", "disabled", "revoked"] as const).map((st) => (
              <div key={st} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{st}</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {contacts.filter((c) => c.status === st).length}
                </div>
              </div>
            ))}
          </div>

          {/* Search & Table Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search hospital name, phone number, or contact..."
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading WhatsApp access...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No WhatsApp contacts found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-3">Hospital</th>
                      <th className="px-3 py-3">WhatsApp Number</th>
                      <th className="px-3 py-3">Contact Person</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((contact) => (
                      <tr key={contact.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 font-medium text-slate-800">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            {contact.hospital?.name || "Unknown hospital"}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-700">+{contact.phone_number}</td>
                        <td className="px-3 py-3">
                          <div>{contact.contact_name || "—"}</div>
                          <div className="text-xs text-slate-400">{contact.contact_role || "—"}</div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize font-medium",
                              contact.status === "active" && "border-emerald-300 bg-emerald-50 text-emerald-700",
                              contact.status === "pending" && "border-amber-300 bg-amber-50 text-amber-700",
                              contact.status === "disabled" && "border-red-300 bg-red-50 text-red-700",
                              contact.status === "revoked" && "border-slate-400 bg-slate-100 text-slate-800"
                            )}
                          >
                            {contact.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(contact)} title="Edit">
                              <Pencil className="h-4 w-4 text-slate-600" />
                            </Button>
                            {contact.status !== "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setStatus(contact, "active")}
                                title="Activate"
                              >
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              </Button>
                            )}
                            {contact.status === "active" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setStatus(contact, "disabled")}
                                title="Disable"
                              >
                                <ShieldOff className="h-4 w-4 text-amber-600" />
                              </Button>
                            )}
                            {contact.status !== "revoked" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openRevokeModal(contact)}
                                title="Revoke Access Immediately"
                              >
                                <ShieldAlert className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => remove(contact)} title="Remove Record">
                              <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Audit History Tab */
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" /> Security Audit Log Trail
            </h3>
            <Button variant="outline" size="sm" onClick={loadAuditLogs} disabled={loadingLogs}>
              {loadingLogs ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null} Refresh Audit Logs
            </Button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading access audit history...
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">No security audit logs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-3">Timestamp</th>
                    <th className="px-3 py-3">Action</th>
                    <th className="px-3 py-3">Hospital</th>
                    <th className="px-3 py-3">WhatsApp Number</th>
                    <th className="px-3 py-3">State Transition</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize font-mono text-xs",
                            log.action === "activated" && "border-emerald-300 bg-emerald-50 text-emerald-700",
                            log.action === "revoked" && "border-red-400 bg-red-50 text-red-800",
                            log.action === "deactivated" && "border-amber-300 bg-amber-50 text-amber-700",
                            log.action === "added" && "border-blue-300 bg-blue-50 text-blue-700"
                          )}
                        >
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">{log.hospital_name}</td>
                      <td className="px-3 py-3 font-mono text-slate-700">+{log.phone_number}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {log.old_status || "none"} → <strong>{log.new_status || "none"}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Hospital WhatsApp Access" : "Add Hospital WhatsApp Number"}</DialogTitle>
            <DialogDescription>
              Associate an official WhatsApp phone number with a registered hospital.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Hospital *</Label>
              <Input
                value={hospitalSearch}
                onChange={(e) => setHospitalSearch(e.target.value)}
                placeholder="Type to search hospital by name or code..."
              />
              {form.hospital_id ? (
                <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="truncate pr-2 text-xs font-medium text-emerald-800">
                    {selectedHospital
                      ? `${selectedHospital.name}${selectedHospital.code ? ` (${selectedHospital.code})` : ""}`
                      : form.hospital_id}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, hospital_id: "" }))}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : null}
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
                {filteredHospitals.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-500">
                    No hospitals match &quot;{hospitalSearch}&quot;.
                  </div>
                ) : (
                  filteredHospitals.map((hospital) => (
                    <button
                      key={hospital.id}
                      type="button"
                      onClick={() => {
                        setForm((p) => ({ ...p, hospital_id: hospital.id }));
                        setHospitalSearch("");
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors",
                        form.hospital_id === hospital.id && "bg-[#f0f0fa] font-semibold"
                      )}
                    >
                      <span className="truncate pr-2 text-slate-700">
                        {hospital.name}
                        {hospital.code ? ` (${hospital.code})` : ""}
                      </span>
                      {form.hospital_id === hospital.id ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#3f3f95] shrink-0" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
              {hospitals.length > filteredHospitals.length ? (
                <p className="text-xs text-slate-400">
                  Showing {filteredHospitals.length} of {hospitals.length} hospitals.
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>WhatsApp Phone Number *</Label>
              <Input
                value={form.phone_number}
                onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))}
                placeholder="08012345678 or +2348012345678"
              />
              <p className="text-xs text-slate-400">
                Number will be normalized to canonical format (e.g. 2348012345678) for sender matching.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Contact Person Name</Label>
              <Input
                value={form.contact_name}
                onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))}
                placeholder="e.g. Nurse Jane / Desk Officer"
              />
            </div>
            <div className="grid gap-2">
              <Label>Contact Role / Designation</Label>
              <Input
                value={form.contact_role}
                onChange={(e) => setForm((p) => ({ ...p, contact_role: e.target.value }))}
                placeholder="e.g. HMO Desk / Medical Officer"
              />
            </div>
            <div className="grid gap-2">
              <Label>Authorization Status</Label>
              <Select
                value={form.status}
                onValueChange={(value: ContactStatus) => setForm((p) => ({ ...p, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active (Authorized Sender)</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="med-button-primary">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editing ? "Save Changes" : "Register Number"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertOctagon className="h-5 w-5" /> Revoke Hospital WhatsApp Access
            </DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to revoke WhatsApp access for{" "}
              <strong className="font-mono text-slate-900">+{targetRevoke?.phone_number}</strong> belonging to{" "}
              <strong>{targetRevoke?.hospital?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 space-y-1">
            <p>
              <strong>Security Effect:</strong> This revocation takes effect immediately. Messages sent from this WhatsApp number will be rejected and denied hospital authorization privileges.
            </p>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRevoke} className="gap-2">
              <ShieldAlert className="h-4 w-4" /> Revoke Immediately
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
