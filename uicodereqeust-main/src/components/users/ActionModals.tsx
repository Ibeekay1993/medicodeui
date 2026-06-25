import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Loader2, Mail, KeyRound, UserCheck, UserX, Trash2 } from "lucide-react";
import { accessStatus } from "@/lib/user-helpers";

// ==========================================
// 1. RESET PASSWORD MODAL
// ==========================================
interface ResetPasswordModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  user: any | null;
  onSuccess?: () => void;
}

export function ResetPasswordModal({
  isOpen,
  onOpenChange,
  user,
  onSuccess,
}: ResetPasswordModalProps) {
  const { toast } = useToast();
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleSendReset = async () => {
    if (!user?.email) return;
    setIsSendingReset(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        method: "POST",
        body: { action: "reset-password", email: user.email },
      });
      const fnResult = data || {};
      if (error && !fnResult.message) throw error;
      if (fnResult.error) throw new Error(fnResult.message || "Password reset failed");
      toast({
        title: "Reset Link Sent",
        description: `Password reset email sent to ${user.email}.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Reset Failed",
        description: e.message,
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <KeyRound className="h-4 w-4 text-[#BA7517]" /> Send Password Reset
          </DialogTitle>
          <DialogDescription>
            A secure password reset link will be emailed to{" "}
            <span className="font-semibold">{user?.email}</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSendReset}
            disabled={isSendingReset}
            className="rounded-lg bg-[#BA7517] px-5 py-2.5 text-white hover:bg-[#854F0B]"
          >
            {isSendingReset ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}{" "}
            Send Reset Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// 2. ACCESS STATUS MODAL
// ==========================================
interface AccessStatusModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  user: any | null;
  onSuccess: () => void;
}

export function AccessStatusModal({
  isOpen,
  onOpenChange,
  user,
  onSuccess,
}: AccessStatusModalProps) {
  const { toast } = useToast();
  const [accessActioning, setAccessActioning] = useState(false);

  const suspended = user ? ["suspended", "revoked", "inactive"].includes(accessStatus(user)) : false;
  const nextStatus = suspended ? "active" : "suspended";

  const handleSetAccess = async () => {
    if (!user) return;
    setAccessActioning(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        method: "POST",
        body: {
          action: suspended ? "restore-access" : "revoke-access",
          id: user.id,
          user_id: user.user_id,
          access_status: nextStatus,
        },
      });
      const fnResult = data || {};
      if (error && !fnResult.message) throw error;
      if (fnResult.error) throw new Error(fnResult.message || "Access update failed");
      toast({
        title: suspended ? "Access Restored" : "Access Revoked",
        description: suspended
          ? `Access restored for ${user.full_name || user.email || "user"}.`
          : `Access revoked for ${user.full_name || user.email || "user"}.`,
      });
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      console.warn("Access update failed via edge function, falling back to direct update:", e);
      try {
        const { error: accessError } = await supabase
          .from("user_roles")
          .update({ access_status: nextStatus })
          .eq("id", user.id);
        if (accessError) throw accessError;

        toast({
          title: suspended ? "Access Restored" : "Access Revoked",
          description: suspended
            ? `Access restored for ${user.full_name || user.email || "user"}.`
            : `Access revoked for ${user.full_name || user.email || "user"}.`,
        });
        onOpenChange(false);
        onSuccess();
      } catch (fallbackError: any) {
        console.error("Access update fallback failed:", fallbackError);
        toast({
          variant: "destructive",
          title: suspended ? "Restore Failed" : "Revoke Failed",
          description: suspended
            ? "Failed to restore access. Try again."
            : "Failed to revoke access. Try again.",
        });
      }
    } finally {
      setAccessActioning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            {suspended ? (
              <UserCheck className="h-4 w-4 text-[#93c34b]" />
            ) : (
              <UserX className="h-4 w-4 text-[#E24B4A]" />
            )}
            {suspended ? "Restore Access" : "Revoke Access"}
          </DialogTitle>
          <DialogDescription>
            {suspended
              ? `Restore access for ${user?.full_name || user?.email || "this user"}?`
              : `Suspend access for ${
                  user?.full_name || user?.email || "this user"
                }? They will be blocked from role-protected actions.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSetAccess}
            disabled={accessActioning}
            className={cn(
              "rounded-lg px-5 py-2.5 text-white",
              suspended ? "bg-[#93c34b] hover:bg-[#7fa73f]" : "bg-[#E24B4A] hover:bg-[#A32D2D]"
            )}
          >
            {accessActioning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : suspended ? (
              <UserCheck className="h-4 w-4" />
            ) : (
              <UserX className="h-4 w-4" />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==========================================
// 3. DELETE USER MODAL
// ==========================================
interface DeleteUserModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  user: any | null;
  onSuccess: (deletedId: string, deletedUserId?: string) => void;
}

export function DeleteUserModal({
  isOpen,
  onOpenChange,
  user,
  onSuccess,
}: DeleteUserModalProps) {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText("");
    }
  }, [isOpen]);

  const handleDeleteUser = async () => {
    if (!user || confirmText !== "DELETE") return;
    setIsDeleting(true);
    const targetId = user.id;
    const targetUserId = user.user_id;

    try {
      const { data, error } = await supabase.functions.invoke("admin-users", {
        method: "POST",
        body: {
          action: "delete-user",
          id: targetId,
          user_id: user.user_id,
          email: user.email || "",
        },
      });

      const fnResult = data || {};
      const extractErrMsg = (fn: any, httpErr: any) =>
        fn?.message || (httpErr as any)?.message || "Could not delete user.";

      if (fnResult.error) throw new Error(extractErrMsg(fnResult, error));
      if (!fnResult.success) throw new Error(extractErrMsg(fnResult, error));
      if (error) throw new Error(extractErrMsg(fnResult, error));

      toast({
        title: fnResult.auth_user_deleted === false ? "User record removed" : "User Deleted",
        description:
          fnResult.auth_user_deleted === false
            ? fnResult.message ||
              "Application role was removed, but the Supabase auth user could not be deleted."
            : "User record and linked access have been removed.",
        variant: fnResult.auth_user_deleted === false ? "default" : undefined,
      });
      onOpenChange(false);
      onSuccess(targetId, targetUserId);
    } catch (e: any) {
      console.error("Delete error:", e);
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: e.message || "Could not delete user.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#A32D2E]">
            <Trash2 className="h-4 w-4" /> Delete User Record
          </DialogTitle>
          <DialogDescription>
            Permanent delete is separate from revoking access. Type{" "}
            <span className="font-semibold text-[#A32D2E]">DELETE</span> to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE"
          className="h-10 rounded-lg border-rose-200"
        />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteUser}
            disabled={confirmText !== "DELETE" || isDeleting}
            className="rounded-lg bg-[#E24B4A] px-5 py-2.5 text-white hover:bg-[#A32D2D]"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}{" "}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
