import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Send,
  Loader2,
  Paperclip,
  Plus,
  X,
  FileText,
  Sparkles,
  Lock,
  ShieldAlert,
  AlertCircle,
  CheckCheck,
  MessageSquare,
} from "lucide-react";
import {
  isRequestSupportTicket,
  buildAiResponse,
  isEscalationIntent,
  getErrorMessage,
} from "@/lib/support-helpers";
import { MessageBubble } from "./MessageBubble";

interface SupportChatAreaProps {
  selected: any | null;
  setSelected: (conv: any) => void;
  messages: any[];
  setMessages: React.Dispatch<React.SetStateAction<any[]>>;
  agents: any[];
  isInternal: boolean;
  role: string | null;
  user: any;
  leftCollapsed: boolean;
  setLeftCollapsed: (c: boolean) => void;
  rightCollapsed: boolean;
  setRightCollapsed: (c: boolean) => void;
  setMobileSubView: (v: string) => void;
  mobileSubView: string;
  loadConversations: () => Promise<void>;
  updateConversation: (updates: Record<string, any>) => Promise<void>;
  claimTicket: () => Promise<void>;
  matchedRequest: any | null;
  onNewTicketClick: () => void;
}

export function SupportChatArea({
  selected,
  setSelected,
  messages,
  setMessages,
  agents,
  isInternal,
  role,
  user,
  leftCollapsed,
  setLeftCollapsed,
  rightCollapsed,
  setRightCollapsed,
  setMobileSubView,
  mobileSubView,
  loadConversations,
  updateConversation,
  claimTicket,
  matchedRequest,
  onNewTicketClick,
}: SupportChatAreaProps) {
  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isPrivateNoteState, setIsPrivateNoteState] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isStatusClosed = useMemo(() => ["closed", "resolved"].includes(selected?.status), [selected?.status]);
  const closeTime = useMemo(() => selected?.updated_at || selected?.last_message_at || selected?.created_at, [selected]);
  const hoursSinceClosed = useMemo(() => (closeTime ? (Date.now() - new Date(closeTime).getTime()) / (1000 * 60 * 60) : 0), [closeTime]);
  const selectedClosed = useMemo(() => isStatusClosed && hoursSinceClosed >= 24, [isStatusClosed, hoursSinceClosed]);

  // Scroll to bottom when messages list size changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, selected?.id]);

  // Textarea auto-resize
  useEffect(() => {
    const el = replyTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 192);
    el.style.height = `${newHeight}px`;
  }, [replyText]);

  // Clean form when chat channel changes
  useEffect(() => {
    setReplyText("");
    setPendingFiles([]);
    setIsPrivateNoteState(false);
  }, [selected?.id]);

  // Inactivity auto-close: 2.5h warning bot message, 3h auto-close
  useEffect(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    if (!selected?.id || !isInternal || selectedClosed) return;

    // Check last message - only start timer if last message was from internal (agent responded)
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    const lastMsgFromHospital = lastMsg.sender_role === "hospital";
    if (lastMsgFromHospital) return; // hospital replied last, no timeout needed

    const lastMsgAt = new Date(lastMsg.created_at).getTime();
    const now = Date.now();
    const elapsed = now - lastMsgAt;
    const WARNING_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours
    const CLOSE_MS = 3 * 60 * 60 * 1000;     // 3 hours

    // Schedule warning message at 2.5h
    const warnDelay = Math.max(0, WARNING_MS - elapsed);
    const closeDelay = Math.max(0, CLOSE_MS - elapsed);

    if (closeDelay > 0) {
      warningTimerRef.current = setTimeout(async () => {
        if (!selected?.id || !user?.id) return;
        await supabase.from("support_messages" as any).insert({
          conversation_id: selected.id,
          sender_id: user.id,
          sender_role: "system",
          sender_name: "Auto-Close Bot",
          body: "⏰ INACTIVITY NOTICE\n\nThis ticket will be automatically closed in 30 minutes due to no response from the hospital. Please reply to keep this conversation open.",
          is_internal: false,
          message_type: "message",
        });
      }, warnDelay);

      inactivityTimerRef.current = setTimeout(async () => {
        if (!selected?.id) return;
        await supabase
          .from("support_conversations" as any)
          .update({ status: "closed", last_message: "Auto-closed due to inactivity" })
          .eq("id", selected.id);
        await loadConversations();
      }, closeDelay);
    }

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [messages, selected?.id, isInternal, selectedClosed, user?.id, loadConversations]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setPendingFiles((prev) => [...prev, ...files]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const downloadAttachment = async (path: string, name?: string) => {
    const { data, error } = await supabase.storage.from("support-attachments").download(path);
    if (error || !data) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error?.message || "File unavailable",
      });
      return;
    }
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "attachment";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSendMessage = async (options?: { resolveAfter?: boolean }) => {
    if (!selected?.id || (!replyText.trim() && pendingFiles.length === 0) || !user) return;
    if (selectedClosed) {
      toast({
        variant: "destructive",
        title: "Conversation permanently closed",
        description:
          "You can’t send another message in this chat after 24 hours. You can still read it. To raise a fresh ticket, open Messages and click the New Chat floating dialogue button. If this is about results from the previous chat, start a new chat and include the Ticket ID or Approval Code from the old chat.",
      });
      return;
    }
    setSending(true);
    try {
      let mainAttachmentUrl: string | null = null;
      let mainAttachmentName: string | null = null;

      // 1. Upload first attachment if there are any
      if (pendingFiles.length > 0) {
        const file = pendingFiles[0];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${selected.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("support-attachments")
          .upload(storagePath, file, { upsert: false });
        if (uploadError) throw new Error(`Upload error for ${file.name}: ${uploadError.message}`);

        mainAttachmentUrl = storagePath;
        mainAttachmentName = file.name;
      }

      // 2. Insert main text draft
      const bodyText = replyText.trim() || `Uploaded attachment: ${mainAttachmentName}`;
      const pendingId = `pending-${Date.now()}`;
      const createdAt = new Date().toISOString();
      if (bodyText) {
        setMessages((prev) => [
          ...prev,
          {
            id: pendingId,
            conversation_id: selected.id,
            sender_id: user.id,
            sender_role: role,
            sender_name: user.user_metadata?.full_name || role,
            body: bodyText,
            attachment_url: mainAttachmentUrl,
            attachment_name: mainAttachmentName,
            is_internal: isPrivateNoteState,
            message_type: isPrivateNoteState ? "internal_note" : "message",
            created_at: createdAt,
            pending: true,
          },
        ]);
      }
      const { data: sentMessage, error: sendError } = await supabase.rpc("send_support_message" as any, {
        _conversation_id: selected.id,
        _body: bodyText,
        _is_internal: isPrivateNoteState,
        _attachment_url: mainAttachmentUrl,
        _attachment_name: mainAttachmentName,
      });

      if (sendError) {
        setMessages((prev) => prev.filter((msg) => msg.id !== pendingId));
        throw sendError;
      }
      if (sentMessage) {
        const nextRequestTicketStatus =
          isRequestSupportTicket(selected) && !isPrivateNoteState
            ? sentMessage.sender_role === "hospital"
              ? "awaiting_insurer_response"
              : "awaiting_hospital_response"
            : selected.request_ticket_status;
        setMessages((prev) => prev.map((msg) => (msg.id === pendingId ? sentMessage : msg)));
        setSelected((prev: any) =>
          prev
            ? {
                ...prev,
                last_message: isPrivateNoteState ? "[Internal note]" : bodyText,
                last_message_at: (sentMessage as any)?.created_at,
                request_ticket_status: nextRequestTicketStatus,
              }
            : prev
        );
      }

      // 3. Upload & Dispatch other files in the queue
      if (pendingFiles.length > 1) {
        for (let i = 1; i < pendingFiles.length; i++) {
          const file = pendingFiles[i];
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${selected.id}/${Date.now()}-${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("support-attachments")
            .upload(storagePath, file, { upsert: false });
          if (uploadError) {
            toast({
              variant: "destructive",
              title: "Attachment failed",
              description: `Could not send ${file.name}`,
            });
            continue;
          }

          await supabase.rpc("send_support_message" as any, {
            _conversation_id: selected.id,
            _body: `Attachment: ${file.name}`,
            _is_internal: isPrivateNoteState,
            _attachment_url: storagePath,
            _attachment_name: file.name,
          });
        }
      }

      setReplyText("");
      setPendingFiles([]);

      // Auto-reopen ticket if status is closed but still within 24hr window
      if (isStatusClosed && !selectedClosed && !isPrivateNoteState) {
        await updateConversation({ status: "reopened" });
      }

      if (options?.resolveAfter && !isPrivateNoteState) {
        await updateConversation({
          status: "resolved",
          request_ticket_status: isRequestSupportTicket(selected)
            ? "resolved"
            : selected.request_ticket_status,
          last_message: bodyText,
          last_message_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Send failed", description: err.message });
    } finally {
      setSending(false);
    }
  };

  const handleAskAI = async () => {
    if (!selected?.id || !replyText.trim()) {
      toast({
        variant: "destructive",
        title: "Question required",
        description: "Type the question you want the automated support system to answer.",
      });
      return;
    }

    if (selectedClosed) {
      toast({
        variant: "destructive",
        title: "Conversation permanently closed",
        description:
          "This conversation was closed more than 24 hours ago. Please start a new conversation.",
      });
      return;
    }

    setAiLoading(true);
    try {
      const question = replyText.trim();
      const response = buildAiResponse(question, matchedRequest);
      const { data: aiMessage, error } = await (supabase as any).rpc("send_ai_support_message", {
        _conversation_id: selected.id,
        _body: response,
        _intent: isEscalationIntent(question) ? "human_escalation" : "general",
      });

      if (error) throw error;
      if (aiMessage) {
        setMessages((prev) => [...prev, aiMessage]);
        setSelected((prev: any) =>
          prev
            ? { ...prev, last_message: "[Automated System]", last_message_at: (aiMessage as any).created_at }
            : prev
        );
      }
      setReplyText("");
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Request failed", description: getErrorMessage(e) });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiFeedback = async (
    resolved: boolean,
    escalateToHuman: boolean,
    feedback?: string
  ) => {
    if (!selected?.id) return;
    const aiMessage = [...messages].reverse().find((msg) => msg.sender_role === "ai");
    try {
      const result = await (supabase as any).rpc("log_ai_feedback", {
        _conversation_id: selected.id,
        _message_id: aiMessage?.id || null,
        _resolved: resolved,
        _escalate_to_human: escalateToHuman,
        _feedback:
          feedback ||
          (escalateToHuman
            ? "Hospital requested human support."
            : resolved
            ? "Automated answer resolved the issue."
            : "Automated answer did not resolve the issue."),
      });

      if (result.error) throw result.error;

      if (escalateToHuman) {
        const { error: sendError } = await (supabase as any).rpc("send_support_message", {
          _conversation_id: selected.id,
          _body: "HUMAN SUPPORT REQUESTED: The hospital wants to speak with a support/human agent.",
          _is_internal: false,
        });
        if (sendError) throw sendError;
        toast({
          title: "Human support requested",
          description: "A Ronsberger HMO staff member can now take over this thread.",
        });
      } else {
        toast({
          title: "Feedback saved",
          description: resolved
            ? "Thanks for confirming the automated answer resolved the issue."
            : "Thanks. A staff member can review this if needed.",
        });
      }
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Feedback failed", description: getErrorMessage(e) });
    }
  };

  return (
    <div
      className={cn(
        "flex-1 flex flex-col h-full bg-[#F9FAFC] transition-all duration-300 relative",
        mobileSubView === "CHAT" ? "flex" : "hidden lg:flex"
      )}
    >
      {selected ? (
        <>
          {/* Compact Header bar */}
          <div className="border-b border-slate-150 bg-white px-3 py-2 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                {/* Mobile back navigation */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-7 w-7 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"
                  onClick={() => setMobileSubView("LIST")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>

                {selected.ticket_number && (
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded border-slate-200 bg-slate-100 text-slate-800 text-[10px] font-black uppercase px-1.5 py-0 tracking-wider"
                  >
                    {selected.ticket_number}
                  </Badge>
                )}
                <span className="text-slate-300 shrink-0 font-black">&middot;</span>
                <h2 className="text-sm font-semibold text-slate-800 truncate" title={selected.subject}>
                  {selected.subject}
                </h2>
              </div>

              {/* Collapsible controllers */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setLeftCollapsed(!leftCollapsed)}
                  className="hidden lg:flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-black tracking-wide text-slate-600 transition-all active:scale-95 shadow-sm uppercase"
                >
                  {leftCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                  <span>Chats</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRightCollapsed(false);
                    setMobileSubView("INFO");
                  }}
                  className="lg:hidden flex items-center gap-1 px-2 py-1 rounded border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-black tracking-wide transition-all active:scale-95 shadow-sm uppercase"
                >
                  <span>Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightCollapsed(!rightCollapsed)}
                  className={cn(
                    "hidden lg:flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-black tracking-wide transition-all active:scale-95 shadow-sm uppercase",
                    rightCollapsed
                      ? "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {rightCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                  <span>Details</span>
                </button>
              </div>
            </div>

            {/* SLA Due & Assignee Bar - Compact Inline */}
            {isInternal && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] select-none text-slate-650 bg-slate-50 p-1.5 rounded-md border border-slate-100">
                <div className="flex items-center gap-1">
                  <span className="font-bold uppercase text-slate-400">Owner:</span>
                  <Select
                    value={selected.assigned_to || "unassigned"}
                    onValueChange={(val) =>
                      updateConversation({
                        assigned_to: val === "unassigned" ? null : val,
                        assigned_by: user?.id,
                        assigned_at: new Date().toISOString(),
                      })
                    }
                  >
                    <SelectTrigger className="h-6 w-[100px] rounded bg-white border-slate-200 text-[10px] font-bold text-slate-700 shadow-sm px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-[10px] font-bold text-slate-450">UNASSIGNED</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.user_id} value={agent.user_id} className="text-[10px] font-bold">
                          {agent.full_name || agent.role.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="font-bold uppercase text-slate-400">Priority:</span>
                  <Select value={selected.priority || "normal"} onValueChange={(p) => updateConversation({ priority: p })}>
                    <SelectTrigger className="h-6 w-[75px] rounded bg-white border-slate-200 text-[10px] font-bold text-slate-700 shadow-sm px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["low", "normal", "high", "urgent"].map((item) => (
                        <SelectItem key={item} value={item} className="text-[10px] font-bold">
                          {item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="font-bold uppercase text-slate-400">Status:</span>
                  <Select value={selected.status || "open"} onValueChange={(s) => updateConversation({ status: s })}>
                    <SelectTrigger className="h-6 w-[100px] rounded bg-white border-slate-200 text-[10px] font-bold text-slate-700 shadow-sm px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "new", "open", "pending_customer_response", "waiting_internal_action", "resolved", "closed", "reopened", "pending"
                      ].map((item) => (
                        <SelectItem key={item} value={item} className="text-[10px] font-semibold">
                          {item.replace(/_/g, " ").toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  {!selected.assigned_to ? (
                    <button type="button" onClick={claimTicket} className="text-indigo-600 hover:text-indigo-800 font-bold border border-indigo-150 bg-indigo-50/50 hover:bg-indigo-50 px-1.5 py-0.5 rounded transition-all">Claim</button>
                  ) : selected.assigned_to !== user?.id ? (
                    <button type="button" onClick={claimTicket} className="text-slate-600 hover:text-slate-800 font-bold border border-slate-200 bg-white hover:bg-slate-50 px-1.5 py-0.5 rounded transition-all">Reassign</button>
                  ) : null}

                  {selected.sla_due_at && (
                    <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 font-bold uppercase border border-indigo-100 px-1.5 py-0.5 rounded">
                      SLA: {new Date(selected.sla_due_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2.5 bg-slate-50/40">
            {messages.map((msg) => (
              <MessageBubble 
                key={msg.id} 
                msg={msg} 
                isInternal={isInternal} 
                downloadAttachment={downloadAttachment} 
                handleAiFeedback={handleAiFeedback} 
              />
            ))}
          </div>
          <div className="border-t border-slate-200 bg-[#F9FAFC] p-3 md:p-4 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-mono font-bold rounded shadow-sm"
                  >
                    <FileText className="w-3 h-3 text-indigo-500" />
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="text-slate-400 hover:text-slate-900 ml-1 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 bg-white border border-slate-200/80 rounded-[20px] p-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all duration-300">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || selectedClosed}
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Textarea
                ref={replyTextareaRef}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={isPrivateNoteState ? "Draft internal memo..." : "Type a message..."}
                className="min-h-[36px] max-h-32 border-0 bg-transparent shadow-none focus-visible:ring-0 px-2 py-2 text-sm resize-none"
                disabled={sending || selectedClosed}
              />

              {isInternal && (
                <button
                  type="button"
                  onClick={() => setIsPrivateNoteState(!isPrivateNoteState)}
                  className={cn(
                    "h-9 px-2 rounded-lg flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors shrink-0",
                    isPrivateNoteState
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                  disabled={sending || selectedClosed}
                >
                  {isPrivateNoteState ? <Lock className="h-3.5 w-3.5" /> : "Reply"}
                </button>
              )}

              <Button
                type="button"
                onClick={handleAskAI}
                disabled={aiLoading || sending || !replyText.trim() || selectedClosed}
                className="h-9 w-9 p-0 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 shrink-0"
                title="Ask AI"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>

              <Button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={sending || (!replyText.trim() && pendingFiles.length === 0) || selectedClosed}
                className="h-9 px-4 rounded-[14px] bg-gradient-to-tr from-brand-600 to-indigo-500 hover:from-brand-700 hover:to-indigo-600 shadow-md shadow-brand-500/20 text-white shrink-0 transition-all duration-300 hover:scale-[1.02] active:scale-95"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-slate-400 font-medium bg-white">
          <MessageSquare className="w-12 h-12 text-slate-200 mb-4" />
          <p>Select a conversation to view details</p>
        </div>
      )}
    </div>
  );
}

