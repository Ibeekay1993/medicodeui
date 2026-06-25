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
        title: "AI question required",
        description: "Type the question you want the AI assistant to answer.",
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
            ? { ...prev, last_message: "[AI Assistant]", last_message_at: (aiMessage as any).created_at }
            : prev
        );
      }
      setReplyText("");
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "AI failed", description: getErrorMessage(e) });
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
            ? "AI answer resolved the issue."
            : "AI answer did not resolve the issue."),
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
            ? "Thanks for confirming the AI answer resolved the issue."
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
        "flex-1 flex flex-col h-full bg-slate-50 transition-all duration-300 relative",
        mobileSubView === "CHAT" ? "flex" : "hidden lg:flex"
      )}
    >
      {selected ? (
        <>
          {/* Active Header bar */}
          <div className="border-b border-slate-150 bg-white p-3 shrink-0">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-1.5">
                {selected.ticket_number && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-slate-200 bg-slate-100 text-slate-800 text-xs font-black uppercase px-2 py-0.5 tracking-wider"
                  >
                    {selected.ticket_number}
                  </Badge>
                )}
                {selected.hospitals?.name && (
                  <Badge
                    variant="outline"
                    className="rounded-lg border-slate-200 bg-white text-slate-500 text-xs font-black px-2 py-0.5 tracking-wider"
                  >
                    {selected.hospitals.name.toUpperCase()}
                  </Badge>
                )}
              </div>

              {/* Collapsible controllers */}
              <div className="hidden lg:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLeftCollapsed(!leftCollapsed)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black tracking-wide text-slate-600 transition-all active:scale-95 shadow-sm uppercase"
                >
                  {leftCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronLeft className="w-3 h-3" />
                  )}
                  <span>Chats</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRightCollapsed(false);
                    setMobileSubView("INFO");
                  }}
                  className="lg:hidden flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-black tracking-wide transition-all active:scale-95 shadow-sm uppercase"
                >
                  <span>Details</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightCollapsed(!rightCollapsed)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-black tracking-wide transition-all active:scale-95 shadow-sm uppercase",
                    rightCollapsed
                      ? "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {rightCollapsed ? (
                    <ChevronRight className="w-3 h-3" />
                  ) : (
                    <ChevronLeft className="w-3 h-3" />
                  )}
                  <span>Details</span>
                </button>
              </div>

              {/* Mobile back navigation */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setMobileSubView("LIST")}
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </Button>
            </div>

            <div className="mt-2.5">
              <h2 className="text-sm font-black uppercase text-slate-900 tracking-tight leading-tight max-w-[280px] md:max-w-3xl truncate">
                {selected.subject}
              </h2>
            </div>
          </div>

          {/* SLA Due & Assignee Bar */}
          {isInternal && (
            <div className="flex flex-wrap items-center gap-y-2.5 gap-x-4 border-b border-slate-200 bg-white px-4 py-2.5 text-xs select-none text-slate-650 justify-between shadow-xs">
              <div className="flex flex-wrap items-center gap-3.5">
                {role === "admin" && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1">
                    <span className="font-mono text-xs font-black uppercase text-blue-500">
                      Assignment:
                    </span>
                    <span className="ml-1 text-xs font-black text-blue-900">
                      {selected.department || "General Support"} route
                      {selected.assigned_to ? " / assigned user" : " / unassigned"}
                      {selected.sla_due_at
                        ? ` / SLA ${new Date(selected.sla_due_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black uppercase text-slate-400">Owner:</span>
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
                    <SelectTrigger className="h-7 w-[125px] rounded-lg bg-slate-50 border-none text-xs font-extrabold text-slate-700 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-xs font-bold text-slate-450">
                        UNASSIGNED
                      </SelectItem>
                      {agents.map((agent) => (
                        <SelectItem
                          key={agent.user_id}
                          value={agent.user_id}
                          className="text-xs font-bold"
                        >
                          {agent.full_name || agent.role.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black uppercase text-slate-400">Priority:</span>
                  <Select
                    value={selected.priority || "normal"}
                    onValueChange={(p) => updateConversation({ priority: p })}
                  >
                    <SelectTrigger className="h-7 w-[85px] rounded-lg bg-slate-50 border-none text-xs font-extrabold text-slate-700 shadow-sm">
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

                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-black uppercase text-slate-400">Status:</span>
                  <Select
                    value={selected.status || "open"}
                    onValueChange={(s) => updateConversation({ status: s })}
                  >
                    <SelectTrigger className="h-7 w-[105px] rounded-lg bg-slate-50 border-none text-xs font-extrabold text-slate-700 shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "new",
                        "open",
                        "pending_customer_response",
                        "waiting_internal_action",
                        "resolved",
                        "closed",
                        "reopened",
                        "pending",
                      ].map((item) => (
                        <SelectItem key={item} value={item} className="text-xs font-semibold">
                          {item.replace(/_/g, " ").toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!selected.assigned_to ? (
                  <button
                    type="button"
                    onClick={claimTicket}
                    className="text-indigo-600 hover:text-indigo-800 font-mono text-xs font-black border border-indigo-150 bg-indigo-50/50 hover:bg-indigo-50 px-2 py-0.5 rounded-md transition-all shadow-xs"
                  >
                    Claim Ticket
                  </button>
                ) : selected.assigned_to !== user?.id ? (
                  <button
                    type="button"
                    onClick={claimTicket}
                    className="text-slate-655 hover:text-slate-800 font-mono text-xs font-black border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 rounded-md transition-all shadow-xs"
                  >
                    Reassign to Me
                  </button>
                ) : null}
              </div>

              {/* Auto close and SLA tags */}
              <div className="flex items-center gap-2">
                {selected.auto_close_at && !selectedClosed && (
                  <div className="flex items-center gap-1 bg-amber-50 text-amber-700 font-bold uppercase text-xs border border-amber-100 px-1.5 py-0.5 rounded-md">
                    <Clock className="h-2.5 w-2.5" /> Auto close:{" "}
                    {new Date(selected.auto_close_at).toLocaleDateString()}
                  </div>
                )}
                {selected.sla_due_at && (
                  <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 font-bold uppercase text-xs border border-indigo-100 px-1.5 py-0.5 rounded-md">
                    SLA Due: {new Date(selected.sla_due_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Message Rendering Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2.5 bg-slate-50/40">
            {messages.map((msg) => {
              if (msg.is_internal && !isInternal) return null;

              if (msg.sender_role === "system") {
                return (
                  <div
                    key={msg.id}
                    className="flex justify-center py-2 animate-in fade-in zoom-in duration-200"
                  >
                    <div className="bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-2xl px-5 py-3 max-w-xl text-center shadow-sm leading-relaxed">
                      <span className="text-slate-400 mr-2">⚙️</span>
                      {msg.body}
                      <div className="text-xs font-semibold text-slate-400 mt-1.5">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ·{" "}
                        {new Date(msg.created_at).toLocaleDateString([], {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              if (msg.sender_role === "ai") {
                return (
                  <div
                    key={msg.id}
                    className="flex justify-center py-2 animate-in fade-in zoom-in duration-200"
                  >
                    <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 text-slate-700 text-xs font-medium rounded-2xl px-5 py-4 max-w-2xl shadow-sm leading-relaxed">
                      <div className="flex items-center gap-2 mb-2 text-indigo-700">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-xs font-black uppercase tracking-widest">
                          Ronsberger HMO AI Assistant
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleAiFeedback(true, false)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100"
                        >
                          Resolved
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAiFeedback(false, true)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100"
                        >
                          Speak to Human
                        </button>
                      </div>
                      <div className="text-xs font-semibold text-slate-400 mt-2">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        ·{" "}
                        {new Date(msg.created_at).toLocaleDateString([], {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              const isMsgInternal = msg.is_internal || msg.message_type === "internal_note";
              const isMsgHospital = msg.sender_role === "hospital";

              // Avatar logic
              const senderName: string = msg.sender_name || msg.sender_role || "?";
              const avatarInitial = senderName.charAt(0).toUpperCase();
              const avatarBg = isMsgInternal
                ? "bg-amber-500"
                : isMsgHospital
                ? "bg-blue-600"
                : msg.sender_role === "nurse"
                ? "bg-emerald-600"
                : msg.sender_role === "claims"
                ? "bg-purple-600"
                : msg.sender_role === "admin"
                ? "bg-slate-800"
                : "bg-indigo-600";

              // Role badge labels
              const roleBadgeLabel = isMsgInternal
                ? "STAFF MEMO"
                : isMsgHospital
                ? "HOSPITAL"
                : msg.sender_role === "nurse"
                ? "UTIL MGR"
                : msg.sender_role === "claims"
                ? "CLAIMS"
                : msg.sender_role === "admin"
                ? "ADMIN"
                : msg.sender_role === "support"
                ? "SUPPORT"
                : "STAFF";

              const roleBadgeStyle = isMsgInternal
                ? "bg-amber-100 text-amber-800 border-amber-200"
                : isMsgHospital
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-slate-100 text-slate-700 border-slate-200";

              const cardBg = isMsgInternal
                ? "bg-amber-50 border-amber-300 border-l-4 border-l-amber-500 shadow-amber-100"
                : isMsgHospital
                ? "bg-white border-slate-200"
                : "bg-white border-slate-200";

              const senderEmail = senderName.includes("@") ? senderName : null;
              const displayName = senderEmail ? senderName.split("@")[0] : senderName;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-2xl border p-3 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-1 duration-200",
                    cardBg
                  )}
                >
                  {isMsgInternal && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-100 px-3 py-2">
                      <Lock className="h-3.5 w-3.5 text-amber-700" />
                      <span className="text-xs font-black uppercase tracking-widest text-amber-800">
                        Internal note - hidden from hospital
                      </span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm",
                          avatarBg
                        )}
                      >
                        {avatarInitial}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 leading-tight truncate">
                          {displayName}
                        </div>
                        {senderEmail && (
                          <div className="text-xs text-slate-400 font-medium truncate">
                            {senderEmail}
                          </div>
                        )}
                        {!senderEmail && msg.sender_role && (
                          <div className="text-xs text-slate-400 font-medium truncate">
                            {msg.sender_role}@medicode.com
                          </div>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md border",
                        roleBadgeStyle
                      )}
                    >
                      {roleBadgeLabel}
                    </span>
                  </div>

                  <div
                    className={cn(
                      "border-t mb-3",
                      isMsgInternal ? "border-amber-200" : "border-slate-100"
                    )}
                  />

                  <p className="whitespace-pre-wrap text-base font-normal leading-relaxed text-slate-800">
                    {msg.body}
                  </p>

                  {msg.attachment_url && (
                    <div className="mt-3 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => downloadAttachment(msg.attachment_url, msg.attachment_name)}
                        className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors group"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                        <span className="truncate max-w-[260px] underline-offset-2 group-hover:underline">
                          {msg.attachment_name || "Attachment"}
                        </span>
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-1.5">
                    {!isMsgHospital && !isMsgInternal && (
                      <CheckCheck className="h-3 w-3 text-emerald-500 opacity-70" />
                    )}
                    <span className="text-xs font-medium text-slate-400">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {new Date(msg.created_at).toLocaleDateString([], {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}

            {isStatusClosed && !selectedClosed && (
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-black uppercase tracking-widest text-amber-700 text-center shadow-xs">
                <ShieldAlert className="mr-2 inline h-4 w-4 text-amber-600" />
                This conversation was closed but can still be reopened within{" "}
                {Math.max(0, Math.ceil(24 - hoursSinceClosed))} hour(s). Send a reply to reopen.
              </div>
            )}
            {selectedClosed && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs font-black uppercase tracking-widest text-rose-700 text-center shadow-xs">
                <AlertCircle className="mr-2 inline h-4 w-4 text-rose-600" />
                You can’t send another message in this chat anymore (24 hours limit). You can still
                read the thread.
                <div className="mt-2 text-xs leading-relaxed font-extrabold tracking-wide normal-case text-rose-800 uppercase">
                  To raise a fresh ticket: open <span className="font-black">Messages</span> and
                  click the <span className="font-black">New Chat</span> floating dialogue button.
                  <br />
                  If this is about results linked to an older message, start a new chat and include
                  the <span className="font-black">Ticket ID</span> or{" "}
                  <span className="font-black">Approval Code</span> from the previous chat.
                </div>
              </div>
            )}
          </div>

          {/* Typing Controls Area */}
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              {isInternal && (
                <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200/40 rounded-xl w-fit select-none">
                  <button
                    type="button"
                    onClick={() => setIsPrivateNoteState(false)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg font-bold uppercase text-xs tracking-wider transition-all border",
                      !isPrivateNoteState
                        ? "bg-white text-blue-900 border-slate-250 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 border-transparent bg-transparent"
                    )}
                  >
                    💬 Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivateNoteState(true)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg font-bold uppercase text-xs tracking-wider transition-all border flex items-center gap-1",
                      isPrivateNoteState
                        ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                        : "text-slate-500 hover:text-amber-700 border-transparent bg-transparent"
                    )}
                  >
                    <Lock className="h-3.5 w-3.5" /> Memo
                  </button>
                </div>
              )}

              {isInternal && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Status:
                  </span>
                  <Select
                    value={selected?.status || "open"}
                    onValueChange={async (s) => {
                      if (s === "resolved" && (replyText.trim() || pendingFiles.length > 0)) {
                        await handleSendMessage({ resolveAfter: true });
                      } else {
                        await updateConversation({ status: s });
                      }
                    }}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-7 w-[120px] rounded-lg border text-xs font-black uppercase tracking-wide shadow-sm",
                        selected?.status === "open" ||
                          selected?.status === "new" ||
                          selected?.status === "reopened"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : selected?.status?.includes("pending")
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : ["closed", "resolved"].includes(selected?.status || "")
                          ? "bg-slate-100 text-slate-500 border-slate-200"
                          : "bg-slate-50 text-slate-700 border-slate-200"
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["open", "pending_customer_response", "waiting_internal_action", "resolved", "closed"].map((s) => (
                        <SelectItem key={s} value={s} className="text-xs font-semibold">
                          {s.replace(/_/g, " ").toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 bg-slate-50/50 p-2 border border-slate-100 rounded-xl">
                {pendingFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200/70 text-slate-700 text-xs font-mono font-bold rounded-lg shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
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

            <div className="flex gap-2.5 items-end">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="flex-1 relative">
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
                  placeholder={
                    isPrivateNoteState
                      ? "Draft internal audit memo (hidden from hospital)..."
                      : "Reply to hospital representative..."
                  }
                  className="min-h-[44px] max-h-48 rounded-xl border-slate-200 text-sm text-slate-800 focus-visible:ring-brand-500/20 py-3 bg-white border resize-none shadow-sm overflow-y-auto"
                  disabled={sending}
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all shadow-xs border border-slate-200/50 shrink-0"
                title="Attach referral or billing files..."
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                onClick={handleAskAI}
                disabled={aiLoading || sending || !replyText.trim() || selectedClosed}
                className="h-11 w-auto px-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 shadow-md shadow-indigo-900/10 shrink-0"
                title="Ask AI Assistant"
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>

              <Button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={sending || (!replyText.trim() && pendingFiles.length === 0)}
                className="h-11 w-auto px-5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 shadow-md shadow-slate-900/10 shrink-0"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1.5" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-center text-slate-400 bg-white p-8 select-none">
          <div className="h-20 w-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-400 mb-5 shadow-inner">
            <MessageSquare className="h-8 w-8 text-brand-600" />
          </div>
          <h3 className="text-base font-bold text-slate-700 tracking-tight">Your Message Center</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-xs leading-relaxed">
            Pick a conversation from the left to start messaging, or create a new ticket.
          </p>
          <Button
            size="sm"
            onClick={onNewTicketClick}
            className="mt-5 h-10 rounded-xl bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700 transition-all shadow-md"
          >
            <Plus className="mr-2 h-4 w-4" /> New Conversation
          </Button>
        </div>
      )}
    </div>
  );
}
