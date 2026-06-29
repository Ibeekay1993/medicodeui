import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnnouncements, useCreateAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement } from "../hooks/useAnnouncements";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Megaphone, Trash2, Edit2, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AnnouncementsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { data: announcements = [], isLoading: loading } = useAnnouncements();
  const { mutateAsync: createAnnouncement } = useCreateAnnouncement();
  const { mutateAsync: updateAnnouncement } = useUpdateAnnouncement();
  const { mutateAsync: deleteAnnouncement } = useDeleteAnnouncement();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("low");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast({ variant: "destructive", title: "Required", description: "Title and content are required." });
      return;
    }
    setIsSubmitting(true);
    
    if (isEditing) {
      await updateAnnouncement({ id: isEditing, payload: { title, content, priority, is_active: isActive } });
    } else {
      await createAnnouncement({ title, content, priority, is_active: isActive });
    }
    
    setIsSubmitting(false);
    resetForm();
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    await deleteAnnouncement(deleteTarget);
    setDeleteTarget(null);
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const ann = announcements.find((a: any) => a.id === id);
    if (!ann) return;
    await updateAnnouncement({ id, payload: { title: ann.title, content: ann.content, priority: ann.priority, is_active: !currentStatus } });
  };

  const handleEdit = (ann: any) => {
    setIsEditing(ann.id);
    setTitle(ann.title);
    setContent(ann.content);
    setPriority(ann.priority);
    setIsActive(ann.is_active);
    setTimeout(() => {
      document.getElementById("announcement-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
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
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 shadow-lg shadow-slate-900/10">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 h-24 w-24 rounded-full bg-emerald-500/20 blur-xl"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 h-24 w-24 rounded-full bg-blue-500/20 blur-xl"></div>
        
        <div className="relative z-10 flex items-center gap-4">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-white/10 border border-white/20 backdrop-blur-md shrink-0">
            <Megaphone className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Announcements
            </h1>
            <p className="text-xs font-medium text-slate-400">
              Manage and dispatch real-time hospital alerts
            </p>
          </div>
        </div>
      </div>

      {/* Create / Edit Form */}
      <Card id="announcement-form" className="border-0 shadow-xl shadow-slate-200/40 rounded-3xl overflow-hidden bg-white/60 backdrop-blur-xl transition-all duration-500 ring-1 ring-slate-100 scroll-m-8">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 p-6 sm:px-8">
          <CardTitle className="text-sm uppercase tracking-widest text-slate-600 font-black flex items-center gap-2">
            {isEditing ? (
              <span className="flex items-center gap-2 text-blue-600"><Edit2 className="h-4 w-4" /> Editing Announcement</span>
            ) : (
              <span className="flex items-center gap-2 text-emerald-600"><Plus className="h-4 w-4" /> Dispatch New Announcement</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Headline</label>
              <Input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="e.g. Scheduled System Maintenance" 
                className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 font-medium transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Priority Level</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 font-bold transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl">
                  <SelectItem value="low" className="font-bold text-slate-600">Low (Info)</SelectItem>
                  <SelectItem value="medium" className="font-bold text-amber-600">Medium (Warning)</SelectItem>
                  <SelectItem value="high" className="font-bold text-rose-600">High (Alert)</SelectItem>
                  <SelectItem value="critical" className="font-bold text-purple-600">Critical (Emergency)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Message Body</label>
            <Textarea 
              value={content} 
              onChange={(e) => setContent(e.target.value)} 
              placeholder="Type the full announcement message here..." 
              rows={5} 
              className="resize-none rounded-2xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-500/20 font-medium transition-all p-4 leading-relaxed"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={cn("flex items-center justify-center h-6 w-6 rounded-md border transition-all duration-300", isActive ? "bg-emerald-500 border-emerald-500" : "bg-slate-100 border-slate-300 group-hover:border-emerald-400")}>
                {isActive && <CheckCircle className="h-4 w-4 text-white" />}
              </div>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="hidden" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800">Publish Immediately</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Visible to all hospitals</span>
              </div>
            </label>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {isEditing && (
                <Button variant="ghost" onClick={resetForm} disabled={isSubmitting} className="h-12 px-6 rounded-xl font-bold hover:bg-slate-100 w-full sm:w-auto">
                  Cancel Edit
                </Button>
              )}
              <Button 
                onClick={handleSave} 
                disabled={isSubmitting} 
                className="h-12 px-8 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-black tracking-wide shadow-lg shadow-slate-900/10 hover:shadow-emerald-600/20 transition-all duration-300 w-full sm:w-auto"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Save Changes" : "Dispatch Broadcast"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-2 mb-2">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Active & Past Broadcasts</h2>
          <Badge variant="outline" className="bg-slate-100 text-slate-600 border-0 font-bold">{announcements.length} Total</Badge>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center p-20 bg-white/50 rounded-3xl"><Loader2 className="h-10 w-10 animate-spin text-emerald-500" /></div>
        ) : announcements.length === 0 ? (
          <div className="text-center p-20 bg-white/40 rounded-3xl border-2 border-dashed border-slate-200/60 backdrop-blur-sm">
            <div className="mx-auto h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <Megaphone className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-lg font-black text-slate-800 mb-2">No Broadcasts Yet</p>
            <p className="text-sm font-medium text-slate-500">Create your first announcement above to notify the hospital network.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {announcements.map((ann) => (
              <Card key={ann.id} className={cn(
                "group relative overflow-hidden transition-all duration-300 rounded-2xl border-0 shadow-md hover:shadow-xl hover:-translate-y-1",
                !ann.is_active ? "bg-slate-50/50 opacity-80 hover:opacity-100" : "bg-white"
              )}>
                {ann.is_active && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />}
                {!ann.is_active && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-slate-300" />}
                
                <div className="p-5 sm:p-6 flex flex-col sm:flex-row gap-6">
                  <div className="flex-1 space-y-4 pl-2 sm:pl-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-black text-slate-900 text-xl tracking-tight">{ann.title}</h3>
                      <Badge variant="outline" className={cn("text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border-0",
                        ann.priority === "critical" ? "bg-purple-100 text-purple-700 shadow-sm shadow-purple-100" :
                        ann.priority === "high" ? "bg-rose-100 text-rose-700 shadow-sm shadow-rose-100" :
                        ann.priority === "medium" ? "bg-amber-100 text-amber-700 shadow-sm shadow-amber-100" : "bg-blue-100 text-blue-700 shadow-sm shadow-blue-100"
                      )}>{ann.priority}</Badge>
                      
                      {ann.is_active ? (
                        <Badge variant="outline" className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-700 bg-emerald-50/80 border-emerald-200/50 px-2.5 py-0.5 rounded-full">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-500 bg-slate-100 border-slate-200 px-2.5 py-0.5 rounded-full">
                          <XCircle className="h-3 w-3" /> Offline
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm md:text-base font-medium text-slate-600 leading-relaxed max-w-4xl whitespace-pre-wrap">{ann.content}</p>
                    <p className="text-xs font-bold text-slate-400 tracking-wide uppercase">
                      Created {new Date(ann.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  
                  <div className="flex sm:flex-col items-center justify-center gap-3 sm:w-48 shrink-0">
                    <Button 
                      variant="outline" 
                      onClick={() => toggleActive(ann.id, ann.is_active)} 
                      className={cn("w-full h-10 rounded-xl font-bold transition-all", 
                        ann.is_active 
                          ? "hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 text-slate-600" 
                          : "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-slate-600"
                      )}
                    >
                      {ann.is_active ? "Take Offline" : "Set Live"}
                    </Button>
                    <div className="flex gap-3 w-full">
                      <Button variant="outline" onClick={() => handleEdit(ann)} className="flex-1 h-10 rounded-xl font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 transition-all">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" onClick={() => setDeleteTarget(ann.id)} className="flex-1 h-10 rounded-xl font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 transition-all">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-600">Delete Announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this announcement? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault();
                executeDelete();
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete Announcement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
