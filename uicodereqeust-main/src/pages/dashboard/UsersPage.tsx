import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useTabVisibilityRefresh } from "@/hooks/use-tab-visibility-refresh";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useDataPagination } from "@/hooks/use-data-pagination";
import { DataPagination } from "@/components/dashboard/DataPagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  roleOptions,
  prettyDate,
  accessStatus,
  roleLabel,
} from "@/lib/user-helpers";
import { InviteUserModal } from "@/components/users/InviteUserModal";
import { EditUserModal } from "@/components/users/EditUserModal";
import {
  ResetPasswordModal,
  AccessStatusModal,
  DeleteUserModal,
} from "@/components/users/ActionModals";

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"directory" | "approvals">("directory");
  const [users, setUsers] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [nameRequests, setNameRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [actioningRequest, setActioningRequest] = useState<{ id: string; action: "approved" | "rejected" } | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [accessTarget, setAccessTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select(`
          id,
          user_id,
          role,
          full_name,
          email,
          phone,
          hospital_id,
          access_status,
          created_at,
          updated_at,
          last_sign_in,
          onboarding_completed,
          invite_status,
          hospitals (
            id,
            name,
            code
          )
        `);

      if (rolesError) throw rolesError;

      const formatted = (userRoles || []).map((ur: any) => ({
        id: ur.id,
        user_id: ur.user_id,
        role: ur.role,
        full_name: ur.full_name || "Unnamed User",
        email: ur.email || "",
        phone: ur.phone || "",
        hospital_id: ur.hospital_id,
        hospital_name: ur.hospitals?.name || "",
        hospital_code: ur.hospitals?.code || "",
        access_status: ur.access_status || "active",
        created_at: ur.created_at,
        updated_at: ur.updated_at,
        last_sign_in: ur.last_sign_in,
        onboarding_completed: ur.onboarding_completed,
        invite_status: ur.invite_status,
      }));

      // Sort alphabetically by full name
      formatted.sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));

      setUsers(formatted);
    } catch (e: any) {
      console.error("Failed to load users:", e);
      toast({ variant: "destructive", title: "Load Error", description: e.message || "Could not load users" });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchHospitals = useCallback(async () => {
    setLoadingHospitals(true);
    let allHospitals: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("hospitals")
        .select("id, name, code, email, phone, user_id")
        .order("name")
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error("Error fetching page of hospitals:", error);
        break;
      }

      if (data && data.length > 0) {
        allHospitals = [...allHospitals, ...data];
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setHospitals(allHospitals);
    setLoadingHospitals(false);
  }, []);

  const fetchNameRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const { data, error } = await (supabase as any)
        .from("profile_name_update_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setNameRequests(data || []);
    } catch (e) {
      console.error("Error loading name approvals queue:", e);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchHospitals();
    fetchNameRequests();
  }, [fetchUsers, fetchHospitals, fetchNameRequests]);

  useTabVisibilityRefresh(fetchUsers);

  const filtered = useMemo(() => users.filter((item) => {
    const hospitalName = item.hospital_name || hospitals.find((hospital) => hospital.id === item.hospital_id)?.name || "";
    const haystack = [item.full_name, item.email, item.phone, roleLabel(item.role), hospitalName, accessStatus(item)].join(" ").toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || item.role === roleFilter;
    return matchesSearch && matchesRole;
  }), [hospitals, roleFilter, search, users]);

  const { page, setPage, pageSize, totalPages, pageItems: paginatedUsers, start, end, total } = useDataPagination(filtered);

  const handleResendInvite = async (targetUser: any) => {
    setResendingUserId(targetUser.id);
    try {
      console.log("Resending invitation for user:", targetUser.email);
      const { data, error } = await supabase.functions.invoke("invite-user", {
        method: "POST",
        body: {
          email: targetUser.email,
          fullName: targetUser.full_name,
          role: targetUser.role,
          phone: targetUser.phone || null,
          hospital_id: targetUser.hospital_id || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.message || "Failed to resend invitation.");

      toast({
        title: "Invitation Resent",
        description: `A fresh invitation link has been sent to ${targetUser.email}.`,
      });
      fetchUsers();
    } catch (e: any) {
      console.error("Resend invite error:", e);
      toast({
        variant: "destructive",
        title: "Resend Failed",
        description: e.message || "Could not resend invitation.",
      });
    } finally {
      setResendingUserId(null);
    }
  };

  const handleDecideRequest = async (requestId: string, decideStatus: "approved" | "rejected") => {
    setActioningRequest({ id: requestId, action: decideStatus });
    try {
      const { error } = await (supabase.rpc as any)("decide_profile_name_request", {
        _request_id: requestId,
        _status: decideStatus,
        _decided_by: user?.id,
      });
      if (error) throw error;
      toast({ title: decideStatus === "approved" ? "Name Change Approved" : "Name Change Rejected", description: `Name update request has been ${decideStatus}.` });
      fetchNameRequests();
      fetchUsers();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Action Failed", description: e.message });
    } finally {
      setActioningRequest(null);
    }
  };

  return (
    <div className="space-y-4 max-w-full overflow-hidden pb-10 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center gap-2 pb-3">
            <button
              onClick={() => setActiveTab("directory")}
              className={cn("rounded-lg px-4 py-2 text-sm font-medium transition", activeTab === "directory" ? "bg-[#93c34b] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}
            >
              User Directory
            </button>
            <button
              onClick={() => setActiveTab("approvals")}
              className={cn("relative rounded-lg px-4 py-2 text-sm font-medium transition", activeTab === "approvals" ? "bg-[#93c34b] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}
            >
              Name Approvals
              {nameRequests.length > 0 && <span className="ml-2 rounded-full bg-[#E24B4A] px-1.5 py-0.5 text-xs text-white">{nameRequests.length}</span>}
            </button>
          </div>

      {activeTab === "directory" && (
        <>
          <div className="med-card p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Search users..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 rounded-lg border-slate-200 pl-9 text-xs" />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 text-xs sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => setIsAddingUser(true)} className="med-button-primary h-10">
                <UserPlus className="h-4 w-4" /> Invite User
              </Button>
            </div>
          </div>

          <div className="med-card overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden lg:block w-full">
              <table className="w-full text-left table-fixed border-collapse">
                <colgroup>
                  <col className="w-[30%]" />
                  <col className="w-[15%]" />
                  <col className="w-[30%]" />
                  <col className="w-[15%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className="table-heading">
                  <tr>
                    <th className="px-4 py-3">User Details</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Organization</th>
                    <th className="px-4 py-3">Status & Activity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-600">
                  {loading ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500"><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-[#93c34b]" /> Loading users...</td></tr>
                  ) : paginatedUsers.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No users found</td></tr>
                  ) : paginatedUsers.map((item) => {
                    const status = accessStatus(item);
                    const suspended = ["suspended", "revoked", "inactive"].includes(status);
                    const linkedHospital = item.hospital_name || hospitals.find((hospital) => hospital.id === item.hospital_id)?.name || (item.role === "hospital" ? "No hospital assigned" : "Ronsberger HMO Operations");
                    return (
                      <tr key={item.id} className="group transition hover:bg-slate-50/50 h-14">
                        <td className="px-4 py-2.5 break-words whitespace-normal">
                          <div className="font-semibold text-slate-900 leading-snug">{item.full_name || "Unnamed User"}</div>
                          {!item.full_name && <div className="text-xs text-rose-600 font-medium mt-0.5">Update name required</div>}
                          <div className="text-slate-400 font-mono text-xs mt-0.5 truncate leading-tight" title={item.email}>{item.email || "No email"}</div>
                          {item.phone && <div className="text-slate-400 text-xs mt-0.5 leading-tight">{item.phone}</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-slate-600">{roleLabel(item.role)}</span>
                        </td>
                        <td className="px-4 py-2.5 break-words whitespace-normal leading-snug">
                          <div className="font-medium text-slate-700 text-xs">{linkedHospital}</div>
                          {item.hospital_code && <div className="text-xs text-slate-400 mt-0.5 font-mono">{item.hospital_code}</div>}
                        </td>
                        <td className="px-4 py-2.5 leading-normal">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", status === "active" ? "bg-emerald-500" : status === "onboarding" ? "bg-amber-500" : "bg-rose-500")} />
                            <span className="text-xs font-medium text-slate-700">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1 pl-3">Active: {prettyDate(item.last_sign_in)}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-42">
                              <DropdownMenuItem onClick={() => setEditingUser(item)} className="cursor-pointer text-slate-700">
                                <Pencil className="mr-2 h-3.5 w-3.5" /> Edit User
                              </DropdownMenuItem>
                              {status === "onboarding" ? (
                                <DropdownMenuItem onClick={() => handleResendInvite(item)} disabled={resendingUserId === item.id} className="cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50">
                                  <Mail className="mr-2 h-3.5 w-3.5" /> Resend Invite
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setResetTarget(item)} className="cursor-pointer text-slate-700">
                                  <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset Password
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setAccessTarget(item)} className={cn("cursor-pointer", suspended ? "text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50" : "text-amber-600 focus:text-amber-700 focus:bg-amber-50")}>
                                {suspended ? <UserCheck className="mr-2 h-3.5 w-3.5" /> : <UserX className="mr-2 h-3.5 w-3.5" />}
                                {suspended ? "Restore Access" : "Suspend Access"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeleteTarget(item)} className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete User
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
                <div className="p-8 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#93c34b]" /> Loading users...</div>
              ) : paginatedUsers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 uppercase tracking-widest text-xs font-bold">No users found</div>
              ) : paginatedUsers.map((item) => {
                const status = accessStatus(item);
                const suspended = ["suspended", "revoked", "inactive"].includes(status);
                const linkedHospital = item.hospital_name || hospitals.find((hospital) => hospital.id === item.hospital_id)?.name || (item.role === "hospital" ? "No hospital assigned" : "Ronsberger HMO Operations");
                return (
                  <div key={item.id} className="relative p-4 hover:bg-slate-50/50 transition-colors">
                    {/* Left text section with margin to prevent badge overlap */}
                    <div className="pr-28 space-y-1">
                      <span className="text-base font-semibold text-slate-900 truncate block">{item.full_name || "Unnamed User"}</span>
                      {!item.full_name && <div className="text-xs text-rose-600 font-medium leading-none">Update name required</div>}
                      <div className="text-sm text-slate-500 font-normal space-y-0.5">
                        <p className="font-mono truncate" title={item.email}>{item.email || "No email"}</p>
                        {item.phone && <p>{item.phone}</p>}
                        <p className="truncate text-xs text-slate-400">{linkedHospital}</p>
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5">Active: {prettyDate(item.last_sign_in)}</div>
                    </div>

                    {/* Right absolute badges and dropdown */}
                    <div className="absolute top-4 right-4 flex items-center gap-1.5">
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-sm font-medium text-slate-600">
                          {roleLabel(item.role)}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", status === "active" ? "bg-emerald-500" : status === "onboarding" ? "bg-amber-500" : "bg-rose-500")} />
                          <span className="text-xs font-medium text-slate-700">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg flex items-center justify-center">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-42">
                          <DropdownMenuItem onClick={() => setEditingUser(item)} className="cursor-pointer text-slate-700">
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit User
                          </DropdownMenuItem>
                          {status === "onboarding" ? (
                            <DropdownMenuItem onClick={() => handleResendInvite(item)} disabled={resendingUserId === item.id} className="cursor-pointer text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50">
                              <Mail className="mr-2 h-3.5 w-3.5" /> Resend Invite
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => setResetTarget(item)} className="cursor-pointer text-slate-700">
                              <KeyRound className="mr-2 h-3.5 w-3.5" /> Reset Password
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setAccessTarget(item)} className={cn("cursor-pointer", suspended ? "text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50" : "text-amber-600 focus:text-amber-700 focus:bg-amber-50")}>
                            {suspended ? <UserCheck className="mr-2 h-3.5 w-3.5" /> : <UserX className="mr-2 h-3.5 w-3.5" />}
                            {suspended ? "Restore Access" : "Suspend Access"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget(item)} className="cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete User
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
        </>
      )}

      {activeTab === "approvals" && (
        <div className="space-y-3">
          {loadingRequests ? (
            <div className="med-card flex flex-col items-center justify-center p-16 text-slate-500"><Loader2 className="mb-3 h-6 w-6 animate-spin text-[#93c34b]" /> Loading approval requests...</div>
          ) : nameRequests.length === 0 ? (
            <div className="med-card p-12 text-center">
              <UserCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="font-semibold text-slate-900">Approvals Registry Clean</p>
              <p className="mt-1 text-sm text-slate-500">There are no pending profile name update requests.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {nameRequests.map((req) => (
                <div key={req.id} className="med-card p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Profile Update Request</p>
                    <span className="text-sm font-medium text-slate-600 capitalize">{req.role}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3">
                    <div><p className="badge-label text-slate-500">Current Name</p><p className="mt-1 truncate text-sm font-medium text-slate-800">{req.current_name}</p></div>
                    <div><p className="badge-label text-emerald-600">Requested Name</p><p className="mt-1 truncate text-sm font-semibold text-emerald-700">{req.requested_name}</p></div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><AlertTriangle className="h-4 w-4 text-amber-600" /> Submitted {new Date(req.created_at).toLocaleString("en-GB")}</div>
                  <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                    <Button onClick={() => handleDecideRequest(req.id, "rejected")} disabled={actioningRequest?.id === req.id} variant="outline" className="h-9 flex-1 rounded-lg text-sm">{(actioningRequest?.id === req.id && actioningRequest?.action === "rejected") ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Reject</Button>
                    <Button onClick={() => handleDecideRequest(req.id, "approved")} disabled={actioningRequest?.id === req.id} className="med-button-primary h-9 flex-[2]">{(actioningRequest?.id === req.id && actioningRequest?.action === "approved") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve Change</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Extracted Modals */}
      <InviteUserModal
        isOpen={isAddingUser}
        onOpenChange={setIsAddingUser}
        hospitals={hospitals}
        loadingHospitals={loadingHospitals}
        onSuccess={fetchUsers}
      />

      <EditUserModal
        isOpen={!!editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
        user={editingUser}
        hospitals={hospitals}
        loadingHospitals={loadingHospitals}
        onSuccess={fetchUsers}
      />

      <ResetPasswordModal
        isOpen={!!resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        user={resetTarget}
      />

      <AccessStatusModal
        isOpen={!!accessTarget}
        onOpenChange={(open) => !open && setAccessTarget(null)}
        user={accessTarget}
        onSuccess={fetchUsers}
      />

      <DeleteUserModal
        isOpen={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        user={deleteTarget}
        onSuccess={(deletedId, deletedUserId) => {
          setUsers((prev) =>
            prev.filter((u) => {
              const matchesId = deletedId && u.id === deletedId;
              const matchesUserId = deletedUserId && u.user_id === deletedUserId;
              return !(matchesId || matchesUserId);
            })
          );
        }}
      />
    </div>
  );
}