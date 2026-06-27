import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { getRouteTags } from "@/lib/support-helpers";

interface NewTicketModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: any[];
  authRequests: any[];
  claims: any[];
  onSuccess: (conv: any) => void;
}

export function NewTicketModal({
  isOpen,
  onOpenChange,
  conversations,
  authRequests,
  claims,
  onSuccess,
}: NewTicketModalProps) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [newTicket, setNewTicket] = useState({
    subject: "",
    department: "General Support",
    priority: "normal",
    message: "",
    linkType: "none",
    linkedId: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewTicket({
        subject: "",
        department: "Authorization",
        priority: "normal",
        message: "",
        linkType: "none",
        linkedId: "",
      });
      setPendingFiles([]);
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setPendingFiles((prev) => [...prev, ...files]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateNewConversation = async () => {
    if (!user || !newTicket.subject.trim() || !newTicket.message.trim()) {
      toast({
        variant: "destructive",
        title: "Incomplete details",
        description: "Subject and initial message are required.",
      });
      return;
    }
    setSending(true);
    try {
      const isRequestLink = newTicket.linkType === "request" || newTicket.linkType === "request_support";

      // If linking to a request that already has a conversation, navigate to it instead of creating new
      if (isRequestLink && newTicket.linkedId) {
        const existingConversation = conversations.find((c) => {
          const linkedId =
            c.linked_request_id ||
            getRouteTags(c).find((t: string) => t.startsWith("request:"))?.split(":")?.[1];
          return linkedId === newTicket.linkedId;
        });
        if (existingConversation) {
          onOpenChange(false);
          onSuccess(existingConversation);
          toast({
            title: "Existing conversation found",
            description: "Continuing in the existing support thread for this request.",
          });
          return;
        }
      }

      if (isRequestLink && newTicket.linkedId && role === "hospital") {
        const { data: conv, error } = await supabase.rpc("create_request_support_ticket" as any, {
          _request_id: newTicket.linkedId,
          _initial_message: newTicket.message.trim(),
          _priority: newTicket.priority,
        });
        if (error) throw error;
        onOpenChange(false);
        onSuccess(conv);
        toast({
          title: "Request support chat opened",
          description: "This request already uses one shared support thread.",
        });
        return;
      }

      // Construct tags array containing case-links
      const tags: string[] = [];
      if (
        (newTicket.linkType === "request" || newTicket.linkType === "request_support") &&
        newTicket.linkedId
      ) {
        tags.push(`request:${newTicket.linkedId}`);
        const r = authRequests.find((req) => req.id === newTicket.linkedId);
        if (r?.authorization_code) {
          tags.push(`code:${r.authorization_code}`);
        }
      }

      // Create conversation through RPC
      const { data: conv, error } = await supabase.rpc("create_support_ticket" as any, {
        _subject: newTicket.subject.trim(),
        _department: newTicket.department,
        _priority: newTicket.priority,
        _initial_message: newTicket.message.trim(),
      });

      if (error) throw error;

      if (
        tags.length > 0 ||
        newTicket.linkType === "request" ||
        newTicket.linkType === "request_support"
      ) {
        const updates: Record<string, any> = { tags };
        if (newTicket.linkType === "request" || newTicket.linkType === "request_support") {
          const r = authRequests.find((req) => req.id === newTicket.linkedId);
          updates.linked_request_id = newTicket.linkedId;
          updates.request_reference = r?.authorization_code || r?.request_id || newTicket.linkedId;
          updates.request_metadata = {
            request_id: r?.request_id,
            request_uuid: newTicket.linkedId,
            patient_name: r?.patient_name,
            policy_number: r?.policy_number,
            diagnosis: r?.diagnosis,
            treatment: r?.treatment,
            clinical_notes: r?.clinical_notes,
            decision_reason: r?.decision_reason,
            status: r?.status,
            authorization_code: r?.authorization_code,
            hospital: r?.hospital_name,
            hospital_id: r?.hospital_id,
            requesting_hospital_id: r?.requesting_hospital_id,
            requesting_hospital_name: r?.requesting_hospital_name,
            referring_hospital_id: r?.referring_hospital_id,
            referring_hospital_name: r?.referring_hospital_name,
            referred_hospital_id: r?.referred_hospital_id,
            referred_hospital_name: r?.referred_hospital_name,
            claiming_hospital_id: r?.claiming_hospital_id,
            claiming_hospital_name: r?.claiming_hospital_name,
            date_created: r?.created_at,
            decided_at: r?.decided_at,
            decided_by: r?.decided_by,
          };
          updates.ticket_type = "request_support";
          updates.request_ticket_status = "open";
        }
        await supabase
          .from("support_conversations" as any)
          .update(updates)
          .eq("id", conv.id);
      }

      // Upload first file attachment if exists
      let initAttachmentUrl: string | null = null;
      let initAttachmentName: string | null = null;
      if (pendingFiles.length > 0) {
        const file = pendingFiles[0];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${conv.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("support-attachments")
          .upload(storagePath, file, { upsert: false });
        if (!uploadError) {
          initAttachmentUrl = storagePath;
          initAttachmentName = file.name;
        } else {
          toast({
            variant: "destructive",
            title: "File upload failed",
            description: uploadError.message,
          });
        }
      }

      if (initAttachmentUrl) {
        const { error: messageError } = await supabase.rpc("send_support_message" as any, {
          _conversation_id: conv.id,
          _body: `Attachment: ${initAttachmentName || "file"}`,
          _is_internal: false,
          _attachment_url: initAttachmentUrl,
          _attachment_name: initAttachmentName,
        });
        if (messageError) throw messageError;
      }

      // Upload and send other files if selected
      if (pendingFiles.length > 1) {
        for (let i = 1; i < pendingFiles.length; i++) {
          const file = pendingFiles[i];
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${conv.id}/${Date.now()}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("support-attachments")
            .upload(storagePath, file, { upsert: false });
          if (!uploadError) {
            await supabase.rpc("send_support_message" as any, {
              _conversation_id: conv.id,
              _body: `Attachment: ${file.name}`,
              _is_internal: false,
              _attachment_url: storagePath,
              _attachment_name: file.name,
            });
          }
        }
      }

      onOpenChange(false);
      onSuccess(conv);
      toast({
        title: "Conversation started",
        description: `${conv.ticket_number || "Ticket"} has been successfully created.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to create conversation",
        description: e.message,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl sm:max-w-[480px] max-h-[90vh] overflow-y-auto bg-white border border-slate-200/50 p-6 shadow-2xl font-sans">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight italic flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500 shrink-0" /> Start Dispute Thread
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium">
              Create routine inquiry chat or dispute case reference manually. Note that tickets are
              never auto-created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-slate-400 block px-1">
                Subject Heading
              </label>
              <Input
                value={newTicket.subject}
                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                placeholder="e.g. CPT-Code Dispute: Patient Agnes Adewale"
                className="rounded-xl h-10 text-xs font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-400 block px-1">
                  Active Department
                </label>
                <Select
                  value={newTicket.department}
                  onValueChange={(d) => {
                    setNewTicket({ 
                      ...newTicket, 
                      department: d, 
                      ...(d !== "Authorization" ? { linkType: "none", linkedId: "" } : {})
                    });
                  }}
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold text-slate-700 bg-slate-50/50 border-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Authorization", "Claims", "Payment"].map(
                      (item) => (
                        <SelectItem key={item} value={item} className="text-xs font-bold">
                          {item.toUpperCase()}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black uppercase text-slate-400 block px-1">
                  Priority Scale
                </label>
                <Select
                  value={newTicket.priority}
                  onValueChange={(p) => setNewTicket({ ...newTicket, priority: p })}
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold text-slate-700 bg-slate-50/50 border-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["low", "normal", "high", "urgent"].map((item) => (
                      <SelectItem key={item} value={item} className="text-xs font-bold">
                        {item.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newTicket.department === "Authorization" && (
              <div className="space-y-2.5 border-t border-b border-slate-100 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                    Link Case Connection
                  </span>
                  <Select
                    value={newTicket.linkType}
                    onValueChange={(val: any) => setNewTicket({ ...newTicket, linkType: val, linkedId: "" })}
                  >
                    <SelectTrigger className="h-7 w-[160px] rounded-lg text-xs font-black bg-slate-100 border-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs font-bold">
                        UNCONNECTED
                      </SelectItem>
                      <SelectItem value="request_support" className="text-xs font-bold">
                        REQUEST SUPPORT
                      </SelectItem>
                      <SelectItem value="request" className="text-xs font-bold">
                        AUTH REQUEST
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              {newTicket.linkType !== "none" && (
                <div className="space-y-2">
                  <Select
                    value={newTicket.linkedId}
                    onValueChange={(val) => setNewTicket({ ...newTicket, linkedId: val })}
                  >
                    <SelectTrigger className="h-9 rounded-xl text-xs font-bold bg-indigo-50/30 text-indigo-950 border border-indigo-150">
                      <SelectValue
                        placeholder={
                          newTicket.linkType === "request"
                            ? "Select Clinical Authorization..."
                            : "Select Reimbursement Claim..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-[220px]">
                      {newTicket.linkType === "request"
                        ? authRequests.map((req) => (
                            <SelectItem key={req.id} value={req.id} className="text-xs font-semibold">
                              {req.patient_name} ({req.authorization_code || "PENDING"}) -{" "}
                              {req.diagnosis}
                            </SelectItem>
                          ))
                        : newTicket.linkType === "request_support"
                        ? authRequests
                            .filter((req) =>
                              ["approved", "rejected"].includes(String(req.status || "").toLowerCase())
                            )
                            .map((req) => (
                              <SelectItem key={req.id} value={req.id} className="text-xs font-semibold">
                                {req.patient_name} ({req.authorization_code || "PENDING"}) -{" "}
                                {req.diagnosis}
                              </SelectItem>
                            ))
                        : null}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-slate-400 block px-1">
                Detailed Message Description
              </label>
              <Textarea
                value={newTicket.message}
                onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
                placeholder="Formulate dispute context or Routines inquiry..."
                className="min-h-24 rounded-xl border-slate-200 text-xs font-semibold focus-visible:ring-indigo-500/20 bg-slate-50/50 resize-none shadow-inner"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                  Add Consult Attachments
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-black uppercase tracking-widest bg-slate-50 rounded-lg px-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Select File
                </Button>
              </div>

              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-100 rounded-xl max-h-[85px] overflow-y-auto">
                  {pendingFiles.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 text-slate-700 text-xs font-mono font-bold rounded-md"
                    >
                      <span className="truncate max-w-[120px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(i)}
                        className="text-slate-400 hover:text-slate-900 ml-1"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              onClick={handleCreateNewConversation}
              disabled={sending || !newTicket.subject.trim() || !newTicket.message.trim()}
              className="h-10 w-full rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/10 transition-all flex items-center justify-center gap-2 active:scale-98"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4.5 w-4.5 animate-spin" /> Dispatching...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" /> Create Dispute Thread
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
