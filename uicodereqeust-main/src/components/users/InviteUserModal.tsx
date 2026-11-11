import { BrandSpinner } from "@/components/BrandSpinner";
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
import { Copy, Eye, EyeOff, Mail, RefreshCw, Search } from "lucide-react";
import { availableRoles, filterHospitals } from "@/lib/user-helpers";
import { getSupabaseFunctionErrorMessage } from "@/lib/supabaseFunctionErrors";
import { writeClipboardText } from "@/lib/clipboard";

interface InviteUserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  hospitals: any[];
  loadingHospitals: boolean;
  onSuccess: () => void;
}

type SetupMode = "secure_invitation" | "temporary_password";

function generateTemporaryPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%*-_+";
  const all = upper + lower + digits + symbols;
  const random = new Uint32Array(24);
  crypto.getRandomValues(random);
  const chars = [
    upper[random[0] % upper.length],
    lower[random[1] % lower.length],
    digits[random[2] % digits.length],
    symbols[random[3] % symbols.length],
    ...Array.from(random.slice(4), (value) => all[value % all.length]),
  ];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = random[index] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }
  return chars.join("");
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
    is_team_lead: false,
  });
  const [isInviting, setIsInviting] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>("secure_invitation");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [inviteHospitalSearch, setInviteHospitalSearch] = useState("");
  const [inviteDropdownOpen, setInviteDropdownOpen] = useState(false);

  const inviteHospitalRef = useRef<HTMLDivElement>(null);

  const copyAccountValue = async (label: string, value: string) => {
    try {
      await writeClipboardText(value);
      toast({ title: `${label} copied`, description: "Ready to paste." });
    } catch {
      toast({
        variant: "destructive",
        title: "Could not copy",
        description: "Clipboard access is unavailable in this browser.",
      });
    }
  };

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
      setSetupMode("secure_invitation");
      setTemporaryPassword("");
      setShowTemporaryPassword(false);
      setNewUser({ email: "", fullName: "", phone: "", role: "utilization_manager", hospital_id: "", is_team_lead: false });
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
    if (setupMode === "temporary_password" && (
      temporaryPassword.length < 12 || temporaryPassword.length > 128 ||
      !/[a-z]/.test(temporaryPassword) || !/[A-Z]/.test(temporaryPassword) ||
      !/[0-9]/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword)
    )) {
      toast({
        variant: "destructive",
        title: "Password does not meet requirements",
        description: "Use 12–128 characters, including uppercase, lowercase, a number, and a symbol.",
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
          is_team_lead: newUser.is_team_lead,
          setup_mode: setupMode,
          temporary_password: setupMode === "temporary_password" ? temporaryPassword : undefined,
        },
      });
      if (error) {
        throw new Error(await getSupabaseFunctionErrorMessage(error, "Invitation email was not accepted. Please retry."));
      }
      if (data?.error || data?.success !== true || data?.email_sent !== true) {
        throw new Error(data?.message || "Invitation email was not accepted. Please retry.");
      }
      if (data.setup_mode !== setupMode) {
        throw new Error("The email was accepted, but its setup type could not be confirmed. Update the account email service before relying on this delivery, then resend if needed.");
      }

      toast({
        title: setupMode === "temporary_password" ? "Account Email Accepted" : "Invitation Email Accepted",
        description: setupMode === "temporary_password"
          ? `The account-details email was accepted for delivery to ${email}. Portal access stays restricted until the user accepts the required policies.`
          : `The setup-link email was accepted for delivery to ${email}. The link remains valid for seven days.`,
      });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Invitation Not Sent",
        description: error.message || "Failed to process invitation.",
      });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain rounded-xl p-4 sm:max-w-[420px] sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Add Portal User</DialogTitle>
          <DialogDescription>
            Create the account details for a team member or send a secure setup link.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          <div role="radiogroup" aria-label="Account setup method" className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              role="radio"
              aria-checked={setupMode === "secure_invitation"}
              onClick={() => setSetupMode("secure_invitation")}
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors ${setupMode === "secure_invitation" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              Send setup link
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={setupMode === "temporary_password"}
              onClick={() => setSetupMode("temporary_password")}
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors ${setupMode === "temporary_password" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
            >
              Set password
            </button>
          </div>
          <p className="-mt-2 text-xs leading-relaxed text-slate-600">
            {setupMode === "temporary_password"
              ? "The user receives their sign-in details by email. They must accept the Terms and Privacy Policy before accessing portal records. Password changes remain optional."
              : "The user receives a secure seven-day link and chooses their own password during setup."}
          </p>
          <div className="relative">
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              placeholder="name@company.com"
              className="h-10 rounded-lg pr-10"
            />
            {newUser.email.trim() && (
              <button
                type="button"
                onClick={() => void copyAccountValue("Email", newUser.email.trim())}
                aria-label="Copy email address"
                title="Copy email address"
                className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
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
          {setupMode === "temporary_password" && (
            <div className="space-y-2">
              <label htmlFor="temporary-account-password" className="text-xs font-semibold text-slate-700">Assigned sign-in password</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input
                    id="temporary-account-password"
                    type={showTemporaryPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={temporaryPassword}
                    onChange={(event) => setTemporaryPassword(event.target.value)}
                    placeholder="At least 12 characters"
                    className="h-10 rounded-lg pr-16 font-mono"
                  />
                  <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                    <button
                      type="button"
                      aria-label="Copy assigned password"
                      title="Copy assigned password"
                      onClick={() => void copyAccountValue("Assigned password", temporaryPassword)}
                      disabled={!temporaryPassword}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 disabled:opacity-40"
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={showTemporaryPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowTemporaryPassword((visible) => !visible)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                    >
                      {showTemporaryPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="button" variant="outline" className="h-10 shrink-0 rounded-lg px-3" onClick={() => setTemporaryPassword(generateTemporaryPassword())}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Generate
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">The account email contains this password. The user must accept the required policies before portal access; changing the password is optional.</p>
            </div>
          )}
          <Select
            value={newUser.role}
            onValueChange={(v) => setNewUser({ ...newUser, role: v, is_team_lead: ["hospital", "claims", "finance"].includes(v) ? newUser.is_team_lead : false })}
          >
            <SelectTrigger aria-label="System role" className="h-10 rounded-lg">
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
          {newUser.role === "utilization_manager_lead" && (
            <p className="-mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
              Admins and the Utilization Manager Lead can unlock records, resolve deletion requests, and replace NHIS lists. Regular Utilization Managers do not have these permissions.
            </p>
          )}
          {["hospital", "claims", "finance"].includes(newUser.role) && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50/50 transition-colors">
              <Checkbox
                checked={newUser.is_team_lead}
                onCheckedChange={(checked) => setNewUser({ ...newUser, is_team_lead: checked === true })}
                aria-label="Assign as team lead"
                className="mt-0.5 text-brand-700"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">
                  {newUser.role === "claims" ? "Assign as Claims Lead" : newUser.role === "finance" ? "Assign as Finance Lead" : "Assign as Hospital Lead"}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                  {newUser.role === "claims"
                    ? "Grants elevated supervisor permissions to override finalized decisions, unlock locked claims for re-audit, and resolve disputed line items."
                    : newUser.role === "finance"
                    ? "Designates this officer as the finance team lead with disbursement authorization authority."
                    : "Marks this account as the chief administrator / medical director for the facility."}
                </span>
              </span>
            </label>
          )}
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
                      <BrandSpinner className="h-3 w-3 animate-spin text-[#93c34b]" />
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
              <BrandSpinner className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}{" "}
            {setupMode === "temporary_password" ? "Create Account & Email Details" : "Send Invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
