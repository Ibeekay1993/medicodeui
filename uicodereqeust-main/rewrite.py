import sys

path = r'c:\Users\WINDOWS\Downloads\Med code updated\uicodereqeust-main\src\components\support\SupportChatArea.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import
content = content.replace('} from "@/lib/support-helpers";', '} from "@/lib/support-helpers";\nimport { MessageBubble } from "./MessageBubble";')

# 2. Replace header
header_start = content.find('          {/* Active Header bar */}')
header_end = content.find('          <div ref={scrollRef} className="flex-1 overflow-y-auto')

new_header = '''          {/* Compact Header bar */}
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
                {selected.hospitals?.name && (
                  <Badge
                    variant="outline"
                    className="shrink-0 hidden sm:inline-flex rounded border-slate-200 bg-white text-slate-500 text-[10px] font-black px-1.5 py-0 tracking-wider"
                  >
                    {selected.hospitals.name.toUpperCase()}
                  </Badge>
                )}
                <h2 className="text-sm font-bold text-slate-800 truncate" title={selected.subject}>
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
          </div>\n\n'''
content = content[:header_start] + new_header + content[header_end:]

# 3. Replace message rendering
msg_start = content.find('            {messages.map((msg) => {')
msg_end = content.find('            {/* Closed / Resolved warnings */}')
new_msg = '''            {messages.map((msg) => (
              <MessageBubble 
                key={msg.id} 
                msg={msg} 
                isInternal={isInternal} 
                downloadAttachment={downloadAttachment} 
                handleAiFeedback={handleAiFeedback} 
              />
            ))}
'''
content = content[:msg_start] + new_msg + content[msg_end:]

# 4. Replace composer area
comp_start = content.find('          <div className="border-t border-slate-200 bg-white p-4">')
comp_end = content.find('        </>\n      ) : (')
new_comp = '''          <div className="border-t border-slate-200 bg-white/80 backdrop-blur-md p-3">
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

            <div className="flex items-end gap-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
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
                className="h-9 px-4 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shrink-0"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
'''
content = content[:comp_start] + new_comp + content[comp_end:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced successfully')
