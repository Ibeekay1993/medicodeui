import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, Loader2, Paperclip, FileDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export function LiveChat() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("livechat_dismissed") === "true";
    } catch { return false; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, role, fullName } = useAuth();
  const { toast } = useToast();
  const isHospital = role === "hospital";
  const isClosed = ["closed", "resolved"].includes(conversation?.status);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from("support_messages" as any)
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      toast({ variant: "destructive", title: "Chat failed", description: error.message });
      return;
    }
    setMessages(data || []);
  };

  const ensureConversation = async (forceNew = false) => {
    if (!user || (!forceNew && conversation)) return conversation;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("support_conversations" as any)
        .select("*")
        .eq("created_by", user.id)
        .in("status", ["new", "open", "pending", "pending_customer_response", "waiting_internal_action", "reopened"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing && !forceNew) {
        setConversation(existing);
        await loadMessages((existing as any).id);
        return existing;
      }

      const { data, error } = await supabase.rpc("create_support_ticket" as any, {
        _subject: "Hospital support",
        _department: "General Support",
        _priority: "normal",
        _initial_message: "",
      });
      if (error) throw error;
      setConversation(data);
      return data;
    } catch (error: any) {
      toast({ variant: "destructive", title: "Chat unavailable", description: error.message });
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !user) return;
    if (!isHospital) return;
    ensureConversation();
  }, [open, user?.id, isHospital]);

  // Robust JS-filtered postgres changes listener for support messages
  useEffect(() => {
    if (!conversation?.id) return;
    const channel = supabase
      .channel(`support-chat-${conversation.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        if (payload.new.conversation_id === conversation.id) {
          loadMessages(conversation.id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_conversations", filter: `id=eq.${conversation.id}` }, (payload) => {
        setConversation((prev: any) => prev ? { ...prev, ...(payload.new as any) } : prev);
        loadMessages(conversation.id);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") loadMessages(conversation.id);
      });
    return () => { supabase.removeChannel(channel); };
  }, [conversation?.id]);

  const sendMessage = async () => {
    const thread = conversation || await ensureConversation();
    if (!thread || !draft.trim() || !user) return;
    if (["closed", "resolved"].includes(thread.status)) {
      toast({ variant: "destructive", title: "Conversation closed", description: "Start a new message for further assistance." });
      return;
    }
    const body = draft.trim();
    const pendingId = `pending-${Date.now()}`;
    setDraft("");
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        conversation_id: thread.id,
        sender_id: user.id,
        sender_role: role,
        sender_name: fullName || "Hospital",
        body,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ]);
    setSending(true);
    const { data, error } = await supabase.rpc("send_support_message" as any, {
      _conversation_id: thread.id,
      _body: body,
      _is_internal: false,
    });
    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((msg) => msg.id !== pendingId));
      setDraft(body);
      toast({ variant: "destructive", title: "Send failed", description: error.message });
      return;
    }
    if (data) {
      setMessages((prev) => prev.map((msg) => msg.id === pendingId ? data : msg));
      setConversation((prev: any) => prev ? { ...prev, last_message: body, last_message_at: data.created_at } : prev);
    }
  };

  const uploadAttachment = async (file?: File) => {
    const thread = conversation || await ensureConversation();
    if (!thread || !file || !user) return;
    if (["closed", "resolved"].includes(thread.status)) {
      toast({ variant: "destructive", title: "Conversation closed", description: "Start a new message before uploading another attachment." });
      return;
    }
    setSending(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${thread.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("support-attachments")
      .upload(storagePath, file, { upsert: false });
    if (uploadError) {
      setSending(false);
      toast({ variant: "destructive", title: "Upload failed", description: uploadError.message });
      return;
    }
    const { error } = await supabase.rpc("send_support_message" as any, {
      _conversation_id: thread.id,
      _body: `Attachment: ${file.name}`,
      _is_internal: false,
      _attachment_url: storagePath,
      _attachment_name: file.name,
    });
    setSending(false);
    if (error) {
      toast({ variant: "destructive", title: "Send failed", description: error.message });
    }
  };

  const startNewConversation = async () => {
    setConversation(null);
    setMessages([]);
    setDraft("");
    const created = await ensureConversation(true);
    if (created) {
      toast({ title: "New message started", description: "A fresh support ticket is ready." });
    }
  };

  if (!isHospital) return null;

  const downloadAttachment = async (path: string, name?: string) => {
    const { data, error } = await supabase.storage.from("support-attachments").download(path);
    if (error || !data) {
      toast({ variant: "destructive", title: "Download failed", description: error?.message || "File unavailable" });
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "attachment";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("livechat_dismissed", "true"); } catch (_) { void 0; }
  };

  const handleShowAgain = () => {
    setDismissed(false);
    try { localStorage.removeItem("livechat_dismissed"); } catch (_) { void 0; }
  };

  const handleToggleIcon = () => {
    if (dismissed) {
      handleShowAgain();
    } else {
      handleDismiss();
    }
  };

  if (dismissed) {
    // Still allow opening the chat dialog if user navigates to it directly (not through the floating icon)
    // But the floating icon is hidden
    if (!open) return null;
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[100] group">
        <div className="absolute -inset-2 bg-emerald-500/20 rounded-full blur-xl group-hover:bg-emerald-500/30 transition-all animate-pulse" />
        <Button
          variant="default"
          className="relative h-14 w-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white shadow-2xl border border-white/10 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="h-6 w-6 text-emerald-500" />
        </Button>
        {/* Close (dismiss) button */}
        <button
          onClick={handleDismiss}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-slate-800 border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center shadow-lg transition-all z-10"
          title="Hide floating chat icon"
          aria-label="Hide floating chat icon"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[94vw] sm:max-w-[400px] h-[80vh] sm:h-[550px] p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-slate-50 flex flex-col">

          <DialogHeader className="p-6 bg-slate-900 text-white shrink-0">
            <DialogTitle className="text-sm font-black uppercase tracking-tight italic">Live <span className="text-emerald-400">Support</span></DialogTitle>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                {conversation?.ticket_number || "Support Ticket Inbox"}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleToggleIcon}
                  className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded-md transition-all border border-slate-700"
                  title={dismissed ? "Show floating chat icon" : "Hide floating chat icon"}
                >
                  {dismissed ? "Show Icon" : "Hide Icon"}
                </button>
                <Badge className="bg-emerald-500/10 text-emerald-400 border-none text-xs font-black uppercase py-0.5 px-2 rounded-lg">
                  Client: {fullName || "Hospital Partner"}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 bg-[#f8fafc]">
            <div ref={scrollRef} className="h-full space-y-4 overflow-y-auto p-6">
              {loading ? (
                <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
              ) : messages.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-4 text-xs font-bold text-slate-500">
                  Send a message and the utilization manager/support team will see it in the Messages inbox.
                </div>
              ) : messages.map((msg) => {
                const mine = msg.sender_id === user?.id;
                return (
                  <div key={msg.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                    <div className={cn("max-w-[85%] px-4 py-3 rounded-2xl text-xs font-medium shadow-sm leading-relaxed", mine ? "bg-slate-900 text-white rounded-tr-none" : "bg-white text-slate-600 border border-slate-100 rounded-tl-none")}>
                      {msg.body}
                      {msg.attachment_url && (
                        <button
                          onClick={() => downloadAttachment(msg.attachment_url, msg.attachment_name)}
                          className={cn("mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest", mine ? "bg-white/10 text-white" : "bg-slate-50 text-emerald-700")}
                        >
                          <FileDown className="h-3 w-3" />
                          {msg.attachment_name || "Download file"}
                        </button>
                      )}
                    </div>
                    <span className="text-xs font-black text-slate-400 uppercase tracking-tighter mx-1">{msg.sender_name || msg.sender_role} - {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                );
              })}
              {isClosed && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-black uppercase tracking-widest text-amber-700">
                  This conversation is closed. Start a new message if you need more help.
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 bg-white border-t border-slate-100 shrink-0">
            {isClosed ? (
              <Button onClick={startNewConversation} className="h-11 w-full rounded-2xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800">
                <Plus className="mr-2 h-4 w-4" /> New Message
              </Button>
            ) : (
              <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => {
                    uploadAttachment(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-slate-400" title="Attachments" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Type your message..."
                  className="border-none bg-transparent focus-visible:ring-0 text-xs font-bold h-10"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                />
                <Button onClick={sendMessage} disabled={sending || !draft.trim()} className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 p-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
