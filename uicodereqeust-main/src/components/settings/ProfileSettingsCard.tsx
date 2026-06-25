import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
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
    <Card className="rounded-xl border-slate-100 bg-white shadow-sm overflow-hidden">
      <CardHeader className="px-4 py-2.5 border-b border-slate-50 bg-slate-50/50 flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">
          Account &amp; Security
        </CardTitle>
        {pendingRequest ? (
          <span className="text-[7.5px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg animate-pulse">
            Awaiting Name Approval
          </span>
        ) : !editingName ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingName(true)}
            className="h-6 text-xs font-black uppercase tracking-widest text-emerald-600"
          >
            Edit Name
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingName(false)}
              className="h-6 text-xs font-black uppercase tracking-widest text-slate-400"
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUpdateProfile}
              disabled={isSaving}
              className="h-6 text-xs font-black uppercase tracking-widest text-blue-600"
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {pendingRequest && (
          <div className="px-3 py-2 bg-amber-50/70 border border-amber-100 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 animate-pulse" />
            <p className="text-xs font-semibold text-amber-700 leading-snug">
              Name change to <span className="font-black">"{pendingRequest.requested_name}"</span> is pending admin
              approval.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-black uppercase text-slate-400">Full Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              readOnly={!editingName || !!pendingRequest}
              className={cn(
                "h-8 rounded-lg text-xs font-bold transition-all",
                editingName && !pendingRequest ? "bg-white border-slate-200 ring-2 ring-emerald-500/20" : "bg-slate-50 border-none"
              )}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-black uppercase text-slate-400">Role</Label>
            <Input
              value={role || ""}
              readOnly
              className="h-8 rounded-lg bg-slate-50 border-none text-xs font-bold uppercase"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-black uppercase text-slate-400">System Email</Label>
            <Input value={user?.email || ""} readOnly className="h-8 rounded-lg bg-slate-50 border-none text-xs font-bold" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
