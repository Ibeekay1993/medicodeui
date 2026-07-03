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
import { Loader2, Mail, Search } from "lucide-react";
import { availableRoles, filterHospitals } from "@/lib/user-helpers";

interface InviteUserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  hospitals: any[];
  loadingHospitals: boolean;
  onSuccess: () => void;
}

export function InviteUserModal({
  isOpen,
  onOpenChange,
  hospitals,
  loadingHospitals,
  onSuccess,
}: InviteUserModalProps) {
  const { toast } = useToast();
  const [newUser, setNewUser] = useState({
    email: "",
    fullName: "",
    phone: "",
    role: "utilization_manager",
    hospital_id: "",
  });
  const [isInviting, setIsInviting] = useState(false);
  const [inviteHospitalSearch, setInviteHospitalSearch] = useState("");
  const [inviteDropdownOpen, setInviteDropdownOpen] = useState(false);

  const inviteHospitalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (inviteHospitalRef.current && !inviteHospitalRef.current.contains(event.target as Node)) {
        setInviteDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setInviteHospitalSearch("");
      setInviteDropdownOpen(false);
      setNewUser({ email: "", fullName: "", phone: "", role: "utilization_manager", hospital_id: "" });
    }
  }, [isOpen]);

  const handleInviteUser = async () => {
    const email = newUser.email.trim().toLowerCase();
    if (!email || !newUser.fullName.trim()) {
      toast({
        variant: "destructive",
        title: "Missing Info",
        description: "Email and name are required.",
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        variant: "destructive",
        title: "Invalid Email",
        description: "Enter a valid email address before sending the invite.",
      });
      return;
    }
    setIsInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          fullName: newUser.fullName.trim(),
          phone: newUser.phone.trim() || null,
          role: newUser.role,
          hospital_id: newUser.hospital_id || null,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.message || "Invitation failed.");
      toast({
        title: "Invitation Sent",
        description: `A secure registration link has been sent to ${email}.`,
      });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Invitation Failed",
        description: error.message,
      });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Invite New User</DialogTitle>
          <DialogDescription>
            A secure registration link will be sent to the user's email address.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          <Input
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            placeholder="name@company.com"
            className="h-10 rounded-lg"
          />
          <Input
            value={newUser.fullName}
            onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
            placeholder="Full name"
            className="h-10 rounded-lg"
          />
          <Input
            value={newUser.phone}
            onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
            placeholder="Phone number"
            className="h-10 rounded-lg"
          />
          <Select
            value={newUser.role}
            onValueChange={(v) => setNewUser({ ...newUser, role: v })}
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
          {newUser.role === "hospital" && (
            <div ref={inviteHospitalRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={inviteHospitalSearch}
                  onChange={(e) => {
                    setInviteHospitalSearch(e.target.value);
                    setInviteDropdownOpen(true);
                    if (newUser.hospital_id) {
                      setNewUser({ ...newUser, hospital_id: "" });
                    }
                  }}
                  onFocus={() => setInviteDropdownOpen(true)}
                  placeholder="Search hospital name or code..."
                  className="pl-9 h-10 rounded-lg text-sm font-semibold"
                />
                {newUser.hospital_id && (
                  <Badge
                    variant="outline"
                    className="absolute right-3 top-2.5 rounded-full bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-black uppercase"
                  >
                    Selected
                  </Badge>
                )}
              </div>
              {inviteDropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-100 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setNewUser({ ...newUser, hospital_id: "" });
                      setInviteHospitalSearch("");
                      setInviteDropdownOpen(false);
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
                      {filterHospitals(hospitals, inviteHospitalSearch)
                        .slice(0, 10)
                        .map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => {
                              setNewUser({ ...newUser, hospital_id: h.id });
                              setInviteHospitalSearch(h.code ? `${h.name} - ${h.code}` : h.name);
                              setInviteDropdownOpen(false);
                            }}
                            className="flex w-full flex-col rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors"
                          >
                            <span className="font-semibold text-slate-900">{h.name}</span>
                            {h.code && <span className="text-xs text-slate-400">{h.code}</span>}
                          </button>
                        ))}
                      {filterHospitals(hospitals, inviteHospitalSearch).length === 0 && (
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
        </div>
        <DialogFooter>
          <Button
            onClick={handleInviteUser}
            disabled={isInviting}
            className="med-button-primary w-full"
          >
            {isInviting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}{" "}
            Send Invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
