import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Megaphone, Trash2, Edit2, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function AnnouncementsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("low");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("hmo_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } else {
      setAnnouncements(data || []);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast({ variant: "destructive", title: "Required", description: "Title and content are required." });
      return;
    }
    setIsSubmitting(true);
    
    if (isEditing) {
      const { error } = await supabase
        .from("hmo_announcements")
        .update({ title, content, priority, is_active: isActive })
        .eq("id", isEditing);
      if (error) toast({ variant: "destructive", title: "Error", description: error.message });
      else toast({ title: "Success", description: "Announcement updated." });
    } else {
      const { error } = await supabase
        .from("hmo_announcements")
        .insert([{ title, content, priority, is_active: isActive }]);
      if (error) toast({ variant: "destructive", title: "Error", description: error.message });
      else toast({ title: "Success", description: "Announcement created." });
    }
    
    setIsSubmitting(false);
    resetForm();
    fetchAnnouncements();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return;
    const { error } = await supabase.from("hmo_announcements").delete().eq("id", id);
    if (error) toast({ variant: "destructive", title: "Error", description: error.message });
    else {
      toast({ title: "Deleted", description: "Announcement removed." });
      fetchAnnouncements();
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from("hmo_announcements").update({ is_active: !currentStatus }).eq("id", id);
    if (error) toast({ variant: "destructive", title: "Error", description: error.message });
    else fetchAnnouncements();
  };

  const handleEdit = (ann: any) => {
    setIsEditing(ann.id);
    setTitle(ann.title);
    setContent(ann.content);
    setPriority(ann.priority);
    setIsActive(ann.is_active);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setIsEditing(null);
    setTitle("");
    setContent("");
    setPriority("low");
    setIsActive(true);
  };

  if (role !== "admin") {
    return <div className="p-8 text-center text-rose-600 font-bold">Unauthorized access. Only admins can manage announcements.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight sm:text-2xl">Announcements</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Manage broadcasts for hospital portals.</p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50 border-b border-slate-100">
          <CardTitle className="text-sm uppercase tracking-widest text-slate-500 font-black flex items-center gap-2">
            {isEditing ? <Edit2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isEditing ? "Edit Announcement" : "Create New Announcement"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-600">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. System Maintenance" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-600">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-slate-600">Content</label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Message content..." rows={4} />
          </div>
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
              <span className="text-sm font-bold text-slate-700">Set Active (Visible immediately)</span>
            </label>
            <div className="flex items-center gap-3">
              {isEditing && (
                <Button variant="ghost" onClick={resetForm} disabled={isSubmitting}>Cancel</Button>
              )}
              <Button onClick={handleSave} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Update" : "Publish"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : announcements.length === 0 ? (
          <div className="text-center p-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Megaphone className="mx-auto h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-500">No announcements found</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <Card key={ann.id} className={cn("overflow-hidden transition-all", !ann.is_active && "opacity-60")}>
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-extrabold text-slate-900 text-lg">{ann.title}</h3>
                    <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                      ann.priority === "high" || ann.priority === "critical" ? "bg-rose-100 text-rose-700" :
                      ann.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                    )}>{ann.priority}</span>
                    {ann.is_active ? (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="h-3 w-3" /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> Inactive</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{ann.content}</p>
                  <p className="text-xs font-semibold text-slate-400">Created: {new Date(ann.created_at).toLocaleString()}</p>
                </div>
                <div className="flex sm:flex-col items-center gap-2 sm:border-l sm:border-slate-100 sm:pl-4">
                  <Button variant="outline" size="sm" onClick={() => toggleActive(ann.id, ann.is_active)} className="w-full justify-start">
                    {ann.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(ann)} className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200">
                    <Edit2 className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(ann.id)} className="w-full justify-start text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
