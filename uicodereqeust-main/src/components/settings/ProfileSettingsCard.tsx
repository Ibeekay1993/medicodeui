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
      <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shrink-0">
              <User className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                Account &amp; Security Profile
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Your authenticated user identity and system privileges
              </CardDescription>
            </div>
          </div>
          <div>
            {pendingRequest ? (
              <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg animate-pulse">
                Pending Approval
              </span>
            ) : !editingName ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingName(true)}
                className="h-8 text-xs font-semibold text-brand-700 border-brand-200 hover:bg-brand-50 gap-1"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>Edit Name</span>
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingName(false)}
                  className="h-8 px-2 text-xs text-slate-500 hover:text-slate-800"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  onClick={handleUpdateProfile}
                  disabled={isSaving}
                  className="h-8 px-3 text-xs bg-brand-700 hover:bg-brand-800 text-white font-semibold gap-1"
                >
                  {isSaving ? "Saving…" : <><Check className="h-3.5 w-3.5" /> Save</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        {pendingRequest && (
          <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 animate-pulse" />
            <p className="text-xs font-medium text-amber-800 leading-relaxed">
              Name change to <strong className="font-bold text-amber-900">"{pendingRequest.requested_name}"</strong> is currently pending administrative approval.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500">Full Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              readOnly={!editingName || !!pendingRequest}
              className={cn(
                "h-10 rounded-xl text-xs sm:text-sm font-semibold transition-all",
                editingName && !pendingRequest
                  ? "bg-white border-brand-500 ring-2 ring-brand-500/20 shadow-sm"
                  : "bg-slate-50 border-slate-200/80 text-slate-900"
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-slate-400" /> Assigned Role
            </Label>
            <Input
              value={role || ""}
              readOnly
              className="h-10 rounded-xl bg-slate-50 border-slate-200/80 text-xs sm:text-sm font-semibold uppercase text-slate-700"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Mail className="h-3.5 w-3.5 text-slate-400" /> System Email
            </Label>
            <Input
              value={user?.email || ""}
              readOnly
              className="h-10 rounded-xl bg-slate-50 border-slate-200/80 text-xs sm:text-sm font-medium text-slate-700 truncate"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
