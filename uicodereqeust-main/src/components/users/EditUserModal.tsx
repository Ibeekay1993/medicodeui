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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Edit3, Search, UserCog } from "lucide-react";
import { availableRoles, filterHospitals, prettyDateTime } from "@/lib/user-helpers";

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
      });
      const matched = hospitals.find((h) => h.id === user.hospital_id);
      setEditHospitalSearch(matched ? matched.name : "");
    } else {
      setEditForm({
        full_name: "",
        email: "",
        phone: "",
        role: "utilization_manager",
        hospital_id: "",
      });
      setEditHospitalSearch("");
      setEditDropdownOpen(false);
    }
  }, [user, hospitals]);

  const handleSaveEdit = async () => {
    if (!user) return;
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
      toast({ title: "User Updated", description: "Profile changes saved successfully." });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      const { error } = await supabase
        .from("user_roles")
        .update({
          full_name: editForm.full_name,
          email: editForm.email,
          phone: editForm.phone,
          role: editForm.role as any,
          hospital_id: editForm.hospital_id || null,
        })
        .eq("id", user.id);
      if (error) {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: e.message || error.message,
        });
      } else {
        toast({
          title: "User Updated",
          description: "Name and role saved. Email changes require the admin function.",
        });
        onOpenChange(false);
        onSuccess();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <UserCog className="h-4 w-4 text-[#93c34b]" /> Edit User Profile
          </DialogTitle>
          <DialogDescription>
            Update this user's name, email address, phone, hospital assignment, or system role.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          <Input
            value={editForm.full_name}
            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            placeholder="Full name"
            className="h-10 rounded-lg"
          />
          <Input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            placeholder="Email"
            className="h-10 rounded-lg"
          />
          <Input
            value={editForm.phone}
            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
            placeholder="Phone number"
            className="h-10 rounded-lg"
          />
          <Select
            value={editForm.role}
            onValueChange={(v) => setEditForm({ ...editForm, role: v })}
          >
            <SelectTrigger className="h-10 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editForm.role === "hospital" && (
            <div ref={editHospitalRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
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
                  placeholder="Search hospital name or code..."
                  className="pl-9 h-10 rounded-lg text-sm font-semibold"
                />
                {editForm.hospital_id && (
                  <Badge
                    variant="outline"
                    className="absolute right-3 top-2.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-black uppercase"
                  >
                    Selected
                  </Badge>
                )}
              </div>
              {editDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-100 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm({ ...editForm, hospital_id: "" });
                      setEditHospitalSearch("");
                      setEditDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-bold text-rose-500 hover:bg-rose-50"
                  >
                    No hospital assigned
                  </button>
                  {loadingHospitals ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 font-semibold">
                      <Loader2 className="h-3 w-3 animate-spin text-[#93c34b]" />
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
                              setEditHospitalSearch(h.name);
                              setEditDropdownOpen(false);
                            }}
                            className="flex w-full flex-col rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors"
                          >
                            <span className="font-semibold text-slate-900">{h.name}</span>
                            {h.code && <span className="text-xs text-slate-400">{h.code}</span>}
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
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Last modified: {prettyDateTime(user?.updated_at)}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            disabled={isSaving}
            className="med-button-primary"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Edit3 className="h-4 w-4" />
            )}{" "}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
