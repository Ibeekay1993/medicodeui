import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, AlertTriangle, Edit3, Check, X, Shield, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProfileSettingsCardProps {
  user: any;
  fullName: string | null;
  role: string | null;
  refreshProfile?: () => Promise<any>;
}

export default function ProfileSettingsCard({
  user,
  fullName,
  role,
  refreshProfile
}: ProfileSettingsCardProps) {
  const { toast } = useToast();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);

  const fetchPendingRequest = async () => {
    if (!user) return;
    if (role === "admin") {
      try {
        await (supabase as any)
          .from("profile_name_update_requests")
          .delete()
          .eq("user_id", user.id)
          .eq("status", "pending");
      } catch (e) {
        console.error("Error cleaning up admin pending requests:", e);
      }
      setPendingRequest(null);
      if (fullName) {
        setNewName(fullName);
      }
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from("profile_name_update_requests")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      setPendingRequest(data || null);
      if (data) {
        setNewName((data as any).requested_name);
      } else if (fullName) {
        setNewName(fullName);
      }
    } catch (e: any) {
      console.error("Error loading pending name requests:", e);
    }
  };

  useEffect(() => {
    fetchPendingRequest();
  }, [fullName, user, role]);

  const handleUpdateProfile = async () => {
    if (!newName.trim() || newName.trim() === fullName) {
      setEditingName(false);
      return;
    }
    setIsSaving(true);
    try {
      if (role === "admin") {
        const { error } = await supabase
          .from("user_roles")
          .update({ full_name: newName.trim() })
          .eq("user_id", user?.id);

        if (error) throw error;

        const { error: metaError } = await supabase.auth.updateUser({
          data: { full_name: newName.trim() },
        });
        if (metaError) {
          console.warn("Profile name saved to DB but Auth metadata update failed:", metaError.message);
        }

        toast({
          title: "Profile Updated",
          description: "Your display name has been updated successfully."
        });
        setEditingName(false);
        if (refreshProfile) {
          await refreshProfile();
        }
      } else {
        const { error } = await (supabase as any).from("profile_name_update_requests").insert({
          user_id: user?.id,
          current_name: fullName || "Unnamed User",
          requested_name: newName.trim(),
          role: role || "utilization_manager",
          status: "pending"
        });

        if (error) throw error;

        toast({
          title: "Name Change Submitted",
          description: "Your display name change has been submitted for administrative approval."
        });
        setEditingName(false);
        fetchPendingRequest();
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update Failed", description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden transition-all">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold leading-5 text-slate-900">
                Account &amp; Security Profile
              </CardTitle>
              <CardDescription className="mt-1 text-sm leading-5 text-slate-600">
                Your authenticated user identity and system privileges
              </CardDescription>
            </div>
          </div>
          <div className="flex w-full justify-end sm:w-auto sm:shrink-0">
            {pendingRequest ? (
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                Pending Approval
              </span>
            ) : !editingName ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingName(true)}
                className="h-10 gap-2 border-brand-200 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                <Edit3 className="h-4 w-4" />
                <span>Edit Name</span>
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingName(false)}
                  aria-label="Cancel name edit"
                  className="h-10 px-3 text-sm text-slate-600 hover:text-slate-900"
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpdateProfile}
                  disabled={isSaving}
                  className="h-10 gap-2 bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
                >
                  {isSaving ? "Saving…" : <><Check className="h-3.5 w-3.5" /> Save</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 sm:p-5">
        {pendingRequest && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm font-medium leading-5 text-amber-800">
              Name change to <strong className="font-bold text-amber-900">"{pendingRequest.requested_name}"</strong> is currently pending administrative approval.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-600">Full Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              readOnly={!editingName || !!pendingRequest}
              className={cn(
                "h-11 rounded-xl text-base font-medium transition-all",
                editingName && !pendingRequest
                  ? "bg-white border-brand-500 ring-2 ring-brand-500/20 shadow-sm"
                  : "bg-slate-50 border-slate-200/80 text-slate-900"
              )}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <Shield className="h-4 w-4 text-slate-400" /> Assigned Role
            </Label>
            <Input
              value={role || ""}
              readOnly
              className="h-11 rounded-xl border-slate-200/80 bg-slate-50 text-base font-medium uppercase text-slate-700"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" /> System Email
            </Label>
            <Input
              value={user?.email || ""}
              readOnly
              className="h-11 truncate rounded-xl border-slate-200/80 bg-slate-50 text-base font-medium text-slate-700"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
