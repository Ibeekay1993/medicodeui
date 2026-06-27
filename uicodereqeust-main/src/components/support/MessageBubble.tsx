import React from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Lock, CheckCheck, Paperclip } from "lucide-react";

interface MessageBubbleProps {
  msg: any;
  isInternal: boolean;
  downloadAttachment: (path: string, name?: string) => void;
  handleAiFeedback: (resolved: boolean, escalate: boolean) => void;
}

export function MessageBubble({
  msg,
  isInternal,
  downloadAttachment,
  handleAiFeedback,
}: MessageBubbleProps) {
  if (msg.is_internal && !isInternal) return null;

  const timeString = new Date(msg.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateString = new Date(msg.created_at).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (msg.sender_role === "system") {
    return (
      <div className="flex justify-center py-2 animate-in fade-in zoom-in duration-200">
        <div className="bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium rounded-2xl px-4 py-2 max-w-xl text-center shadow-sm leading-relaxed">
          <span className="text-slate-400 mr-2">⚙️</span>
          {msg.body}
          <div className="text-[10px] font-semibold text-slate-400 mt-1">
            {timeString} · {dateString}
          </div>
        </div>
      </div>
    );
  }

  if (msg.sender_role === "ai") {
    return (
      <div className="flex justify-center py-2 animate-in fade-in zoom-in duration-200">
        <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 text-slate-700 text-xs font-medium rounded-2xl px-5 py-4 max-w-2xl shadow-sm leading-relaxed">
          <div className="flex items-center gap-2 mb-2 text-indigo-700">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">
              Automated Support System
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleAiFeedback(true, false)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Resolved
            </button>
            <button
              type="button"
              onClick={() => handleAiFeedback(false, true)}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-rose-700 hover:bg-rose-100 transition-colors"
            >
              Speak to Human
            </button>
          </div>
          <div className="text-[10px] font-semibold text-slate-400 mt-2">
            {timeString} · {dateString}
          </div>
        </div>
      </div>
    );
  }

  const isMsgInternal = msg.is_internal || msg.message_type === "internal_note";
  const isMsgHospital = msg.sender_role === "hospital";

  const senderName: string = msg.sender_name || msg.sender_role || "?";
  const senderEmail = senderName.includes("@") ? senderName : null;
  const displayName = senderEmail ? senderName.split("@")[0] : senderName;

  // Avatar logic
  const avatarInitial = displayName.charAt(0).toUpperCase();
  const avatarBg = isMsgInternal
    ? "bg-amber-500"
    : isMsgHospital
    ? "bg-blue-600"
    : msg.sender_role === "utilization_manager"
    ? "bg-emerald-600"
    : msg.sender_role === "claims"
    ? "bg-purple-600"
    : msg.sender_role === "admin"
    ? "bg-slate-800"
    : "bg-indigo-600";

  // Bubble styling (WhatsApp style)
  const isOwnMessage = isInternal ? !isMsgHospital : isMsgHospital;
  
  const bubbleBg = isMsgInternal
    ? "bg-amber-50 border-amber-200 border-l-4 border-l-amber-500 text-amber-900"
    : isOwnMessage
    ? "bg-brand-600 text-white shadow-brand-900/10"
    : "bg-white border border-slate-200 text-slate-800 shadow-sm";

  const textColor = isOwnMessage && !isMsgInternal ? "text-white" : "text-slate-800";
  const timeColor = isOwnMessage && !isMsgInternal ? "text-brand-200" : "text-slate-400";

  return (
    <div className={cn("flex w-full animate-in fade-in slide-in-from-bottom-1 duration-200 my-1", isOwnMessage ? "justify-end" : "justify-start")}>
      <div className={cn("flex gap-2 max-w-[85%] md:max-w-[75%]", isOwnMessage ? "flex-row-reverse" : "flex-row")}>
        
        {/* Avatar */}
        <div className="shrink-0 flex flex-col justify-end mb-1">
           <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-sm",
              avatarBg
            )}
          >
            {avatarInitial}
          </div>
        </div>

        {/* Message Bubble */}
        <div className="flex flex-col gap-1 min-w-[60px]">
          {/* Inline Name + Time */}
          <div className={cn("flex items-center gap-1.5 px-1 mb-0.5", isOwnMessage ? "justify-end flex-row-reverse" : "justify-start")}>
            <span className="text-[11px] font-semibold text-slate-700">{displayName}</span>
            <span className="text-[10px] font-medium text-slate-400">{timeString}</span>
            {isMsgInternal && <span className="text-[10px] font-bold text-amber-600">(Internal)</span>}
          </div>
          
          <div
            className={cn(
              "px-3 py-2 rounded-2xl relative",
              bubbleBg,
              isOwnMessage ? "rounded-br-sm" : "rounded-bl-sm"
            )}
          >
            {isMsgInternal && (
              <div className="mb-2 flex items-center gap-1.5 pb-2 border-b border-amber-200/50">
                <Lock className="h-3 w-3 text-amber-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Staff Memo
                </span>
              </div>
            )}

            <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed break-words", textColor)}>
              {msg.body}
            </p>

            {msg.attachment_url && (
              <div className={cn("mt-2 p-2 rounded-xl border flex items-center justify-between gap-3", isOwnMessage && !isMsgInternal ? "bg-brand-700/50 border-brand-500" : "bg-slate-50 border-slate-200")}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className={cn("p-1.5 rounded-lg shrink-0", isOwnMessage && !isMsgInternal ? "bg-brand-500 text-white" : "bg-indigo-100 text-indigo-600")}>
                     <Paperclip className="h-4 w-4" />
                  </div>
                  <span className={cn("text-xs font-medium truncate max-w-[180px]", isOwnMessage && !isMsgInternal ? "text-brand-50" : "text-slate-700")}>
                    {msg.attachment_name || "Attachment"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadAttachment(msg.attachment_url, msg.attachment_name)}
                  className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-colors", 
                    isOwnMessage && !isMsgInternal ? "bg-brand-500 hover:bg-brand-400 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                  )}
                >
                  Download
                </button>
              </div>
            )}

            <div className={cn("mt-1 flex items-center justify-end gap-1", timeColor)}>
              <span className="text-[10px] font-medium leading-none">
                {timeString}
              </span>
              {/* Read receipt checkmarks for own messages */}
              {isOwnMessage && !isMsgInternal && (
                <CheckCheck className={cn("h-3 w-3", "opacity-70")} />
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
